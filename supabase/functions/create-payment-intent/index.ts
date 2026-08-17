import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@17.4.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-12-18.acacia',
});

interface RequestBody {
  checkoutBatchId: string;
  currency?: string;
}

serve(async (req) => {
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
      return new Response(JSON.stringify({ error: 'Checkout has expired. Please review your booking and try again.' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (batch.payment_intent_id) {
      return new Response(JSON.stringify({ error: 'Payment has already been started for this checkout.' }), {
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

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInPence,
      currency: batch.currency ?? body.currency ?? 'gbp',
      metadata: { user_id: user.id, checkout_batch_id: batch.id },
      automatic_payment_methods: { enabled: true },
      // Manual capture: the Payment Sheet only authorises the card here —
      // funds aren't taken until finalize-payment-intent captures it, which
      // only happens after the booking is actually created. Otherwise a
      // booking-creation failure (double-booked slot, RLS rejection, etc.)
      // after a successful charge would leave the client paid with no
      // booking and nothing to refund it automatically.
      capture_method: 'manual',
    });

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { error: bindError } = await admin.from('checkout_batches')
      .update({ payment_intent_id: paymentIntent.id })
      .eq('id', batch.id)
      .is('payment_intent_id', null);
    if (bindError) {
      await stripe.paymentIntents.cancel(paymentIntent.id);
      throw bindError;
    }

    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error(`[create-payment-intent] fatal: ${String(err)}`);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
