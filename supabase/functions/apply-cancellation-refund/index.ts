import { reconcileRefund } from '../_shared/reconcileRefund.ts';
import { londonWallTimeToUtcMs } from '../_shared/londonTime.ts';
import {
  computeCancellationSettlement,
  type CancelPenalty,
} from '../_shared/cancellationSettlement.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.100.0';
import Stripe from 'npm:stripe@17.4.0';

// Live in Stripe TEST mode from 2026-10-03 (security-reviewed; migration
// 20261003100000 adds the partially_refunded status, the booking_refunds
// ledger and the cancelled_at/cancelled_by stamp this relies on). Run each
// penalty path (none / deposit / full, held AND already-released payout) in
// test mode before switching Stripe to live keys. See LEGAL-COMPLIANCE-NOTES.md §6.
//
// The MONEY HALF of a client cancellation, paired with the cancel action the
// same way refund-payment is (the cancel itself — status change + the DB
// triggers that notify / invite the waitlist — is owned by cancel_own_booking();
// this function must NOT touch booking.status or it risks double-notifying).
//
// Called by the client right after cancel_own_booking() succeeds. The client
// sends only the booking id — the refund and the provider's retained share are
// computed SERVER-SIDE from the booking's frozen policy + its stored payment
// figures, so the client cannot influence the amounts.
//
// Model (refund-only — never charges the client more than they paid):
//   • early cancel, or penalty 'none'  → full refund incl. fee; provider keeps nothing.
//   • late + 'deposit'                 → provider keeps the deposit, CERVICED keeps the fee, client refunded the rest.
//   • late + 'full'                    → provider keeps their whole share, CERVICED keeps the fee, client refunded nothing.
//
// It is SELF-CONTAINED on the payout side (it settles the provider directly)
// rather than leaning on release-payouts, whose safety checks deliberately
// refuse any cancelled/refunded booking.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-12-18.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

interface RequestBody {
  bookingId: string;
}

// Mirror of cancel_notice_hours() (SQL): an explicit column value wins, else the
// JSONB cancelNotice policy maps to hours, else there is no notice window.
function noticeHours(cancellationNoticeHours: unknown, policies: Record<string, unknown> | null): number {
  const col = Number(cancellationNoticeHours);
  if (Number.isFinite(col) && col > 0) return col;
  switch (policies?.['cancelNotice']) {
    case '24h': return 24;
    case '48h': return 48;
    case '72h': return 72;
    default: return 0;
  }
}

