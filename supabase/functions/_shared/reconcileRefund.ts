import type Stripe from 'npm:stripe@17.4.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.100.0';

export async function reconcileRefund(admin: SupabaseClient, stripe: Stripe, refund: Stripe.Refund) {
  const bookingId = refund.metadata?.booking_id;
  if (!bookingId) return;
  const { data: booking, error } = await admin.from('bookings')
    .select('id, payment_intent_id, amount_paid').eq('id', bookingId).single();
  if (error) throw error;
  const intentId = typeof refund.payment_intent === 'string' ? refund.payment_intent : refund.payment_intent?.id;
  if (intentId !== booking.payment_intent_id || refund.amount !== Math.round(Number(booking.amount_paid) * 100)) {
    throw new Error('Refund does not match booking');
  }
  if (refund.status !== 'succeeded') {
    const { error } = await admin.from('bookings').update({ stripe_refund_id: refund.id }).eq('id', booking.id);
    if (error) throw error;
    return;
  }
  // Record the refund before looking up transfers, so transfer webhooks see it
  // even if a payout release raced the refund request.
  const { error: writeError } = await admin.from('bookings').update({
    payment_status: 'refunded', refunded_amount: booking.amount_paid,
    refunded_at: new Date(refund.created * 1000).toISOString(), stripe_refund_id: refund.id,
  }).eq('id', booking.id);
  if (writeError) throw writeError;
  const { data: payout, error: payoutError } = await admin.from('provider_payouts')
    .select('id, status, stripe_transfer_id, payout_amount').eq('booking_id', booking.id).maybeSingle();
  if (payoutError) throw payoutError;
  if (!payout || payout.status === 'reversed') return;
  if (payout.stripe_transfer_id) {
    const reversal = await stripe.transfers.createReversal(payout.stripe_transfer_id,
      { amount: payout.payout_amount, metadata: { booking_id: booking.id } },
      { idempotencyKey: `reversal_${payout.id}` });
    const { error } = await admin.from('provider_payouts')
      .update({ status: 'reversed', stripe_reversal_id: reversal.id }).eq('id', payout.id);
    if (error) throw error;
  } else {
    const { error } = await admin.from('provider_payouts')
      .update({ status: 'cancelled', failure_reason: 'refunded before release' })
      .eq('id', payout.id).in('status', ['held', 'failed']);
    if (error) throw error;
  }
}
