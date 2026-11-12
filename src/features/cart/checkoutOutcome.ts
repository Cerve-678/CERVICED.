// How a checkout ended once the card was approved, for the payment sheet.
//
// After approval the server settles the checkout: books it, or cancels or
// refunds the payment if the time has gone (settleCheckout). When the app
// can't hear that answer straight away (a timeout, a busy database) it asks
// again for a short while instead of guessing, and only then says it's still
// confirming. The server tells the client either way by notification
// (payment_success / payment_not_completed), so "we'll let you know" is true.

/** A checkout the client can be told the result of. */
export type SettledCheckout = 'succeeded' | 'refunded' | 'not_charged';
/** 'unknown' = still unsettled after waiting; the server finishes it later. */
export type CheckoutWaitResult = SettledCheckout | 'unknown';

/** finalize-payment-intent's capture answer, as what the client is told. */
export function settledFromCaptureStatus(status: string | null | undefined): SettledCheckout | null {
  // 'held': every booking was a request, so the card is authorised and only
  // charged when a provider accepts. The bookings exist, same as 'succeeded'.
  if (status === 'succeeded' || status === 'held') return 'succeeded';
  if (status === 'refunded') return 'refunded';
  if (status === 'canceled') return 'not_charged';
  return null;
}

/** The checkout row's own record of how it ended (checkout_batches.status / outcome). */
export function settledFromBatch(row: { status: string; outcome: string | null } | null): SettledCheckout | null {
  if (!row) return null;
  if (row.status === 'finalised') return 'succeeded';
  if (row.outcome === 'refunded') return 'refunded';
  if (row.outcome === 'not_charged') return 'not_charged';
  return null;
}

export interface WaitForCheckoutDeps {
  /** Asks the server to settle again (idempotent), returning its status. */
  capture: () => Promise<string>;
  readBatch: () => Promise<{ status: string; outcome: string | null } | null>;
  sleep: (ms: number) => Promise<void>;
  onError?: (err: unknown) => void;
  attempts?: number;
  intervalMs?: number;
}

/** Tries for about half a minute by default, then gives up as 'unknown'. */
export async function waitForCheckoutOutcome({
  capture, readBatch, sleep, onError, attempts = 6, intervalMs = 5000,
}: WaitForCheckoutDeps): Promise<CheckoutWaitResult> {
  for (let i = 0; i < attempts; i++) {
    await sleep(intervalMs);
    try {
      const settled = settledFromCaptureStatus(await capture());
      if (settled) return settled;
    } catch (err) {
      onError?.(err);
    }
    try {
      const settled = settledFromBatch(await readBatch());
      if (settled) return settled;
    } catch (err) {
      onError?.(err);
    }
  }
  return 'unknown';
}