function readPenalty(value: unknown): CancelPenalty {
  return value === 'deposit' || value === 'full' ? value : 'none';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({ error: 'Missing authorization' }, 401);

    const body: RequestBody = await req.json();
    if (!body.bookingId) return json({ error: 'Invalid request' }, 400);

    // Authorise: must be the booking's own client.
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: 'Invalid session' }, 401);

    // Load the booking with the service role (private payment fields). We need
    // the frozen policy snapshot and the stored money figures.
    const { data: booking, error: bookingError } = await admin
      .from('bookings')
      .select('id, user_id, provider_id, status, cancelled_at, cancelled_by, payment_intent_id, amount_paid, deposit_amount, service_charge, payment_status, stripe_refund_id, booking_date, booking_time, policy_snapshot, provider_name_snapshot, service_name_snapshot, customer_name')
      .eq('id', body.bookingId)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) return json({ error: 'Booking not found' }, 404);
    if (booking.user_id !== user.id) return json({ error: 'You can only settle your own booking.' }, 403);

    // Only ever runs after the booking is actually cancelled — never a way to
    // refund a live booking.
    if (booking.status !== 'cancelled') {
      return json({ error: 'This booking is not cancelled.' }, 409);
    }
    // Only a CLIENT's own cancellation is settled by the policy. A provider
    // cancel is refunded in full by refund_booking_async; a booking cancelled
    // before cancelled_by existed has no trustworthy cancel time. Neither is
    // this function's to settle.
    if (booking.cancelled_by !== 'client' || !booking.cancelled_at) {
      return json({ status: 'not_eligible' }, 200);
    }
    // Idempotent: a settlement already happened.
    if (booking.stripe_refund_id || booking.payment_status === 'refunded' || booking.payment_status === 'partially_refunded') {
      return json({ status: 'already_settled' }, 200);
    }
    // Nothing captured (Stripe off, or a free booking) — clean cancel, no money.
    if (!booking.payment_intent_id || Number(booking.amount_paid) <= 0) {
      return json({ status: 'no_payment' }, 200);
    }

    // Effective policy for THIS booking: the frozen snapshot is what the client
    // agreed to; fall back to the provider's current policy for older bookings.
    const { data: provider, error: provErr } = await admin
      .from('providers')
      .select('cancellation_notice_hours, booking_policies, user_id, display_name')
      .eq('id', booking.provider_id)
      .maybeSingle();
    if (provErr) throw provErr;

    const snapshot = (booking.policy_snapshot ?? null) as Record<string, unknown> | null;
    const livePolicies = (provider?.booking_policies ?? null) as Record<string, unknown> | null;
    const penalty = readPenalty(snapshot?.['cancelPenalty'] ?? livePolicies?.['cancelPenalty']);
    const hours = noticeHours(provider?.cancellation_notice_hours, livePolicies);

    // booking_date/time are UK wall-clock; read as UTC they'd be an hour late
    // in summer, handing a late canceller an extra hour of notice.
    const apptMs = londonWallTimeToUtcMs(String(booking.booking_date), String(booking.booking_time));
    // Measured from WHEN they cancelled (stamped by the DB), never from when
    // this call arrives — otherwise waiting until after the appointment would
    // turn a late cancel into a full refund.
    const cancelledMs = Date.parse(booking.cancelled_at);
    const hoursUntil = Number.isFinite(apptMs) && Number.isFinite(cancelledMs) ? (apptMs - cancelledMs) / 3_600_000 : 0;
    const isLateCancel = hours > 0 && hoursUntil >= 0 && hoursUntil < hours;

    // The provider's payout row for this booking (its stored share, in pence).
    const { data: payout, error: payoutErr } = await admin
      .from('provider_payouts')
      .select('id, status, payout_amount, stripe_transfer_id, stripe_account_id, currency')
      .eq('booking_id', booking.id)
      .maybeSingle();
    if (payoutErr) throw payoutErr;

    const settlement = computeCancellationSettlement({
      penalty,
      isLateCancel,
      amountPaidPence: Math.round(Number(booking.amount_paid) * 100),
      depositPence: Math.round(Number(booking.deposit_amount ?? 0) * 100),
      // The platform fee is stored as bookings.service_charge (there is no
      // platform_fee column — reading one made every call fail).
      platformFeePence: Math.round(Number(booking.service_charge ?? 0) * 100),
      payoutAmountPence: payout ? Number(payout.payout_amount) : 0,
    });

    const chargeId = await latestChargeId(booking.payment_intent_id);

    // 1) Settle the provider's payout FIRST (so the charge still has the funds).
    if (payout) {
      if (payout.status === 'held') {
        if (settlement.providerKeepPence > 0) {
          if (!chargeId) throw new Error('No charge to settle the provider from');
          const transfer = await stripe.transfers.create(
            {
              amount: settlement.providerKeepPence,
              currency: payout.currency ?? 'gbp',
              destination: payout.stripe_account_id,
              source_transaction: chargeId,
              transfer_group: `payout_${payout.id}`,
              metadata: { payout_id: payout.id, booking_id: booking.id, reason: 'cancellation_penalty_retained' },
            },
            { idempotencyKey: `cancelpay_${payout.id}` },
          );
          const { error: upErr } = await admin.from('provider_payouts')
            .update({ status: 'transferred', payout_amount: settlement.providerKeepPence, stripe_transfer_id: transfer.id, failure_reason: 'cancellation penalty: provider keeps retained share' })
            .eq('id', payout.id).eq('status', 'held');
          if (upErr) throw upErr;
        } else {
          // Provider keeps nothing — close the held row out.
          const { error: upErr } = await admin.from('provider_payouts')
            .update({ status: 'cancelled', failure_reason: 'cancelled by client, no penalty retained' })
            .eq('id', payout.id).eq('status', 'held');
          if (upErr) throw upErr;
        }
      } else if (payout.status === 'transferred' && settlement.reverseFromPayoutPence > 0) {
        // Already paid out (cancel after the hold released) — claw back only the
        // part the provider doesn't keep.
        if (payout.stripe_transfer_id) {
          await stripe.transfers.createReversal(
            payout.stripe_transfer_id,
            { amount: settlement.reverseFromPayoutPence, metadata: { booking_id: booking.id, reason: 'cancellation_penalty_partial_reversal' } },
            { idempotencyKey: `cancelrev_${payout.id}` },
          );
          const fullyReversed = settlement.providerKeepPence <= 0;
          const { error: upErr } = await admin.from('provider_payouts')
            .update(fullyReversed
              ? { status: 'reversed' }
              : { payout_amount: settlement.providerKeepPence, failure_reason: 'cancellation penalty: partial reversal, provider keeps retained share' })
            .eq('id', payout.id);
          if (upErr) throw upErr;
        }
      }
    }

    // 2) Refund the client their share (partial or full). Tagged
    // settled_by_cancel so the webhook's reconcileRefund records it without
    // re-touching the payout we just settled.
    if (settlement.clientRefundPence > 0) {
      const refund = await stripe.refunds.create(
        {
          payment_intent: booking.payment_intent_id,
          amount: settlement.clientRefundPence,
          metadata: { booking_id: booking.id, settled_by_cancel: 'true', reason: 'client_cancellation_policy', provider_kept_pence: String(settlement.providerKeepPence) },
        },
        { idempotencyKey: `cancelrefund_${booking.id}` },
      );
      await reconcileRefund(admin, stripe, refund);
    }

    // Record what the policy kept on the booking itself, so both receipts can
    // show it — a 'full' penalty makes no refund, so the ledger alone can't.
    if (settlement.providerKeepPence > 0) {
      const { error: keptErr } = await admin.from('bookings')
        .update({ policy_retained_amount: settlement.providerKeepPence / 100 })
        .eq('id', booking.id);
      if (keptErr) throw keptErr;
    }
    await notifySettlement(booking, provider, penalty, hours, settlement);
    return json({ status: 'settled', clientRefundPence: settlement.clientRefundPence, providerKeepPence: settlement.providerKeepPence }, 200);
  } catch (err) {
    console.error(`[apply-cancellation-refund] fatal: ${String(err)}`);
    return json({ error: 'Could not settle the cancellation. Please try again.' }, 500);
  }
});

