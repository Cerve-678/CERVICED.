import { createClient } from 'npm:@supabase/supabase-js@2.100.0';
import Stripe from 'npm:stripe@17.4.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-12-18.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

interface RequestBody {
  checkoutBatchId: string;
  currency?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Require a real signed-in user — verify_jwt on this function checks the
    // token is valid, this additionally confirms it resolves to a user row,
    // consistent with every other write path in the app.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: RequestBody = await req.json();
    if (!body.checkoutBatchId) {
      return new Response(JSON.stringify({ error: 'Invalid checkout' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: batch, error: batchError } = await supabase
      .from('checkout_batches')
      .select('id, amount_due, currency, status, expires_at, payment_intent_id')
      .eq('id', body.checkoutBatchId)
      .eq('user_id', user.id)
      .single();
    if (batchError || !batch || batch.status !== 'prepared' || new Date(batch.expires_at) <= new Date()) {
      return new Response(JSON.stringify({ code: 'checkout_expired', error: 'Checkout has expired. Please review your booking and try again.' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: holds, error: holdsError } = await admin.from('bookings')
      .select('provider_id').eq('hold_batch_id', batch.id).eq('status', 'on_hold');
    if (holdsError || !holds?.length) throw new Error('No active reservations');
    const providerIds = [...new Set(holds.map(row => row.provider_id))];
    const { data: providers, error: providersError } = await admin.from('providers')
      .select('id, stripe_account_id, stripe_payouts_enabled').in('id', providerIds);
    if (providersError || providers?.length !== providerIds.length ||
        providers.some(provider => !provider.stripe_account_id || !provider.stripe_payouts_enabled)) {
      return new Response(JSON.stringify({ code: 'provider_payments_unavailable', error: 'A provider has not finished online payment setup yet.' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Stripe only ever receives the database-calculated amount.
    const amountInPence = Math.round(Number(batch.amount_due) * 100);
    if (!Number.isSafeInteger(amountInPence) || amountInPence <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid amount' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const paymentIntent = batch.payment_intent_id
      ? await stripe.paymentIntents.retrieve(batch.payment_intent_id)
      : await stripe.paymentIntents.create({
      amount: amountInPence,
      currency: batch.currency,
      metadata: { user_id: user.id, checkout_batch_id: batch.id },
      payment_method_types: ['card'],
      // The sheet authorises only. Server settlement captures, then confirms
      // the reserved bookings; signed webhooks recover interrupted requests
      // and refund captured payments whose reservations became unavailable.
      capture_method: 'manual',
    }, { idempotencyKey: `checkout_create_${batch.id}` });

    if (paymentIntent.status === 'canceled' || paymentIntent.status === 'succeeded') {
      return new Response(JSON.stringify({ error: 'This payment is already closed. Check your bookings.' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { error: bindError } = await admin.from('checkout_batches')
      .update({ payment_intent_id: paymentIntent.id })
      .eq('id', batch.id).eq('status', 'prepared')
      .is('payment_intent_id', null);
    if (bindError) throw bindError;
    const { data: bound, error: readError } = await admin.from('checkout_batches')
      .select('payment_intent_id, status').eq('id', batch.id).single();
    if (readError) throw readError;
    if (bound?.payment_intent_id !== paymentIntent.id || bound.status !== 'prepared') {
      throw new Error('Checkout is no longer available');
    }

    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        livemode: paymentIntent.livemode,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error(`[create-payment-intent] fatal: ${String(err)}`);
    return new Response(JSON.stringify({ error: 'Could not start payment. Please try again.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
