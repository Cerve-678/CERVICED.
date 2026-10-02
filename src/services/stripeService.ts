import {
  createCheckoutPaymentIntent,
  finalizeCheckoutPaymentIntent,
} from './databaseService';

interface CreatePaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
}

/** Creates a Stripe PaymentIntent from a prepared server-owned checkout.
 *  The app never provides an amount: the Edge Function reads the amount from
 *  the checkout batch that the database priced and reserved. */
export async function createPaymentIntent(
  checkoutBatchId: string,
  currency: string = 'gbp',
): Promise<CreatePaymentIntentResult> {
  return createCheckoutPaymentIntent(checkoutBatchId, currency);
}

async function finalizePaymentIntent(
  checkoutBatchId: string,
  paymentIntentId: string,
  action: 'capture' | 'cancel',
): Promise<void> {
  return finalizeCheckoutPaymentIntent(checkoutBatchId, paymentIntentId, action);
}

/** Captures the canonical total and finalises the reserved bookings. */
export async function capturePaymentIntent(checkoutBatchId: string, paymentIntentId: string): Promise<void> {
  return finalizePaymentIntent(checkoutBatchId, paymentIntentId, 'capture');
}

/** Cancels an unconfirmed intent. Once authorised, server reconciliation owns
 * completion so a network timeout cannot accidentally cancel a paid booking. */
export async function cancelPaymentIntent(checkoutBatchId: string, paymentIntentId: string): Promise<void> {
  return finalizePaymentIntent(checkoutBatchId, paymentIntentId, 'cancel');
}