// When the policy left the provider keeping money, tell both sides what was
// kept and why (user decision 2026-10-03). The provider's message says only
// what they kept — not what the client got back. A clean cancel (nothing kept)
// sends nothing here; the ordinary cancellation notice already covers it.
// Best-effort: the money has moved, so a failed notice is logged, not thrown.
async function notifySettlement(
  booking: { id: string; user_id: string; provider_id: string; provider_name_snapshot: string | null; customer_name: string | null },
  provider: { user_id: string | null; display_name: string | null } | null,
  penalty: CancelPenalty,
  hours: number,
  settlement: { clientRefundPence: number; providerKeepPence: number },
) {
  if (settlement.providerKeepPence <= 0) return;
  // A retried settlement (e.g. a 'full' penalty, which leaves no refund to
  // mark the booking settled) must not notify twice.
  const { count, error: seenErr } = await admin.from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('booking_id', booking.id).eq('type', 'cancellation_settled');
  if (seenErr) console.error(`[apply-cancellation-refund] notification check failed: ${String(seenErr.message ?? seenErr)}`);
  if ((count ?? 0) > 0) return;
  const kept = `£${(settlement.providerKeepPence / 100).toFixed(2)}`;
  const what = penalty === 'full' ? `the full ${kept}` : `the ${kept} deposit`;
  const window = hours > 0 ? `${hours}-hour cancellation policy` : 'cancellation policy';
  const clientName = booking.customer_name?.trim() || 'Your client';
  const providerName = booking.provider_name_snapshot?.trim() || provider?.display_name?.trim() || 'Your provider';
  const refunded = `£${(settlement.clientRefundPence / 100).toFixed(2)}`;

  const rows = [
    ...(provider?.user_id ? [{
      user_id: provider.user_id,
      type: 'cancellation_settled',
      title: `${clientName.split(' ')[0]} cancelled late`,
      message: `You kept ${what} under your ${window}.`,
      priority: 'medium',
      is_actionable: false,
      booking_id: booking.id,
      provider_id: booking.provider_id,
      recipient_role: 'provider',
      metadata: { provider_kept_pence: settlement.providerKeepPence },
    }] : []),
    {
      user_id: booking.user_id,
      type: 'cancellation_settled',
      title: settlement.clientRefundPence > 0 ? `${refunded} refunded` : 'Cancellation charge applied',
      message: settlement.clientRefundPence > 0
        ? `${providerName} kept ${what} under their ${window}. ${refunded} is on its way back to you.`
        : `${providerName} kept ${what} under their ${window}, so nothing is refunded.`,
      priority: 'medium',
      is_actionable: false,
      booking_id: booking.id,
      provider_id: booking.provider_id,
      recipient_role: 'client',
      metadata: { provider_kept_pence: settlement.providerKeepPence, client_refund_pence: settlement.clientRefundPence },
    },
  ];
  const { error } = await admin.from('notifications').insert(rows);
  if (error) console.error(`[apply-cancellation-refund] settled but notification failed: ${String(error.message ?? error)}`);
}

async function latestChargeId(paymentIntentId: string): Promise<string | null> {
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (intent.status !== 'succeeded') return null;
  return typeof intent.latest_charge === 'string' ? intent.latest_charge : intent.latest_charge?.id ?? null;
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
