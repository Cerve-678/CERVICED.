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
  paymentIntentId: string;
  // 'capture' after the booking is successfully created (money actually
  // moves); 'cancel' if booking creation failed (releases the card hold,
  // nothing is ever charged). See create-payment-intent's capture_method
  // comment for why this two-step exists.
  action: 'capture' | 'cancel';
  // Pounds. Only meaningful with action:'capture'. A multi-service cart
  // checkout can partially fail (some bookings persist, others don't) —
  // omitting this captures the full authorised amount as before; passing
  // less than the full amount does a Stripe partial capture (only the
  // succeeded services' share is actually charged) and Stripe itself
  // releases the remaining authorised amount, so failed services are
  // never charged for.
  amount?: number;
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
    if (!body.paymentIntentId || (body.action !== 'capture' && body.action !== 'cancel')) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Ownership check — the PaymentIntent's metadata.user_id was stamped by
    // create-payment-intent at creation time, so this confirms the caller
    // finalising it is the same user who started it.
    const existing = await stripe.paymentIntents.retrieve(body.paymentIntentId);
    if (existing.metadata?.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Not your payment' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let action = body.action;
    let captureOptions: Stripe.PaymentIntentCaptureParams | undefined;
    if (body.action === 'capture' && typeof body.amount === 'number') {
      const requestedCapture = Math.round(body.amount * 100);
      if (requestedCapture <= 0) {
        return new Response(JSON.stringify({ error: 'Invalid capture amount' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Never trust the client's claimed amount on its own — a partial
      // capture is only requested on a partial checkout failure, i.e. the
      // client is asserting "only these bookings actually persisted". Verify
      // that against the bookings this same intent actually paid for
      // (RLS-scoped to this user via the forwarded auth header, so this can
      // only ever sum the caller's own rows) rather than trusting the
      // client's arithmetic — otherwise a buggy (not just malicious) client
      // could capture money for services that were never actually booked,
      // which is the exact mismatch this partial-capture path exists to
      // prevent in the first place.
      const { data: paidBookings } = await supabase
        .from('bookings')
        .select('amount_paid')
        .eq('payment_intent_id', body.paymentIntentId);
      const dbConfirmedPence = Math.round(
        (paidBookings ?? []).reduce((sum, b) => sum + Number(b.amount_paid ?? 0), 0) * 100
      );
      const amountToCapture = Math.min(requestedCapture, existing.amount, dbConfirmedPence);
      if (amountToCapture <= 0) {
        // Nothing this intent paid for actually persisted — there's nothing
        // to charge for, so release the whole hold instead of attempting a
        // zero-amount capture.
        action = 'cancel';
      } else {
        captureOptions = { amount_to_capture: amountToCapture };
      }
    }

    const paymentIntent = action === 'capture'
      ? await stripe.paymentIntents.capture(body.paymentIntentId, captureOptions)
      : await stripe.paymentIntents.cancel(body.paymentIntentId);

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
