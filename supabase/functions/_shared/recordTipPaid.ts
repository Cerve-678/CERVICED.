import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.100.0';
import type Stripe from 'npm:stripe@17.4.0';

const PAYOUT_HOLD_MS = 24 * 60 * 60 * 1000;

/** Stripe's actual processing fee on the intent's charge, or null while Stripe
 *  hasn't settled it yet. Never guessed. */
async function actualStripeFee(stripe: Stripe, intentId: string): Promise<{ intent: Stripe.PaymentIntent; fee: number | null }> {
  const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ['latest_charge.balance_transaction'] });
  const charge = intent.latest_charge as Stripe.Charge | null;
  const balance = charge?.balance_transaction as Stripe.BalanceTransaction | null;
  return { intent, fee: typeof balance?.fee === 'number' ? balance.fee : null };
}

/** Idempotently records the payment and the provider's net amount. */
export async function recordTipPaid(admin: SupabaseClient, stripe: Stripe, tipId: string, intentId: string) {
  const { data: tip, error } = await admin.from('booking_tips')
    .select('id, amount_pence, status, payment_intent_id').eq('id', tipId).maybeSingle();
  if (error) throw error;
  if (!tip || tip.status !== 'pending' || tip.payment_intent_id !== intentId) return false;

  const { intent, fee } = await actualStripeFee(stripe, intentId);
  if (intent.status !== 'succeeded') return false;
  const paid = intent.amount_received;
  if (intent.currency !== 'gbp' || intent.metadata.booking_tip_id !== tip.id || paid < 100 || paid > 50000) {
    console.error(`[recordTipPaid] refusing intent ${intentId} for tip ${tip.id}: ${intent.currency} ${paid}, metadata tip ${intent.metadata.booking_tip_id}`);
    return false;
  }
  // What Stripe actually took is the truth. If it differs from the ledger (a
  // race between two starts), record the real amount rather than leave a paid
  // tip unrecorded and its provider unpaid.
  if (paid !== tip.amount_pence) {
    console.error(`[recordTipPaid] tip ${tip.id} ledger said ${tip.amount_pence}p, Stripe took ${paid}p; recording ${paid}p`);
  }

  // A missing balance transaction is never guessed: the provider payout waits
  // for settlePendingTipFees to fill it in on a later release-payouts run.
  const payout = fee === null ? null : Math.max(0, paid - fee);
  const { data: updated, error: updateError } = await admin.from('booking_tips').update({
    amount_pence: paid,
    status: 'succeeded', paid_at: new Date().toISOString(), stripe_fee_pence: fee,
    payout_pence: payout, payout_status: payout === null ? 'pending' : 'held',
    release_after: new Date(Date.now() + PAYOUT_HOLD_MS).toISOString(),
  }).eq('id', tip.id).eq('status', 'pending').select('id');
  if (updateError) throw updateError;
  return !!updated?.length;
}

/** Paid tips recorded before Stripe reported its fee sat at payout 'pending'
 *  with nothing ever revisiting them. Fill the fee in once Stripe has it. */
export async function settlePendingTipFees(admin: SupabaseClient, stripe: Stripe, limit: number) {
  const { data: waiting, error } = await admin.from('booking_tips')
    .select('id, amount_pence, payment_intent_id')
    .eq('status', 'succeeded').eq('payout_status', 'pending').not('payment_intent_id', 'is', null)
    .order('paid_at', { ascending: true }).limit(limit);
  if (error) throw error;
  let settled = 0;
  for (const tip of waiting ?? []) {
    // One bad row (e.g. Stripe can't find the intent) must not stall every
    // tip queued behind it: it stays first in paid_at order on every run.
    try {
      const { fee } = await actualStripeFee(stripe, tip.payment_intent_id);
      if (fee === null) continue;
      const { data: updated, error: updateError } = await admin.from('booking_tips').update({
        stripe_fee_pence: fee, payout_pence: Math.max(0, tip.amount_pence - fee), payout_status: 'held',
      }).eq('id', tip.id).eq('payout_status', 'pending').select('id');
      if (updateError) throw updateError;
      if (updated?.length) settled++;
    } catch (err) {
      console.error(`[settlePendingTipFees] tip ${tip.id}: ${String(err)}`);
    }
  }
  return settled;
}
