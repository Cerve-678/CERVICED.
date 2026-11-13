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
//   • late + 'custom'                        → the provider keeps the £ amount
//     they set, never more than half (user decision 2026-11-02), CERVICED keeps
//     its fee, and the client gets the rest back.
//   • late + 'half'                          → the provider keeps half their
//     share, CERVICED keeps its fee, and the client gets the other half back.
//     No longer offered, but policies and snapshots saved before 'custom' say it.
//
// Based on what was paid in the app (user decision 2026-11-01): a client who
// paid only a deposit can lose that whole deposit under 'deposit' or 'half'; a
// client who paid in full never loses more than half the service price. Older
// policies saying 'full' now mean 'half' (readCancelPenalty). This is only ever
// a share of what was paid, never a charge for the unpaid balance.
//
// Non-refundable deposit (user decisions 2026-11-02 and 03): where the booking's
// frozen policy says so, the provider keeps the deposit whenever the client
// cancels, even in good time. When that rule is the only reason anything is
// kept, CERVICED refunds its fee. A late penalty worth more than the deposit
// still applies as above, fee kept. Only a client's own cancel reaches this
// function, so a provider who cancels, declines or never answers still
// refunds everything.
//
// All amounts are integer pence. The function reads the booking's STORED
// figures (amount_paid, deposit, platform_fee) and the payout row's STORED
// payout_amount, rather than re-deriving the fee formula — so it stays correct
// regardless of how finalize_checkout computed the split.

export type CancelPenalty = 'none' | 'deposit' | 'half' | 'custom';

/** Policies and booking snapshots saved before 2026-11-01 can still say 'full'. */
export function readCancelPenalty(value: unknown): CancelPenalty {
  if (value === 'deposit' || value === 'custom') return value;
  return value === 'half' || value === 'full' ? 'half' : 'none';
}

/** The provider's custom amount in pence; 0 when missing or unreadable, which
 *  settles as no penalty rather than guessing at what the client agreed to. */
export function readCancelCustomFeePence(value: unknown): number {
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string' || !/^\s*\d+(\.\d{1,2})?\s*$/.test(text)) return 0;
  return Math.round(Number(text) * 100);
}

/** Whether a client's cancellation counts as late under the provider's policy.
 *
 *  - Inside the notice window is late, and so is any time after the start:
 *    cancelling a booking that has already begun is at least as late as
 *    cancelling an hour before (it used to count as early, a full refund).
 *  - A booking the client moved while already inside the window stays late
 *    wherever it was moved to (decided 2026-10-25).
 *  - With no notice window (0 hours) nothing is late. */
export function isLateClientCancel(input: {
  /** The booking's notice window in hours (bookings.cancel_notice_hours). */
  noticeHours: number;
  /** Hours from the cancellation to the UK start time; negative once started. */
  hoursUntilStart: number;
  /** The client moved it while already inside the window (late_reschedule_from). */
  movedLate: boolean;
}): boolean {
  if (!(input.noticeHours > 0)) return false;
  if (input.movedLate) return true;
  return Number.isFinite(input.hoursUntilStart) && input.hoursUntilStart < input.noticeHours;
}

export interface CancellationSettlementInput {
  /** The provider's cancellation penalty for this booking (frozen snapshot preferred). */
  penalty: CancelPenalty;
  /** Under a 'custom' penalty, the amount the provider set, in pence. */
  customFeePence?: number;
  /** The service price, in pence. Caps a 'custom' amount when only a deposit was paid. */
  servicePricePence?: number;
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
  /** The client paid only a deposit in the app, not the full price. */
  paidDepositOnly: boolean;
  /** The booking's frozen policy makes its deposit non-refundable. */
  depositNonRefundable?: boolean;
}

export interface CancellationSettlement {
  /** Amount to refund the client, in pence. */
  clientRefundPence: number;
  /** Amount the provider should end up keeping, in pence (0..payoutAmount). */
  providerKeepPence: number;
  /** Amount to claw back from the provider's payout if it was already transferred, in pence (= payoutAmount − providerKeep). */
  reverseFromPayoutPence: number;
  /** What was kept is down to the non-refundable deposit alone, so the fee was refunded. */
  depositRuleOnly: boolean;
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
  // Rounds down, so an odd penny goes back to the client.
  const half = Math.floor(payout / 2);
  const customFee = pence(input.customFeePence ?? 0);

  // Nothing was captured (e.g. Stripe not live, or a free booking) — nothing to
  // settle. The cancel still goes through; this just moves no money.
  if (amountPaid <= 0) {
    return { clientRefundPence: 0, providerKeepPence: 0, reverseFromPayoutPence: 0, depositRuleOnly: false };
  }

  let clientRefund: number;
  let providerKeep: number;

  if (!input.isLateCancel || input.penalty === 'none' || (input.penalty === 'custom' && customFee === 0)) {
    // Full refund, fee included. Provider keeps nothing.
    clientRefund = amountPaid;
    providerKeep = 0;
  } else if (input.penalty === 'custom') {
    // Never above half the price, and never above what was actually paid. When
    // only a deposit was paid the payout is just that deposit, so half has to
    // come from the service price.
    const priceHalf = Math.floor(pence(input.servicePricePence ?? 0) / 2);
    const cap = input.paidDepositOnly
      ? Math.min(deposit, payout, priceHalf > 0 ? priceHalf : half)
      : half;
    providerKeep = Math.min(customFee, cap);
    clientRefund = Math.max(0, amountPaid - providerKeep - fee);
  } else if (input.paidDepositOnly) {
    // All the client paid was the deposit: the provider keeps it whole (bounded
    // by their actual payout share); CERVICED keeps the fee.
    providerKeep = input.penalty === 'deposit' ? Math.min(deposit, payout) : payout;
    clientRefund = Math.max(0, amountPaid - providerKeep - fee);
  } else if (input.penalty === 'deposit') {
    // Paid in full under a 'keep the deposit' policy: the deposit's amount, but
    // never more than half; the client gets everything else back.
    providerKeep = Math.min(deposit, half);
    clientRefund = Math.max(0, amountPaid - providerKeep - fee);
  } else {
    // 'half', paid in full: half to the provider, CERVICED keeps its fee, the
    // other half back to the client.
    providerKeep = half;
    clientRefund = Math.max(0, amountPaid - providerKeep - fee);
  }

  // The non-refundable deposit is a floor under whatever the penalty kept.
  let depositRuleOnly = false;
  if (input.depositNonRefundable === true && deposit > 0) {
    const depositKeep = input.paidDepositOnly ? Math.min(deposit, payout) : Math.min(deposit, half);
    if (providerKeep === 0 && depositKeep > 0) {
      // Nothing else applied, so only the deposit is kept and the fee goes back.
      depositRuleOnly = true;
      providerKeep = depositKeep;
      clientRefund = Math.max(0, amountPaid - providerKeep);
    } else if (providerKeep < depositKeep) {
      providerKeep = depositKeep;
      clientRefund = Math.max(0, amountPaid - providerKeep - fee);
    }
  }

  // A refund can never exceed what was paid.
  clientRefund = Math.min(clientRefund, amountPaid);

  return {
    clientRefundPence: clientRefund,
    providerKeepPence: providerKeep,
    reverseFromPayoutPence: Math.max(0, payout - providerKeep),
    depositRuleOnly,
  };
}
