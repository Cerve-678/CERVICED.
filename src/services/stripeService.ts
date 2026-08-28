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

/** Finalises the reserved bookings and captures their full canonical total. */
export async function capturePaymentIntent(checkoutBatchId: string, paymentIntentId: string): Promise<void> {
  return finalizePaymentIntent(checkoutBatchId, paymentIntentId, 'capture');
}

/** Release the authorisation hold without charging anything — call when
 *  booking creation fails after a successful card authorisation, so the
 *  client is never left charged with no booking to show for it. */
export async function cancelPaymentIntent(checkoutBatchId: string, paymentIntentId: string): Promise<void> {
  return finalizePaymentIntent(checkoutBatchId, paymentIntentId, 'cancel');
}
