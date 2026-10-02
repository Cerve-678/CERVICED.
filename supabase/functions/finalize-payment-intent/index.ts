import { settleCheckout } from '../_shared/settleCheckout.ts';
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
  paymentIntentId: string;
  // Capture and settle the server reservation, or cancel before authorisation.
  // Once authorised, completion belongs to the server and signed webhook.
  action: 'capture' | 'cancel';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
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
    if (!body.checkoutBatchId || !body.paymentIntentId || (body.action !== 'capture' && body.action !== 'cancel')) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Ownership check — the PaymentIntent's metadata.user_id was stamped by
    // create-payment-intent at creation time, so this confirms the caller
    // finalising it is the same user who started it.
    const existing = await stripe.paymentIntents.retrieve(body.paymentIntentId);
    if (existing.metadata?.user_id !== user.id || existing.metadata?.checkout_batch_id !== body.checkoutBatchId) {
      return new Response(JSON.stringify({ error: 'Not your payment' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: batch, error: batchError } = await supabase.from('checkout_batches')
      .select('id, amount_due, status, expires_at, payment_intent_id')
      .eq('id', body.checkoutBatchId).eq('user_id', user.id).single();
    if (batchError || !batch || batch.payment_intent_id !== body.paymentIntentId) {
      return new Response(JSON.stringify({ error: 'Checkout not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    if (body.action === 'cancel') {
      if (batch.status === 'finalised' || ['succeeded', 'processing', 'requires_capture'].includes(existing.status)) {
        return new Response(JSON.stringify({ error: 'Payment is being completed. Check your bookings.' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const paymentIntent = existing.status === 'canceled' ? existing : await stripe.paymentIntents.cancel(body.paymentIntentId);
      // Run as the authenticated caller so cancel_checkout can enforce batch
      // ownership. It deletes private on_hold rows instead of promoting the
      // "Reserving…" placeholder to a cancelled booking (and notification).
      const { error: cancelError } = await supabase.rpc('cancel_checkout', {
        p_checkout_batch_id: batch.id,
      });
      if (cancelError) throw cancelError;
      return new Response(JSON.stringify({ status: paymentIntent.status }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const status = await settleCheckout(admin, stripe, body.paymentIntentId);
    return new Response(JSON.stringify({ status }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(`[finalize-payment-intent] fatal: ${String(err)}`);
    return new Response(JSON.stringify({ error: 'Payment confirmation is pending. Check your bookings before trying again.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
