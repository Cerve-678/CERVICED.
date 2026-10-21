import { createClient } from 'npm:@supabase/supabase-js@2.100.0';
import Stripe from 'npm:stripe@17.4.0';
import { getOrCreateStripeCustomer } from '../_shared/stripeCustomer.ts';
import { recordTipPaid } from '../_shared/recordTipPaid.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-12-18.acacia', httpClient: Stripe.createFetchHttpClient() });
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const TIP_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Booking dates/times are UK wall-clock; the window is 48h after the end. */
function tipWindowOpen(date: string, time: string, now = Date.now()): boolean {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  if (![y, mo, d, h, mi].every(Number.isFinite)) return true;
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  // London's offset at that moment (0 in winter, +1h in summer).
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(asUtc)).map(p => [p.type, p.value]));
  const londonAsUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  const end = asUtc - (londonAsUtc - asUtc);
  return now < end + TIP_WINDOW_MS;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'Missing authorization' }, 401);
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return json({ error: 'Invalid session' }, 401);
    const body = await req.json();
    if (body?.action === 'confirm' && typeof body.tipId === 'string') {
      const { data: tip } = await admin.from('booking_tips').select('id, client_user_id, payment_intent_id, status').eq('id', body.tipId).maybeSingle();
      if (!tip || tip.client_user_id !== user.id) return json({ error: 'Tip not found' }, 404);
      if (tip.status === 'succeeded') return json({ status: 'succeeded' });
      if (!tip.payment_intent_id) return json({ error: 'Payment is not ready' }, 409);
      const recorded = await recordTipPaid(admin, stripe, tip.id, tip.payment_intent_id);
      return json({ status: recorded ? 'succeeded' : 'processing' });
    }
    if (body?.action !== 'start' || typeof body.bookingId !== 'string' || !Number.isInteger(body.amountPence) || body.amountPence < 100 || body.amountPence > 50000) return json({ error: 'Choose a tip between £1 and £500.' }, 400);
    const { data: booking } = await admin.from('bookings').select('id, user_id, provider_id, status, booking_date, booking_time, end_time').eq('id', body.bookingId).maybeSingle();
    if (!booking || booking.user_id !== user.id || booking.status !== 'completed') return json({ error: 'Tips are available after a completed appointment.' }, 409);
    if (!tipWindowOpen(booking.booking_date, booking.end_time ?? booking.booking_time)) return json({ error: 'Tipping closes 48 hours after the appointment.' }, 409);
    const { data: provider } = await admin.from('providers').select('id, stripe_account_id, stripe_payouts_enabled').eq('id', booking.provider_id).maybeSingle();
    if (!provider?.stripe_account_id || !provider.stripe_payouts_enabled) return json({ error: 'This provider cannot receive online tips yet.' }, 409);
    const { data: existing } = await admin.from('booking_tips').select('id, status, amount_pence, payment_intent_id').eq('booking_id', booking.id).maybeSingle();
    if (existing?.status === 'succeeded') return json({ error: 'This appointment has already been tipped.' }, 409);
    let tip = existing;
    if (!tip) {
      const { data, error } = await admin.from('booking_tips').insert({ booking_id: booking.id, provider_id: provider.id, client_user_id: user.id, amount_pence: body.amountPence }).select('id, status, amount_pence, payment_intent_id').single();
      if (error) throw error;
      tip = data;
    }
    const previousIntentId: string | null = tip.payment_intent_id;
    let intent = previousIntentId ? await stripe.paymentIntents.retrieve(previousIntentId) : null;
    if (intent?.status === 'succeeded') {
      // Paid but not yet recorded (webhook still in flight): record it, never charge twice.
      await recordTipPaid(admin, stripe, tip.id, intent.id);
      return json({ error: 'This appointment has already been tipped.' }, 409);
    }
    if (intent?.status === 'processing') return json({ error: 'Your last tip is still processing.' }, 409);
    if (tip.amount_pence !== body.amountPence || tip.status === 'failed' || (intent && intent.status !== 'canceled' && intent.amount !== body.amountPence)) {
      // A new amount always gets a new intent. Updating the open one in place
      // would keep its client_secret live, so a payment sheet already open
      // elsewhere could charge the new amount before the ledger caught up.
      // Cancelling kills the old secret; the swap below records the new one.
      if (intent && intent.status !== 'canceled') await stripe.paymentIntents.cancel(intent.id);
      intent = null;
      const { data, error } = await admin.from('booking_tips').update({ amount_pence: body.amountPence, status: 'pending', failure_reason: null }).eq('id', tip.id).eq('status', tip.status).select('id, status, amount_pence, payment_intent_id').single();
      if (error) throw error;
      tip = data;
    }
    const customerId = await getOrCreateStripeCustomer(admin, stripe, user);
    if (!intent || intent.status === 'canceled') {
      // The key names the intent being replaced, so a retry of the same
      // attempt dedupes but a replacement for a cancelled one is a new request.
      intent = await stripe.paymentIntents.create({ amount: tip.amount_pence, currency: 'gbp', customer: customerId, payment_method_types: ['card'], metadata: { booking_tip_id: tip.id, booking_id: booking.id, provider_id: provider.id, user_id: user.id } }, { idempotencyKey: `booking_tip_${tip.id}_${previousIntentId ?? 'first'}_${tip.amount_pence}` });
      const swap = admin.from('booking_tips').update({ payment_intent_id: intent.id }).eq('id', tip.id);
      const { data: swapped, error } = await (previousIntentId ? swap.eq('payment_intent_id', previousIntentId) : swap.is('payment_intent_id', null)).select('id');
      if (error) throw error;
      if (!swapped?.length) {
        // Another tap recorded a different intent first. Never hand out one the ledger doesn't know.
        await stripe.paymentIntents.cancel(intent.id).catch(() => {});
        return json({ error: 'Please try your tip again.' }, 409);
      }
    }
    if (!intent.client_secret) throw new Error('Tip payment could not be started');
    const ephemeral = await stripe.ephemeralKeys.create({ customer: customerId }, { apiVersion: '2024-12-18.acacia' });
    return json({ tipId: tip.id, clientSecret: intent.client_secret, customerId, ephemeralKeySecret: ephemeral.secret, livemode: intent.livemode });
  } catch (error) {
    console.error(`[booking-tip] ${String(error)}`);
    return json({ error: 'Could not take this tip. Please try again.' }, 500);
  }
});
