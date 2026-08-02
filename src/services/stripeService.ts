import { supabase } from '../lib/supabase';

interface CreatePaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
}

/** Creates a Stripe PaymentIntent server-side (create-payment-intent Edge
 *  Function — the secret key never touches the app). amount is in pounds. */
export async function createPaymentIntent(
  amount: number,
  currency: string = 'gbp',
): Promise<CreatePaymentIntentResult> {
  const { data, error } = await supabase.functions.invoke('create-payment-intent', {
    body: { amount, currency },
  });

  if (error) throw error;
  if (!data?.clientSecret || !data?.paymentIntentId) {
    throw new Error('Payment could not be started. Please try again.');
  }

  return { clientSecret: data.clientSecret, paymentIntentId: data.paymentIntentId };
}

async function finalizePaymentIntent(
  paymentIntentId: string,
  action: 'capture' | 'cancel',
  amount?: number,
): Promise<void> {
  const { error } = await supabase.functions.invoke('finalize-payment-intent', {
    body: { paymentIntentId, action, ...(amount !== undefined ? { amount } : {}) },
  });
  if (error) throw error;
}

/** Actually take the payment — call only after the booking this PaymentIntent
 *  paid for has been created successfully. Until this runs, the card is only
 *  authorised/held, not charged (see create-payment-intent's capture_method).
 *  Pass `amount` (pounds) to capture less than the full authorised total —
 *  a multi-service cart checkout that only partially books should only be
 *  charged for the services that actually persisted; Stripe releases the
 *  rest of the authorisation automatically on a partial capture. */
export async function capturePaymentIntent(paymentIntentId: string, amount?: number): Promise<void> {
  return finalizePaymentIntent(paymentIntentId, 'capture', amount);
}

/** Release the authorisation hold without charging anything — call when
 *  booking creation fails after a successful card authorisation, so the
 *  client is never left charged with no booking to show for it. */
export async function cancelPaymentIntent(paymentIntentId: string): Promise<void> {
  return finalizePaymentIntent(paymentIntentId, 'cancel');
}
