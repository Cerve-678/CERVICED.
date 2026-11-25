// Frees the times a client's own earlier, failed payment is still holding,
// before they pay again.
//
// If the app closed while a payment was going through and the card was then
// declined, nothing on the phone was left to cancel it. The database counts
// the client's own hold as busy, so paying again for the same time was told
// it had been taken, until the hold ran out minutes later. prepare_checkout
// already clears an earlier checkout that never reached Stripe; one that did
// is cancelled here through finalize-payment-intent, which asks Stripe first
// and refuses (409) if the card was approved after all.

import type { EarlierCheckoutPayment } from '../../services/databaseService';

export interface ReleaseEarlierPaymentsDeps {
  find: (slots: ReadonlyArray<{ providerId: string; date: string; time: string }>) => Promise<EarlierCheckoutPayment[]>;
  cancel: (checkoutBatchId: string, paymentIntentId: string) => Promise<void>;
  onError?: (err: unknown) => void;
}

/** 'still_paying': an earlier payment for one of these times was approved or
 *  is still with the bank, so the client mustn't pay again yet. */
export type ReleaseEarlierPaymentsResult = 'clear' | 'still_paying';

function isApprovedRefusal(err: unknown): boolean {
  return (err as { context?: { status?: number } } | null)?.context?.status === 409;
}

export async function releaseEarlierPayments(
  slots: ReadonlyArray<{ providerId: string; date: string; time: string }>,
  deps: ReleaseEarlierPaymentsDeps,
): Promise<ReleaseEarlierPaymentsResult> {
  let earlier: EarlierCheckoutPayment[];
  try {
    earlier = await deps.find(slots);
  } catch (err) {
    // Not knowing is no reason to stop them paying: at worst the new checkout
    // is told the time is taken, as before.
    deps.onError?.(err);
    return 'clear';
  }
  const results = await Promise.allSettled(
    earlier.map(payment => deps.cancel(payment.checkoutBatchId, payment.paymentIntentId)),
  );
  let stillPaying = false;
  for (const result of results) {
    if (result.status === 'fulfilled') continue;
    if (isApprovedRefusal(result.reason)) stillPaying = true;
    else deps.onError?.(result.reason);
  }
  return stillPaying ? 'still_paying' : 'clear';
}
