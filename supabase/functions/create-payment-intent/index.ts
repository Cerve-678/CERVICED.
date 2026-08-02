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
  // Amount in pounds (e.g. 42.50) — converted to pence below. Stripe's API
  // takes the smallest currency unit, the app works in £ everywhere else.
  amount: number;
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
    if (!body.amount || body.amount <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid amount' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Note: amount is trusted from the client cart total here, same trust
    // model the rest of checkout already uses (base price/add-ons are only
    // revalidated on rebook, not at initial booking — see RUNBOOK-booking-audit.md).
    // Not a new gap introduced by adding Stripe.
    const amountInPence = Math.round(body.amount * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInPence,
      currency: body.currency ?? 'gbp',
      metadata: { user_id: user.id },
      automatic_payment_methods: { enabled: true },
      // Manual capture: the Payment Sheet only authorises the card here —
      // funds aren't taken until finalize-payment-intent captures it, which
      // only happens after the booking is actually created. Otherwise a
      // booking-creation failure (double-booked slot, RLS rejection, etc.)
      // after a successful charge would leave the client paid with no
      // booking and nothing to refund it automatically.
      capture_method: 'manual',
    });

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
