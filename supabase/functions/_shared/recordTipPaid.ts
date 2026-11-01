import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.100.0';
import type Stripe from 'npm:stripe@17.4.0';

const PAYOUT_HOLD_MS = 24 * 60 * 60 * 1000;

/** Stripe's actual processing fee on the intent's charge, or null while Stripe
 *  hasn't settled it yet. Recorded for CERVICED's books only: the provider is
 *  paid the whole tip, and CERVICED covers the fee (user, 2026-10-21). */
async function actualStripeFee(stripe: Stripe, intentId: string): Promise<{ intent: Stripe.PaymentIntent; fee: number | null }> {
  const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ['latest_charge.balance_transaction'] });
  const charge = intent.latest_charge as Stripe.Charge | null;
  const balance = charge?.balance_transaction as Stripe.BalanceTransaction | null;
  return { intent, fee: typeof balance?.fee === 'number' ? balance.fee : null };
}

/** Idempotently records the payment. The provider's payout is the full tip. */
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

  const { data: updated, error: updateError } = await admin.from('booking_tips').update({
    amount_pence: paid,
    status: 'succeeded', paid_at: new Date().toISOString(), stripe_fee_pence: fee,
    payout_pence: paid, payout_status: 'held',
    release_after: new Date(Date.now() + PAYOUT_HOLD_MS).toISOString(),
  }).eq('id', tip.id).eq('status', 'pending').select('id');
  if (updateError) throw updateError;
  return !!updated?.length;
}
