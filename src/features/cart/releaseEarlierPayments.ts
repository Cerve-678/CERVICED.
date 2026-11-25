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
//
// The client is asked first. Nothing on this phone can tell an attempt left
// behind on a closed app from one still open on another phone or on the
// website (the same person paying for the same time twice), and cancelling
// that one under them would fail a payment they're in the middle of.

import type { EarlierCheckoutPayment } from '../../services/databaseService';

export interface ReleaseEarlierPaymentsDeps {
  find: (slots: ReadonlyArray<{ providerId: string; date: string; time: string }>) => Promise<EarlierCheckoutPayment[]>;
  cancel: (checkoutBatchId: string, paymentIntentId: string) => Promise<void>;
  /** Asked once, only when there is an earlier attempt: true to stop it and
   *  pay here. */
  confirm: () => Promise<boolean>;
  onError?: (err: unknown) => void;
}

/** 'still_paying': an earlier payment for one of these times was approved or
 *  is still with the bank, so the client mustn't pay again yet.
 *  'kept': the client chose to leave the earlier attempt alone. */
export type ReleaseEarlierPaymentsResult = 'clear' | 'still_paying' | 'kept';

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
  if (earlier.length === 0) return 'clear';
  if (!(await deps.confirm())) return 'kept';
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
