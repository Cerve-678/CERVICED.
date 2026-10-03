// The money maths for a provider- or admin-issued refund, as one pure function
// so it can be unit-tested in isolation (zero imports on purpose) and reused
// verbatim by the refund-payment edge function. Sibling of
// cancellationSettlement.ts, which owns the CLIENT-cancellation maths.
//
// A booking can now be refunded more than once — e.g. the cancellation policy
// kept the deposit, then the provider gives some of it back as goodwill — so
// every figure here is "what is left", never "what was paid".
//
// MODEL (user decisions 2026-09-29 and 2026-10-03):
//   • 'full'    → everything the client has not yet had back, INCLUDING the
//                 platform fee. Every penny the provider still holds is clawed
//                 back from their payout.
//   • partial   → an amount out of the PROVIDER'S remaining share only.
//                 CERVICED keeps its fee on a partial refund, so a partial can
//                 never exceed what the provider still holds.
//
// All amounts are integer pence.

export type RefundRequest = 'full' | number;

export interface RefundPlanInput {
  /** What the client paid for this booking (includes the platform fee). */
  amountPaidPence: number;
  /** Everything already refunded for this booking (succeeded or pending). */
  alreadyRefundedPence: number;
  /** What the provider still holds from this booking: their current payout_amount,
   *  or, when there is no payout row, the service share not yet refunded. */
  providerHeldPence: number;
  request: RefundRequest;
}

export type RefundPlan =
  | { ok: true; refundPence: number; payoutAdjustPence: number; isFinalRefund: boolean }
  | { ok: false; error: string };

function pence(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function gbp(p: number): string {
  return `£${(p / 100).toFixed(2)}`;
}

export function planRefund(input: RefundPlanInput): RefundPlan {
  const paid = pence(input.amountPaidPence);
  const refunded = Math.min(pence(input.alreadyRefundedPence), paid);
  const remaining = paid - refunded;
  const held = Math.min(pence(input.providerHeldPence), remaining);

  if (remaining <= 0) return { ok: false, error: 'This booking has already been refunded in full.' };

  if (input.request === 'full') {
    return { ok: true, refundPence: remaining, payoutAdjustPence: held, isFinalRefund: true };
  }

  const amount = input.request;
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return { ok: false, error: 'Enter an amount above £0.00.' };
  }
  if (amount > held) {
    return { ok: false, error: held > 0 ? `You can refund at most ${gbp(held)}.` : 'There is nothing left of your share to refund.' };
  }
  return { ok: true, refundPence: amount, payoutAdjustPence: amount, isFinalRefund: amount === remaining };
}

/**
 * Where a payout row ends up after `adjustPence` of it is handed back. Shared by
 * reconcileRefund for held (not yet transferred) and transferred payouts.
 */
export function adjustPayout(
  payoutAmountPence: number,
  adjustPence: number,
): { newAmountPence: number; emptied: boolean } {
  const current = pence(payoutAmountPence);
  const next = Math.max(0, current - pence(adjustPence));
  return { newAmountPence: next, emptied: next === 0 };
}
