import type Stripe from 'npm:stripe@17.4.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.100.0';
import { adjustPayout } from './refundPlan.ts';

// Records one Stripe refund against its booking and, exactly once, takes the
// matching amount back from the provider's payout. Runs from refund-payment,
// apply-cancellation-refund AND the Stripe webhook, so every step is safe to
// repeat.
//
// A booking can be refunded more than once (policy kept the deposit, then the
// provider gives it back), so the booking's refund state is always recomputed
// from booking_refunds — the sum of every succeeded refund — never from the
// one refund in hand.
//
// How much payout to take back is decided by whoever CREATED the refund and
// carried on its metadata (payout_adjust_pence). A cancellation settlement
// carries 0 because apply-cancellation-refund settles the payout itself. A
// refund made before this ledger existed carries booking_id but no
// payout_adjust_pence: it takes back the whole remaining payout only if it
// completes a full refund. (A dashboard refund with no booking_id metadata is
// not reconciled at all — it returns at the first line.)
export async function reconcileRefund(admin: SupabaseClient, stripe: Stripe, refund: Stripe.Refund) {
  const bookingId = refund.metadata?.booking_id;
  if (!bookingId) return;
  const { data: booking, error } = await admin.from('bookings')
    .select('id, payment_intent_id, amount_paid').eq('id', bookingId).single();
  if (error) throw error;
  const intentId = typeof refund.payment_intent === 'string' ? refund.payment_intent : refund.payment_intent?.id;
  const paidPence = Math.round(Number(booking.amount_paid) * 100);
  if (intentId !== booking.payment_intent_id || refund.amount > paidPence) {
    throw new Error('Refund does not match booking');
  }

  if (refund.status !== 'succeeded') {
    const { error } = await admin.from('bookings').update({ stripe_refund_id: refund.id }).eq('id', booking.id);
    if (error) throw error;
    return;
  }

  // 1) Record it. ON CONFLICT DO NOTHING — a second reconcile of the same
  // refund adds nothing.
  const kind = refund.metadata?.settled_by_cancel === 'true'
    ? 'cancellation_settlement'
    : (refund.metadata?.kind ?? 'external');
  const declaredAdjust = Number(refund.metadata?.payout_adjust_pence);
  const { error: insErr } = await admin.from('booking_refunds').upsert({
    stripe_refund_id: refund.id,
    booking_id: booking.id,
    amount_pence: refund.amount,
    payout_adjust_pence: Number.isSafeInteger(declaredAdjust) && declaredAdjust >= 0 ? declaredAdjust : 0,
    kind,
    provider_kept_pence: refund.metadata?.provider_kept_pence ? Number(refund.metadata.provider_kept_pence) : null,
    reason: refund.metadata?.reason ?? null,
  }, { onConflict: 'stripe_refund_id', ignoreDuplicates: true });
  if (insErr) throw insErr;

  // 2) The booking's refund state = the sum of every succeeded refund.
  const { data: rows, error: sumErr } = await admin.from('booking_refunds')
    .select('amount_pence').eq('booking_id', booking.id);
  if (sumErr) throw sumErr;
  const totalRefunded = (rows ?? []).reduce((s, r) => s + Number(r.amount_pence), 0);
  const isFull = totalRefunded >= paidPence;
  const { error: writeError } = await admin.from('bookings').update({
    payment_status: isFull ? 'refunded' : 'partially_refunded',
    refunded_amount: Math.min(totalRefunded, paidPence) / 100,
    refunded_at: new Date(refund.created * 1000).toISOString(),
    stripe_refund_id: refund.id,
  }).eq('id', booking.id);
  if (writeError) throw writeError;

  // An external full refund with no declared adjustment still has to claw
  // back whatever the provider holds.
  if (kind === 'external' && isFull) {
    const { error } = await admin.from('booking_refunds')
      .update({ payout_adjust_pence: 2_147_483_647 })
      .eq('stripe_refund_id', refund.id).eq('payout_applied', false).eq('payout_adjust_pence', 0);
    if (error) throw error;
  }

  // 3) Claim the payout adjustment. Only the caller that flips
  // payout_applied false→true moves money; everyone else stops here.
  const { data: claimed, error: claimErr } = await admin.from('booking_refunds')
    .update({ payout_applied: true })
    .eq('stripe_refund_id', refund.id).eq('payout_applied', false)
    .select('payout_adjust_pence');
  if (claimErr) throw claimErr;
  const adjust = Number(claimed?.[0]?.payout_adjust_pence ?? 0);
  if (!claimed?.length || adjust <= 0) return;

  try {
    await takeBackFromPayout(admin, stripe, booking.id, refund.id, adjust);
  } catch (e) {
    // Release the claim so a retry (the webhook will redeliver) can finish it.
    await admin.from('booking_refunds').update({ payout_applied: false }).eq('stripe_refund_id', refund.id);
    throw e;
  }
}

async function takeBackFromPayout(
  admin: SupabaseClient,
  stripe: Stripe,
  bookingId: string,
  refundId: string,
  adjustPence: number,
) {
  const { data: payout, error } = await admin.from('provider_payouts')
    .select('id, status, stripe_transfer_id, payout_amount').eq('booking_id', bookingId).maybeSingle();
  if (error) throw error;
  if (!payout || payout.status === 'reversed' || payout.status === 'cancelled') return;

  const current = Number(payout.payout_amount);
  const take = Math.min(adjustPence, current);
  if (take <= 0) return;
  const { newAmountPence, emptied } = adjustPayout(current, take);

  if (payout.status === 'transferred' && payout.stripe_transfer_id) {
    const reversal = await stripe.transfers.createReversal(
      payout.stripe_transfer_id,
      { amount: take, metadata: { booking_id: bookingId, refund_id: refundId } },
      { idempotencyKey: `reversal_${refundId}` },
    );
    const { data: rows, error } = await admin.from('provider_payouts')
      .update(emptied
        ? { status: 'reversed', payout_amount: 0, stripe_reversal_id: reversal.id }
        : { payout_amount: newAmountPence, stripe_reversal_id: reversal.id })
      .eq('id', payout.id).eq('status', payout.status).eq('payout_amount', current)
      .select('id');
    if (error) throw error;
    // The row moved under us: throw so the claim is released and a retry
    // re-reads it (the reversal itself is idempotent on the refund id).
    if (!rows?.length) throw new Error('Payout changed during refund; retry');
    return;
  }

  // Not transferred yet (held / failed): just lower what will be released.
  // Filtered on status too, so a payout release-payouts sent in the meantime
  // isn't "lowered" after the full amount already went out.
  const { data: rows, error: upErr } = await admin.from('provider_payouts')
    .update(emptied
      ? { status: 'cancelled', payout_amount: 0, failure_reason: 'refunded before release' }
      : { payout_amount: newAmountPence })
    .eq('id', payout.id).eq('status', payout.status).eq('payout_amount', current)
    .select('id');
  if (upErr) throw upErr;
  if (!rows?.length) throw new Error('Payout changed during refund; retry');
}
