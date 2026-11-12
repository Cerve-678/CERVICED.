import type Stripe from 'npm:stripe@17.4.0';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.100.0';
import { chargeWasApproved } from './checkoutCharge.ts';
import { settleHeldPayment } from './settleHeldPayment.ts';

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

// How a checkout that never became bookings ended, recorded once on the batch
// (checkout_batches.outcome) by record_checkout_outcome, which also tells the
// client unless nothing was ever taken. Best-effort: the money has already
// moved correctly, and a checkout left 'prepared' is picked up again by the
// reconcile-checkouts job, which records it then.
export type CheckoutOutcome = 'not_charged' | 'refunded' | 'abandoned';

async function recordOutcome(admin: SupabaseClient, batchId: string, outcome: CheckoutOutcome) {
  const { error } = await admin.rpc('record_checkout_outcome', {
    p_checkout_batch_id: batchId, p_outcome: outcome,
  });
  if (error) console.error(`[settleCheckout] could not record ${outcome} for ${batchId}: ${String(error.message ?? error)}`);
}

// A cancelled payment says something to the client only if the card had been
// approved: their bank may show it as pending. A declined or never-paid one
// was already explained on the payment sheet, or never started.
export async function outcomeOfCancelledIntent(stripe: Stripe, intentId: string): Promise<CheckoutOutcome> {
  const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ['latest_charge'] });
  return chargeWasApproved(intent.latest_charge) ? 'not_charged' : 'abandoned';
}

// Both the authenticated endpoint, signed webhooks and the reconcile-checkouts
// job converge here. Capture precedes booking confirmation; a paid checkout
// which loses its reservation is refunded. The exception is a checkout of
// requests only, booked with the card held (see settleHeldPayment).
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
  if (intent.status === 'canceled') {
    // Cancelled before it could be settled (by an earlier run, or by Stripe
    // after an approval sat uncaptured).
    if (batch.status === 'prepared' || batch.status === 'expired') {
      await recordOutcome(admin, batchId, await outcomeOfCancelledIntent(stripe, intent.id));
    }
    return 'canceled';
  }
  if (batch.status === 'finalised' && intent.status === 'succeeded') return 'succeeded';
  const available = () => batch.status === 'prepared' && Date.parse(batch.expires_at) > Date.now();
  // A checkout of requests only is booked with the card held, not charged:
  // settleHeldPayment takes or releases it once the provider answers. Any
  // later webhook or retry for it must never capture it here.
  if (intent.status === 'requires_capture' && batch.capture_state) return 'held';
  if (intent.status === 'requires_capture' && available()) {
    const { data: allRequests, error: kindError } = await admin.rpc('checkout_batch_all_requests', {
      p_checkout_batch_id: batchId,
    });
    if (kindError) throw kindError;
    if (allRequests === true) {
      const { error } = await admin.rpc('finalize_checkout_held', {
        p_checkout_batch_id: batchId, p_payment_intent_id: intent.id,
      });
      if (error) {
        // A concurrent webhook may already have held the same checkout.
        batch = await readBatch();
        if (batch.capture_state) return 'held';
        throw error;
      }
      await recordPaymentMethod(admin, stripe, intent);
      // A provider who switched on auto-accept a moment ago will have had the
      // booking confirmed by finalize_checkout: settle that straight away. The
      // booking already exists, so a failure here is the sweep's to retry,
      // never the client's checkout error.
      try {
        await settleHeldPayment(admin, stripe, intent.id);
      } catch (err) {
        console.error(`[settleCheckout] held ${intent.id} not settled yet: ${String(err)}`);
      }
      return 'held';
    }
  }
  if (intent.status === 'requires_capture') {
    // Re-read right before taking money: a concurrent settle (the app's call
    // and Stripe's webhook both land here) may have just held this checkout,
    // which also made checkout_batch_all_requests read false above. If one
    // still slips through, settleHeldPayment refunds what shouldn't be kept.
    batch = await readBatch();
    if (batch.capture_state) return 'held';
    if (!available()) {
      // Older deployments finalised before capture: finish those too.
      if (batch.status !== 'finalised') {
        await stripe.paymentIntents.cancel(intent.id, {}, { idempotencyKey: `checkout_cancel_${batchId}` });
        await recordOutcome(admin, batchId, 'not_charged');
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
  await recordOutcome(admin, batchId, 'refunded');
  return 'refunded';
}
