import { checkFeeEligibility, type FeeKind } from '../_shared/bookingFeePlan.ts';
import { londonWallTimeToUtcMs } from '../_shared/londonTime.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.100.0';
import Stripe from 'npm:stripe@17.4.0';
import { takeBackFromProvider } from '../_shared/takeBack.ts';

// Late-arrival and no-show fees (auto-memory late-and-no-show-fees-decision).
//
//   action 'charge' — the owning provider charges the fee the client agreed to
//     at checkout, to the card saved then, off-session. Rules live in
//     _shared/bookingFeePlan.ts. The amount always comes from the booking row.
//   action 'refund' — the owning provider refunds a fee in full, typically to
//     settle the client's dispute. CERVICED never decides a dispute: the client
//     raises it (dispute_booking_fee RPC), the provider refunds here or keeps it
//     (keep_disputed_booking_fee RPC).
//
// MONEY SAFETY
//   • One live fee per booking: the fee row is inserted BEFORE Stripe is called
//     and the partial unique index refuses a second, so two taps can't charge twice.
//   • The PaymentIntent's idempotency key is the fee row's id.
//   • CERVICED takes no cut: the provider's payout is the amount minus Stripe's
//     actual card fee, held 24h, then transferred by release-payouts.
//   • A card that needs the client present (declined / authentication_required)
//     marks the row failed — nothing is retried automatically.
//
// AUTH: the provider who owns the booking (their JWT). Never a client.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-12-18.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const PAYOUT_HOLD_MS = 24 * 60 * 60 * 1000;

type RequestBody =
  | { action: 'charge'; bookingId: string; kind: FeeKind }
  | { action: 'refund'; chargeId: string };

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization' }, 401);
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: 'Invalid session' }, 401);

    const { data: provider, error: providerError } = await admin.from('providers')
      .select('id, stripe_account_id, stripe_payouts_enabled').eq('user_id', user.id)
      .order('is_active', { ascending: false }).order('created_at', { ascending: true })
      .limit(1).maybeSingle();
    if (providerError) throw providerError;
    if (!provider) return json({ error: 'Only providers can manage fees.' }, 403);

    const body = await req.json() as RequestBody;
    if (body?.action === 'charge' && typeof body.bookingId === 'string' && (body.kind === 'late' || body.kind === 'no_show')) {
      return await charge(provider, body.bookingId, body.kind);
    }
    if (body?.action === 'refund' && typeof body.chargeId === 'string') {
      return await refund(provider, body.chargeId);
    }
    return json({ error: 'Invalid request' }, 400);
  } catch (err) {
    console.error(`[booking-fee] fatal: ${String(err)}`);
    return json({ error: 'Something went wrong with this fee. Please try again.' }, 500);
  }
});

interface ProviderRow { id: string; stripe_account_id: string | null; stripe_payouts_enabled: boolean | null }

