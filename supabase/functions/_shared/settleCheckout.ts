import type Stripe from 'npm:stripe@17.4.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.100.0';

// What the client paid with, in the app's own vocabulary
// (paymentPresentation.ts PAYMENT_METHOD_LABELS), so receipts and booking
// details stop defaulting to "Card" for PayPal or a wallet. Best-effort: the
// booking is already paid and confirmed, so a failure here is only logged.
async function recordPaymentMethod(admin: SupabaseClient, stripe: Stripe, intent: Stripe.PaymentIntent) {
  try {
    const pm = typeof intent.payment_method === 'string'
      ? await stripe.paymentMethods.retrieve(intent.payment_method)
      : intent.payment_method;
    if (!pm) return;
    const wallet = pm.type === 'card' ? pm.card?.wallet?.type : undefined;
    const method = pm.type === 'paypal' ? 'paypal'
      : wallet === 'apple_pay' ? 'apple'
      : wallet === 'google_pay' ? 'google'
      : pm.type === 'card' ? 'card'
      : null;
    if (!method) return;
    const { error } = await admin.from('bookings').update({ payment_method: method })
      .eq('payment_intent_id', intent.id).is('payment_method', null);
    if (error) throw error;
  } catch (err) {
    console.error(`[settleCheckout] could not record payment method for ${intent.id}: ${String(err)}`);
  }
}

// Both the authenticated endpoint and signed webhooks converge here. Capture
// precedes booking confirmation; a paid checkout which loses its reservation
// is refunded. Transient database failures are retried by Stripe's webhook.
export async function settleCheckout(admin: SupabaseClient, stripe: Stripe, intentId: string) {
  let intent = await stripe.paymentIntents.retrieve(intentId);
  const batchId = intent.metadata.checkout_batch_id;
  if (!batchId) throw new Error('Missing checkout metadata');
  const readBatch = async () => {
    const { data, error } = await admin.from('checkout_batches').select('*').eq('id', batchId).single();
    if (error) throw error;
    if (data.payment_intent_id !== intent.id || data.user_id !== intent.metadata.user_id ||
        Math.round(Number(data.amount_due) * 100) !== intent.amount || data.currency !== intent.currency) {
      throw new Error('Payment does not match checkout');
    }
    return data;
  };
  let batch = await readBatch();
  if (intent.status === 'canceled') return 'canceled';
  if (batch.status === 'finalised' && intent.status === 'succeeded') return 'succeeded';
  const available = () => batch.status === 'prepared' && Date.parse(batch.expires_at) > Date.now();
  if (intent.status === 'requires_capture') {
    if (!available()) {
      // Older deployments finalised before capture: finish those too.
      if (batch.status !== 'finalised') {
        await stripe.paymentIntents.cancel(intent.id, {}, { idempotencyKey: `checkout_cancel_${batchId}` });
        return 'canceled';
      }
    }
    intent = await stripe.paymentIntents.capture(intent.id, {}, { idempotencyKey: `checkout_capture_${batchId}` });
  }
  if (intent.status !== 'succeeded') throw new Error('Payment is not ready to finalise');
  if (intent.amount_received !== intent.amount) throw new Error('Incomplete capture');
  if (batch.status === 'finalised') return 'succeeded';
  if (available()) {
    const { error } = await admin.rpc('finalize_checkout', {
      p_checkout_batch_id: batchId, p_payment_intent_id: intent.id,
    });
    if (!error) {
      await recordPaymentMethod(admin, stripe, intent);
      return 'succeeded';
    }
    // A concurrent webhook may already have committed the same booking.
    batch = await readBatch();
    if (batch.status === 'finalised') return 'succeeded';
    if (available()) throw error;
  }
  await stripe.refunds.create({ payment_intent: intent.id,
    metadata: { checkout_batch_id: batchId, reason: 'reservation_unavailable' },
  }, { idempotencyKey: `checkout_refund_${batchId}` });
  return 'refunded';
}
