// The money maths for a client-cancelled booking, as one pure function so it
// can be unit-tested in isolation (it has zero imports on purpose) and reused
// verbatim by the apply-cancellation-refund edge function.
//
// MODEL (user decision 2026-10-02) — "refund-only": the app only ever keeps
// money the client already paid; it never charges their card for more. The
// provider's `cancelPenalty` decides how much of what was paid comes back:
//
//   • not a late cancel, or penalty 'none'  → full refund (INCLUDING the
//     platform fee — CERVICED gives up its fee on a clean/early cancel, the
//     same rule refund-payment already follows).
//   • late + 'deposit'                       → keep the deposit (it goes to the
//     provider) and the platform fee (CERVICED keeps it); refund the rest.
//   • late + 'full'                          → keep everything already paid
//     (the provider keeps their whole share, CERVICED keeps its fee); refund
//     nothing. This is a FORFEIT of what was paid, never a charge for the
//     unpaid balance.
//
// All amounts are integer pence. The function reads the booking's STORED
// figures (amount_paid, deposit, platform_fee) and the payout row's STORED
// payout_amount, rather than re-deriving the fee formula — so it stays correct
// regardless of how finalize_checkout computed the split.

export type CancelPenalty = 'none' | 'deposit' | 'full';

export interface CancellationSettlementInput {
  /** The provider's cancellation penalty for this booking (frozen snapshot preferred). */
  penalty: CancelPenalty;
  /** Whether the cancel fell inside the provider's notice window. Early cancels are always fully refunded. */
  isLateCancel: boolean;
  /** What the client actually paid for this booking, in pence (includes the platform fee). */
  amountPaidPence: number;
  /** The deposit portion of this booking, in pence. */
  depositPence: number;
  /** The platform fee portion of this booking, in pence. */
  platformFeePence: number;
  /** The provider's payout for this booking, in pence (their service share; 0 if there is no payout row). */
  payoutAmountPence: number;
}

export interface CancellationSettlement {
  /** Amount to refund the client, in pence. */
  clientRefundPence: number;
  /** Amount the provider should end up keeping, in pence (0..payoutAmount). */
  providerKeepPence: number;
  /** Amount to claw back from the provider's payout if it was already transferred, in pence (= payoutAmount − providerKeep). */
  reverseFromPayoutPence: number;
}

/** Clamp to a non-negative integer number of pence. */
function pence(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

export function computeCancellationSettlement(
  input: CancellationSettlementInput,
): CancellationSettlement {
  const amountPaid = pence(input.amountPaidPence);
  const deposit = pence(input.depositPence);
  const fee = pence(input.platformFeePence);
  const payout = pence(input.payoutAmountPence);

  // Nothing was captured (e.g. Stripe not live, or a free booking) — nothing to
  // settle. The cancel still goes through; this just moves no money.
  if (amountPaid <= 0) {
    return { clientRefundPence: 0, providerKeepPence: 0, reverseFromPayoutPence: 0 };
  }

  let clientRefund: number;
  let providerKeep: number;

  if (!input.isLateCancel || input.penalty === 'none') {
    // Full refund, fee included. Provider keeps nothing.
    clientRefund = amountPaid;
    providerKeep = 0;
  } else if (input.penalty === 'deposit') {
    // Provider keeps the deposit (bounded by their actual payout share);
    // CERVICED keeps the fee; the client gets everything else back.
    providerKeep = Math.min(deposit, payout);
    clientRefund = Math.max(0, amountPaid - providerKeep - fee);
  } else {
    // 'full' — forfeit everything already paid. Provider keeps their whole
    // share, CERVICED keeps its fee, the client gets nothing back.
    providerKeep = payout;
    clientRefund = Math.max(0, amountPaid - providerKeep - fee);
  }

  // A refund can never exceed what was paid.
  clientRefund = Math.min(clientRefund, amountPaid);

  return {
    clientRefundPence: clientRefund,
    providerKeepPence: providerKeep,
    reverseFromPayoutPence: Math.max(0, payout - providerKeep),
  };
}