async function charge(provider: ProviderRow, bookingId: string, kind: FeeKind): Promise<Response> {
  const { data: booking, error: bookingError } = await admin.from('bookings')
    .select('id, provider_id, user_id, status, booking_date, booking_time, end_time, late_fee_pence, no_show_fee_pence, payment_intent_id, provider_name_snapshot, service_name_snapshot')
    .eq('id', bookingId).maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking || booking.provider_id !== provider.id) return json({ error: 'Booking not found' }, 404);
  if (!provider.stripe_account_id || !provider.stripe_payouts_enabled) {
    return json({ error: 'Finish setting up payouts before charging fees.' }, 409);
  }

  const [{ data: batch, error: batchError }, { data: existing, error: existingError }] = await Promise.all([
    booking.payment_intent_id
      ? admin.from('checkout_batches').select('id').eq('payment_intent_id', booking.payment_intent_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin.from('booking_fee_charges').select('id').eq('booking_id', booking.id).neq('status', 'failed').limit(1),
  ]);
  if (batchError) throw batchError;
  if (existingError) throw existingError;

  // The client's recorded agreement for this checkout, and that it covers
  // this provider. The amount charged is the booking's frozen fee, which
  // accept_checkout_fees copied into the record from the same held rows.
  const { data: consent, error: consentError } = batch
    ? await admin.from('fee_consent_records').select('id, user_id, fees').eq('checkout_batch_id', batch.id).maybeSingle()
    : { data: null, error: null };
  if (consentError) throw consentError;
  // The agreed amount for this provider and fee kind; a charge above it (or
  // with no agreement covering this provider) is refused.
  type ConsentedFee = { provider_id?: string; late_fee_pence?: number | null; no_show_fee_pence?: number | null };
  const agreed = consent && consent.user_id === booking.user_id && Array.isArray(consent.fees)
    ? (consent.fees as ConsentedFee[]).find(fee => fee.provider_id === booking.provider_id)
    : undefined;
  const agreedPence = agreed ? (kind === 'late' ? agreed.late_fee_pence : agreed.no_show_fee_pence) ?? 0 : 0;
  const bookingPence = (kind === 'late' ? booking.late_fee_pence : booking.no_show_fee_pence) ?? 0;
  const consentCoversProvider = !!agreed && agreedPence > 0 && bookingPence <= agreedPence;

  // The card saved at checkout, and the Customer it was saved to, are on the
  // original payment.
  const original = booking.payment_intent_id
    ? await stripe.paymentIntents.retrieve(booking.payment_intent_id)
    : null;
  const customerId = typeof original?.customer === 'string' ? original.customer : original?.customer?.id ?? null;

  const eligibility = checkFeeEligibility({
    kind,
    status: booking.status,
    startMs: londonWallTimeToUtcMs(booking.booking_date, booking.booking_time),
    endMs: londonWallTimeToUtcMs(booking.booking_date, booking.end_time ?? booking.booking_time),
    lateFeePence: booking.late_fee_pence,
    noShowFeePence: booking.no_show_fee_pence,
    paidInApp: !!booking.payment_intent_id && !!customerId,
    clientConsented: consentCoversProvider,
    alreadyCharged: (existing?.length ?? 0) > 0,
    nowMs: Date.now(),
  });
  if (!eligibility.ok) return json({ error: eligibility.error }, 409);

  const paymentMethod = typeof original?.payment_method === 'string' ? original.payment_method : original?.payment_method?.id;
  if (!paymentMethod) return json({ error: "This client's saved card isn't available any more." }, 409);

  // Claim the booking first: the unique index stops a second tap here.
  const { data: row, error: insertError } = await admin.from('booking_fee_charges').insert({
    booking_id: booking.id, provider_id: provider.id, client_user_id: booking.user_id,
    kind, amount_pence: eligibility.amountPence, stripe_account_id: provider.stripe_account_id,
    fee_consent_record_id: consent!.id,
  }).select('id').single();
  if (insertError) {
    if (insertError.code === '23505') return json({ error: 'A fee has already been charged for this booking.' }, 409);
    throw insertError;
  }

  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.create({
      amount: eligibility.amountPence,
      currency: 'gbp',
      customer: customerId!,
      payment_method: paymentMethod,
      off_session: true,
      confirm: true,
      payment_method_types: ['card'],
      description: `${kind === 'late' ? 'Late arrival' : 'No-show'} fee — ${booking.provider_name_snapshot ?? 'CERVICED provider'}`,
      metadata: { fee_charge_id: row.id, booking_id: booking.id, kind, provider_id: provider.id },
      expand: ['latest_charge.balance_transaction'],
    }, { idempotencyKey: `booking_fee_${row.id}` });
  } catch (err) {
    // Card declined, or the bank wants the client present. Nothing was taken.
    const stripeError = err as Stripe.errors.StripeError;
    const reason = stripeError?.code ?? stripeError?.type ?? String(err);
    await admin.from('booking_fee_charges').update({
      status: 'failed', failure_reason: reason.slice(0, 500),
      payment_intent_id: stripeError?.payment_intent?.id ?? null,
    }).eq('id', row.id);
    if (stripeError?.type === 'StripeCardError') {
      return json({ code: 'fee_not_collected', error: "Couldn't collect this fee — the client's bank declined it or needs them to approve it." }, 402);
    }
    throw err;
  }

  if (intent.status !== 'succeeded') {
    await admin.from('booking_fee_charges').update({
      status: 'failed', failure_reason: `intent ${intent.status}`, payment_intent_id: intent.id,
    }).eq('id', row.id);
    return json({ code: 'fee_not_collected', error: "Couldn't collect this fee — the client's bank needs them to approve it." }, 402);
  }

  // CERVICED takes no cut: only Stripe's actual card fee comes off.
  const charge = intent.latest_charge as Stripe.Charge | null;
  const balance = charge?.balance_transaction as Stripe.BalanceTransaction | null;
  const stripeFee = typeof balance?.fee === 'number' ? balance.fee : null;
  const payout = stripeFee === null ? null : Math.max(0, eligibility.amountPence - stripeFee);
  const { error: updateError } = await admin.from('booking_fee_charges').update({
    status: 'succeeded', payment_intent_id: intent.id, charged_at: new Date().toISOString(),
    stripe_fee_pence: stripeFee, payout_pence: payout,
    // Without a known card fee the payout waits; the webhook can't price it either,
    // so it shows as 'pending' for follow-up rather than paying a guessed amount.
    payout_status: payout === null ? 'pending' : 'held',
    release_after: new Date(Date.now() + PAYOUT_HOLD_MS).toISOString(),
  }).eq('id', row.id);
  if (updateError) console.error(`[booking-fee] charged ${intent.id} but could not record fee ${row.id}: ${String(updateError.message ?? updateError)}`);

  const amount = `£${(eligibility.amountPence / 100).toFixed(2)}`;
  const providerName = booking.provider_name_snapshot?.trim() || 'Your provider';
  const { error: notifyError } = await admin.from('notifications').insert({
    user_id: booking.user_id,
    type: 'fee_charged',
    title: `${amount} ${kind === 'late' ? 'late arrival' : 'no-show'} fee charged`,
    message: `${providerName} charged the ${kind === 'late' ? 'late arrival' : 'no-show'} fee you agreed to when booking${booking.service_name_snapshot ? ` ${booking.service_name_snapshot}` : ''}. If you think it's wrong, you can dispute it within 7 days.`,
    priority: 'high',
    is_actionable: true,
    booking_id: booking.id,
    provider_id: provider.id,
    recipient_role: 'client',
    metadata: { fee_charge_id: row.id, amount_pence: eligibility.amountPence, kind },
  });
  if (notifyError) console.error(`[booking-fee] fee charged but notification failed: ${String(notifyError.message ?? notifyError)}`);

  return json({ status: 'charged', chargeId: row.id, amountPence: eligibility.amountPence }, 200);
}

