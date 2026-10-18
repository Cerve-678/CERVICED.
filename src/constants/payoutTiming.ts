/**
 * How long after an appointment CERVICED holds a provider's share before
 * releasing it to their Stripe account. Mirrors the CHECK constraint on
 * providers.payout_hold_days and the whitelist in set_payout_hold_days()
 * (20261018165835) — change all three together.
 */
export const PAYOUT_HOLD_DAY_OPTIONS = [1, 3, 7, 14, 30] as const;
export type PayoutHoldDays = typeof PAYOUT_HOLD_DAY_OPTIONS[number];
export const DEFAULT_PAYOUT_HOLD_DAYS: PayoutHoldDays = 1;

export function isPayoutHoldDays(value: unknown): value is PayoutHoldDays {
  return typeof value === 'number' && (PAYOUT_HOLD_DAY_OPTIONS as readonly number[]).includes(value);
}

/** "24 hours", "3 days", … — the option's own label. */
export function payoutHoldLabel(days: PayoutHoldDays): string {
  return days === 1 ? '24 hours' : `${days} days`;
}

/** The sentence under step 1 of "From booking to bank". */
export function payoutHoldSentence(days: PayoutHoldDays): string {
  return `Your share is released to Stripe ${payoutHoldLabel(days)} after the appointment ends.`;
}
