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
  paymentIntentId: string;
  // 'capture' after the booking is successfully created (money actually
  // moves); 'cancel' if booking creation failed (releases the card hold,
  // nothing is ever charged). See create-payment-intent's capture_method
  // comment for why this two-step exists.
  action: 'capture' | 'cancel';
}

serve(async (req) => {
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
      await admin.from('bookings').update({ status: 'cancelled' })
        .eq('hold_batch_id', batch.id).eq('status', 'on_hold');
      await admin.from('checkout_batches').update({ status: 'cancelled' }).eq('id', batch.id);
      const paymentIntent = await stripe.paymentIntents.cancel(body.paymentIntentId);
      return new Response(JSON.stringify({ status: paymentIntent.status }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (batch.status !== 'prepared' || new Date(batch.expires_at) <= new Date() || existing.status !== 'requires_capture') {
      return new Response(JSON.stringify({ error: 'Payment is not ready to finalise' }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { error: finaliseError } = await admin.rpc('finalize_checkout', {
      p_checkout_batch_id: batch.id,
      p_payment_intent_id: body.paymentIntentId,
    });
    if (finaliseError) throw finaliseError;
    const paymentIntent = await stripe.paymentIntents.capture(body.paymentIntentId);

    return new Response(
      JSON.stringify({ status: paymentIntent.status }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error(`[finalize-payment-intent] fatal: ${String(err)}`);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