async function refund(provider: ProviderRow, chargeId: string): Promise<Response> {
  const { data: fee, error } = await admin.from('booking_fee_charges')
    .select('id, booking_id, provider_id, client_user_id, kind, amount_pence, status, payment_intent_id, payout_status, stripe_transfer_id, disputed_at, dispute_resolved_at')
    .eq('id', chargeId).maybeSingle();
  if (error) throw error;
  if (!fee || fee.provider_id !== provider.id) return json({ error: 'Fee not found' }, 404);
  if (fee.status === 'refunded') return json({ status: 'refunded' }, 200);
  if (fee.status !== 'succeeded' || !fee.payment_intent_id) return json({ error: 'Only a charged fee can be refunded.' }, 409);

  const stripeRefund = await stripe.refunds.create(
    // fee_booking_id, not booking_id: reconcileRefund treats booking_id as a
    // refund of the BOOKING's payment and would reject (and Stripe retry) this one.
    { payment_intent: fee.payment_intent_id, metadata: { fee_charge_id: fee.id, fee_booking_id: fee.booking_id } },
    { idempotencyKey: `booking_fee_refund_${fee.id}` },
  );

  // Take the provider's share back: cancel a held payout, or reverse a paid one.
  let payoutStatus = fee.payout_status;
  if (fee.payout_status === 'held' || fee.payout_status === 'pending') {
    payoutStatus = 'cancelled';
  } else if (fee.payout_status === 'transferred' && fee.stripe_transfer_id) {
    await takeBackFromProvider(admin, stripe, {
      providerId: fee.provider_id, bookingId: fee.booking_id, source: 'fee_refund',
      transferId: fee.stripe_transfer_id, key: `booking_fee_reversal_${fee.id}`,
      metadata: { fee_charge_id: fee.id },
    });
    payoutStatus = 'reversed';
  }

  const openDispute = !!fee.disputed_at && !fee.dispute_resolved_at;
  const { error: updateError } = await admin.from('booking_fee_charges').update({
    status: 'refunded', stripe_refund_id: stripeRefund.id, payout_status: payoutStatus,
    ...(openDispute ? { dispute_outcome: 'refunded', dispute_resolved_at: new Date().toISOString() } : {}),
  }).eq('id', fee.id);
  if (updateError) console.error(`[booking-fee] refunded ${stripeRefund.id} but could not record it on ${fee.id}: ${String(updateError.message ?? updateError)}`);

  const { data: booking } = await admin.from('bookings').select('provider_name_snapshot').eq('id', fee.booking_id).maybeSingle();
  const amount = `£${(fee.amount_pence / 100).toFixed(2)}`;
  const { error: notifyError } = await admin.from('notifications').insert({
    user_id: fee.client_user_id,
    type: 'fee_dispute_resolved',
    title: `${amount} fee refunded`,
    message: `${booking?.provider_name_snapshot?.trim() || 'Your provider'} refunded the ${fee.kind === 'late' ? 'late arrival' : 'no-show'} fee. Your bank may take a few days to show it.`,
    priority: 'medium',
    is_actionable: false,
    booking_id: fee.booking_id,
    provider_id: fee.provider_id,
    recipient_role: 'client',
    metadata: { fee_charge_id: fee.id, outcome: 'refunded' },
  });
  if (notifyError) console.error(`[booking-fee] refunded but notification failed: ${String(notifyError.message ?? notifyError)}`);

  return json({ status: 'refunded' }, 200);
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
