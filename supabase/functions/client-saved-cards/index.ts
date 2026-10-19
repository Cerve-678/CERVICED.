import { createClient } from 'npm:@supabase/supabase-js@2.100.0';
import Stripe from 'npm:stripe@17.4.0';
import {
  findStripeCustomer,
  forgetStripeCustomer,
  getOrCreateStripeCustomer,
  isMissingStripeCustomer,
} from '../_shared/stripeCustomer.ts';
import { FEE_POSSIBLE_STATUSES, feeCardNeededUntilMs } from '../_shared/bookingFeePlan.ts';
import { londonWallTimeToUtcMs } from '../_shared/londonTime.ts';

// A client's saved cards, for the Payment Methods screen.
//
//   list   → the caller's saved cards (brand, last 4, expiry), read live from
//            Stripe. CERVICED stores none of it.
//   setup  → what the Payment Sheet needs to save a new card: the Customer, a
//            short-lived ephemeral key over it, and a SetupIntent secret.
//   remove → detach one of the caller's own cards.
//
// A card saved HERE is for faster ON-SESSION checkout only: the client is
// always present and taps Pay. The one off-session use is a late / no-show
// fee, and that card is saved at checkout by create-payment-intent, only
// after the client's agreement is recorded in fee_consent_records.

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
      const admin = createClient(
        Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const customerId = await findStripeCustomer(admin, user.id);
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
      const customerId = await getOrCreateStripeCustomer(admin, stripe, {
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
      const admin = createClient(
        Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const customerId = await findStripeCustomer(admin, user.id);
      const pm = await stripe.paymentMethods.retrieve(body.paymentMethodId).catch(() => null);
      // Only ever detach a card that hangs off the caller's own Customer.
      const owner = typeof pm?.customer === 'string' ? pm.customer : pm?.customer?.id;
      if (!customerId || !pm || owner !== customerId) {
        return json({ error: 'That card is no longer saved.' }, 404);
      }
      // User decision 2026-10-19: a card a client paid with at a checkout
      // with agreed late/no-show fees stays until 24h after that appointment.
      const neededUntil = await feeCardNeededUntil(admin, user.id, pm.id);
      if (neededUntil !== null) {
        return json({ code: 'card_needed_for_fee', until: ukLabel(neededUntil), error: 'This card is needed for an agreed fee.' }, 409);
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

// Bookings whose fee window could still be open are at most a couple of days
// old; this bounds the scan.
const FEE_CARD_LOOKBACK_DAYS = 3;
const FEE_CARD_BOOKING_LIMIT = 50;

/** The latest moment `paymentMethodId` is still needed for an agreed fee on
 *  one of the client's bookings, or null if it isn't. */
async function feeCardNeededUntil(
  admin: ReturnType<typeof createClient>,
  userId: string,
  paymentMethodId: string,
): Promise<number | null> {
  const since = new Date(Date.now() - FEE_CARD_LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const { data: bookings, error } = await admin.from('bookings')
    .select('id, status, booking_date, booking_time, end_time, late_fee_pence, no_show_fee_pence, payment_intent_id')
    .eq('user_id', userId)
    .gte('booking_date', since)
    .in('status', FEE_POSSIBLE_STATUSES)
    .not('payment_intent_id', 'is', null)
    .or('late_fee_pence.not.is.null,no_show_fee_pence.not.is.null')
    .limit(FEE_CARD_BOOKING_LIMIT);
  if (error) throw error;
  if (!bookings?.length) return null;

  const { data: charged, error: chargedError } = await admin.from('booking_fee_charges')
    .select('booking_id').in('booking_id', bookings.map(b => b.id)).neq('status', 'failed');
  if (chargedError) throw chargedError;
  const chargedIds = new Set((charged ?? []).map(c => c.booking_id as string));

  const nowMs = Date.now();
  const open = bookings.flatMap(b => {
    const until = feeCardNeededUntilMs({
      status: b.status,
      endMs: londonWallTimeToUtcMs(b.booking_date, b.end_time ?? b.booking_time),
      lateFeePence: b.late_fee_pence,
      noShowFeePence: b.no_show_fee_pence,
      alreadyCharged: chargedIds.has(b.id),
      nowMs,
    });
    return until === null ? [] : [{ intentId: b.payment_intent_id as string, until }];
  });
  if (!open.length) return null;

  // Which of those payments used this card. One Stripe read per distinct payment.
  const intentIds = [...new Set(open.map(o => o.intentId))];
  const intents = await Promise.all(intentIds.map(id => stripe.paymentIntents.retrieve(id)));
  const usedThisCard = new Set(intents
    .filter(pi => (typeof pi.payment_method === 'string' ? pi.payment_method : pi.payment_method?.id) === paymentMethodId)
    .map(pi => pi.id));
  const untils = open.filter(o => usedThisCard.has(o.intentId)).map(o => o.until);
  return untils.length ? Math.max(...untils) : null;
}

const UK_LABEL = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London', hour: 'numeric', minute: '2-digit', hour12: true,
  weekday: 'short', day: 'numeric', month: 'short',
});

/** e.g. "3:00pm on Thu 2 Jul", in UK time. */
function ukLabel(ms: number): string {
  const parts = UK_LABEL.formatToParts(new Date(ms));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '';
  return `${part('hour')}:${part('minute')}${part('dayPeriod').toLowerCase().replace(/\s|\./g, '')} on ${part('weekday')} ${part('day')} ${part('month')}`;
}
