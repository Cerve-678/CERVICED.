import { createClient } from 'npm:@supabase/supabase-js@2.100.0';
import Stripe from 'npm:stripe@17.4.0';
import { getOrCreateStripeCustomer } from '../_shared/stripeCustomer.ts';
import { recordTipPaid } from '../_shared/recordTipPaid.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-12-18.acacia', httpClient: Stripe.createFetchHttpClient() });
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
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
      await recordTipPaid(admin, stripe, tip.id, tip.payment_intent_id);
      return json({ status: 'processing' });
    }
    if (body?.action !== 'start' || typeof body.bookingId !== 'string' || !Number.isInteger(body.amountPence) || body.amountPence < 100 || body.amountPence > 50000) return json({ error: 'Choose a tip between £1 and £500.' }, 400);
    const { data: booking } = await admin.from('bookings').select('id, user_id, provider_id, status').eq('id', body.bookingId).maybeSingle();
    if (!booking || booking.user_id !== user.id || booking.status !== 'completed') return json({ error: 'Tips are available after a completed appointment.' }, 409);
    const { data: provider } = await admin.from('providers').select('id, stripe_account_id, stripe_payouts_enabled').eq('id', booking.provider_id).maybeSingle();
    if (!provider?.stripe_account_id || !provider.stripe_payouts_enabled) return json({ error: 'This provider cannot receive online tips yet.' }, 409);
    const { data: existing } = await admin.from('booking_tips').select('id, status, amount_pence, payment_intent_id').eq('booking_id', booking.id).maybeSingle();
    if (existing?.status === 'succeeded') return json({ error: 'This appointment has already been tipped.' }, 409);
    let tip = existing;
    if (!tip) {
      const { data, error } = await admin.from('booking_tips').insert({ booking_id: booking.id, provider_id: provider.id, client_user_id: user.id, amount_pence: body.amountPence }).select('id, status, amount_pence, payment_intent_id').single();
      if (error) throw error;
      tip = data;
    } else if (tip.amount_pence !== body.amountPence || tip.status === 'failed') {
      const { data, error } = await admin.from('booking_tips').update({ amount_pence: body.amountPence, status: 'pending', payment_intent_id: null, failure_reason: null }).eq('id', tip.id).eq('status', tip.status).select('id, status, amount_pence, payment_intent_id').single();
      if (error) throw error;
      tip = data;
    }
    let intent = tip.payment_intent_id ? await stripe.paymentIntents.retrieve(tip.payment_intent_id) : null;
    const customerId = await getOrCreateStripeCustomer(admin, stripe, user);
    if (!intent || intent.status === 'canceled') {
      intent = await stripe.paymentIntents.create({ amount: tip.amount_pence, currency: 'gbp', customer: customerId, payment_method_types: ['card'], metadata: { booking_tip_id: tip.id, booking_id: booking.id, provider_id: provider.id, user_id: user.id } }, { idempotencyKey: `booking_tip_${tip.id}` });
      const { error } = await admin.from('booking_tips').update({ payment_intent_id: intent.id }).eq('id', tip.id).is('payment_intent_id', null);
      if (error) throw error;
    }
    if (!intent.client_secret) throw new Error('Tip payment could not be started');
    const ephemeral = await stripe.ephemeralKeys.create({ customer: customerId }, { apiVersion: '2024-12-18.acacia' });
    return json({ tipId: tip.id, clientSecret: intent.client_secret, customerId, ephemeralKeySecret: ephemeral.secret, livemode: intent.livemode });
  } catch (error) {
    console.error(`[booking-tip] ${String(error)}`);
    return json({ error: 'Could not take this tip. Please try again.' }, 500);
  }
});
