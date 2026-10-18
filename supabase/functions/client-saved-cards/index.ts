import { createClient } from 'npm:@supabase/supabase-js@2.100.0';
import Stripe from 'npm:stripe@17.4.0';
import {
  findStripeCustomer,
  forgetStripeCustomer,
  getOrCreateStripeCustomer,
  isMissingStripeCustomer,
} from '../_shared/stripeCustomer.ts';

// A client's saved cards, for the Payment Methods screen.
//
//   list   → the caller's saved cards (brand, last 4, expiry), read live from
//            Stripe. CERVICED stores none of it.
//   setup  → what the Payment Sheet needs to save a new card: the Customer, a
//            short-lived ephemeral key over it, and a SetupIntent secret.
//   remove → detach one of the caller's own cards.
//
// Cards are saved for faster ON-SESSION checkout only: the client is always
// present and taps Pay. Nothing here sets up off-session use, and no code
// path charges a saved card without the client. Off-session charges (e.g.
// late / no-show fees) need their own consent record, SCA fallback and
// dispute route first — see LEGAL-COMPLIANCE-NOTES.md.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Must match create-payment-intent: the ephemeral keys both return are read
// by the same mobile SDK (@stripe/stripe-react-native 0.64).
const STRIPE_API_VERSION = '2024-12-18.acacia';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: STRIPE_API_VERSION,
  httpClient: Stripe.createFetchHttpClient(),
});

// A client with more than this many cards is not a real case; it bounds the
// Stripe list call all the same.
const SAVED_CARD_LIMIT = 20;

interface RequestBody {
  action?: 'list' | 'setup' | 'remove';
  paymentMethodId?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: 'Invalid session' }, 401);

    const body: RequestBody = await req.json().catch(() => ({}));

    if (body.action === 'list') {
      // Don't create a Customer just to show an empty list.
      const customerId = await findStripeCustomer(supabase, user.id);
      if (!customerId) return json({ cards: [] });
      let methods: Stripe.ApiList<Stripe.PaymentMethod>;
      try {
        methods = await stripe.paymentMethods.list({
          customer: customerId, type: 'card', limit: SAVED_CARD_LIMIT,
        });
      } catch (err) {
        if (!isMissingStripeCustomer(err)) throw err;
        // Stripe no longer has this Customer: forget it, so the next save
        // makes a fresh one, and show an empty list rather than an error.
        const admin = createClient(
          Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );
        await forgetStripeCustomer(admin, user.id, customerId);
        return json({ cards: [] });
      }
      const cards = methods.data.flatMap((pm) => pm.card ? [{
        id: pm.id,
        brand: pm.card.brand,
        last4: pm.card.last4,
        expMonth: pm.card.exp_month,
        expYear: pm.card.exp_year,
        wallet: pm.card.wallet?.type ?? null,
      }] : []);
      return json({ cards });
    }

    if (body.action === 'setup') {
      const admin = createClient(
        Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const customerId = await getOrCreateStripeCustomer(supabase, admin, stripe, {
        id: user.id, email: user.email,
      });
      const [ephemeralKey, setupIntent] = await Promise.all([
        stripe.ephemeralKeys.create({ customer: customerId }, { apiVersion: STRIPE_API_VERSION }),
        stripe.setupIntents.create({
          customer: customerId,
          usage: 'on_session',
          payment_method_types: ['card'],
          metadata: { user_id: user.id },
        }),
      ]);
      return json({
        customerId,
        ephemeralKeySecret: ephemeralKey.secret,
        setupIntentClientSecret: setupIntent.client_secret,
        livemode: setupIntent.livemode,
      });
    }

    if (body.action === 'remove') {
      if (typeof body.paymentMethodId !== 'string' || !body.paymentMethodId.startsWith('pm_')) {
        return json({ error: 'Invalid card' }, 400);
      }
      const customerId = await findStripeCustomer(supabase, user.id);
      const pm = await stripe.paymentMethods.retrieve(body.paymentMethodId).catch(() => null);
      // Only ever detach a card that hangs off the caller's own Customer.
      const owner = typeof pm?.customer === 'string' ? pm.customer : pm?.customer?.id;
      if (!customerId || !pm || owner !== customerId) {
        return json({ error: 'That card is no longer saved.' }, 404);
      }
      await stripe.paymentMethods.detach(pm.id);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error(`[client-saved-cards] fatal: ${String(err)}`);
    // Friendly to the client, real reason in the logs (error-message-sweep).
    return json({ error: 'Could not load your saved cards. Please try again.' }, 500);
  }
});
