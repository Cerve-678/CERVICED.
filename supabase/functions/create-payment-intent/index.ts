import { createClient } from 'npm:@supabase/supabase-js@2.100.0';
import Stripe from 'npm:stripe@17.4.0';
import { getOrCreateStripeCustomer } from '../_shared/stripeCustomer.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Must match client-saved-cards: the ephemeral keys both return are read by
// the same mobile SDK.
const STRIPE_API_VERSION = '2024-12-18.acacia';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: STRIPE_API_VERSION,
  httpClient: Stripe.createFetchHttpClient(),
});

// Above this checkout total (fee included) PayPal isn't offered. PayPal costs
// CERVICED about 3.1% + 40p, and with the fee capped at £24.99 a larger PayPal
// payment loses money. Card, Apple Pay and Google Pay are always offered.
// The payment sheet hides its PayPal button by the same limit
// (PAYPAL_MAX_CHECKOUT_TOTAL in src/features/cart/platformFee.ts).
const PAYPAL_MAX_CHECKOUT_PENCE = 60000;

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
      .select('provider_id, late_fee_pence, no_show_fee_pence').eq('hold_batch_id', batch.id).eq('status', 'on_hold');
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

    // A provider with a late or no-show fee needs the card saved for an
    // off-session charge after the appointment — and the client's recorded
    // agreement (fee_consent_records, written by accept_checkout_fees before
    // this call), or nothing is saved for off-session use.
    const hasFees = holds.some(row => (row.late_fee_pence ?? 0) > 0 || (row.no_show_fee_pence ?? 0) > 0);
    if (hasFees) {
      const { data: consent, error: consentError } = await admin.from('fee_consent_records')
        .select('id').eq('checkout_batch_id', batch.id).eq('user_id', user.id).maybeSingle();
      if (consentError) throw consentError;
      if (!consent) {
        return new Response(JSON.stringify({ code: 'fee_consent_required', error: 'Please agree to the provider\'s late and no-show fees to continue.' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Stripe only ever receives the database-calculated amount.
    const amountInPence = Math.round(Number(batch.amount_due) * 100);
    if (!Number.isSafeInteger(amountInPence) || amountInPence <= 0) {
      return new Response(JSON.stringify({ error: 'Invalid amount' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Every checkout uses the client's Stripe Customer, so the Payment Sheet
    // lists their saved cards and can offer to save a new one. Only a checkout
    // with agreed fees saves the card for off-session use; without fees no
    // code path charges a saved card without the client present. UNVERIFIED:
    // with the ephemeral-key Payment Sheet, the sheet's own "save" checkbox
    // may confirm with setup_future_usage=off_session. Check a checkout-saved
    // card in Stripe test mode before enabling payments; if so, move to a
    // Customer Session with payment_method_save_usage='on_session'.
    const customerId = await getOrCreateStripeCustomer(admin, stripe, {
      id: user.id, email: user.email,
    });

    let paymentIntent = batch.payment_intent_id
      ? await stripe.paymentIntents.retrieve(batch.payment_intent_id)
      : await stripe.paymentIntents.create({
      amount: amountInPence,
      currency: batch.currency,
      customer: customerId,
      metadata: { user_id: user.id, checkout_batch_id: batch.id },
      // PayPal only when nothing has to be saved for later (a late/no-show fee
      // is charged off-session by booking-fee, which charges cards only) and
      // the total is within PAYPAL_MAX_CHECKOUT_PENCE.
      // Apple Pay and Google Pay ride on 'card'.
      payment_method_types: hasFees || amountInPence > PAYPAL_MAX_CHECKOUT_PENCE ? ['card'] : ['card', 'paypal'],
      ...(hasFees ? { setup_future_usage: 'off_session' as const } : {}),
      // The sheet authorises only. Server settlement captures, then confirms
      // the reserved bookings; signed webhooks recover interrupted requests
      // and refund captured payments whose reservations became unavailable.
      capture_method: 'manual',
    }, { idempotencyKey: `checkout_create_saved_cards_${batch.id}` });

    // An intent started before saved cards shipped has no Customer; attach it
    // while it can still change, so the sheet's saved cards line up.
    if (!paymentIntent.customer && paymentIntent.status === 'requires_payment_method') {
      paymentIntent = await stripe.paymentIntents.update(paymentIntent.id, { customer: customerId });
    }

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

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId }, { apiVersion: STRIPE_API_VERSION },
    );

    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        livemode: paymentIntent.livemode,
        customerId,
        ephemeralKeySecret: ephemeralKey.secret,
        // What this intent can be confirmed with — the app shows a PayPal
        // button only when 'paypal' is in here (never for fee checkouts).
        paymentMethodTypes: paymentIntent.payment_method_types,
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
