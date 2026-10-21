import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.100.0';
import type Stripe from 'npm:stripe@17.4.0';

const PAYOUT_HOLD_MS = 24 * 60 * 60 * 1000;

/** Idempotently records the payment and the provider's net amount. */
export async function recordTipPaid(admin: SupabaseClient, stripe: Stripe, tipId: string, intentId: string) {
  const { data: tip, error } = await admin.from('booking_tips')
    .select('id, amount_pence, status, payment_intent_id').eq('id', tipId).maybeSingle();
  if (error) throw error;
  if (!tip || tip.status !== 'pending' || tip.payment_intent_id !== intentId) return false;

  const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ['latest_charge.balance_transaction'] });
  if (intent.status !== 'succeeded' || intent.amount_received !== tip.amount_pence ||
      intent.currency !== 'gbp' || intent.metadata.booking_tip_id !== tip.id) return false;

  const charge = intent.latest_charge as Stripe.Charge | null;
  const balance = charge?.balance_transaction as Stripe.BalanceTransaction | null;
  const fee = typeof balance?.fee === 'number' ? balance.fee : null;
  // A missing balance transaction is never guessed: the provider payout waits.
  const payout = fee === null ? null : Math.max(0, tip.amount_pence - fee);
  const { data: updated, error: updateError } = await admin.from('booking_tips').update({
    status: 'succeeded', paid_at: new Date().toISOString(), stripe_fee_pence: fee,
    payout_pence: payout, payout_status: payout === null ? 'pending' : 'held',
    release_after: new Date(Date.now() + PAYOUT_HOLD_MS).toISOString(),
  }).eq('id', tip.id).eq('status', 'pending').select('id');
  if (updateError) throw updateError;
  return !!updated?.length;
}
