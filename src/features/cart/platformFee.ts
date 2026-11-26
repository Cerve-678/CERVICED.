/**
 * The client-facing Cerviced platform fee, charged once per checkout on top of
 * what the provider gets. Provider deposits are never reduced by it.
 *
 * Mirrors the server, which is what actually charges it:
 * public.calculate_platform_fee + public.apply_checkout_platform_fee
 * (supabase/migrations/20261101150000_platform_fee_percentage.sql).
 *
 *   5% of what the card is charged + 40p, at least £1.99, at most £24.99
 *
 * "What the card is charged" is the checkout's in-app amount before the fee:
 * full prices for services paid in full, the deposit for deposit services.
 * Money a client pays a provider in person later never counts.
 */
// Whole numbers on purpose: 0.05 * 100 isn't exactly 5 in floating point.
const FEE_PERCENT = 5;
const FEE_FIXED_PENCE = 40;
const FEE_MIN_PENCE = 199;
const FEE_MAX_PENCE = 2499;

export function calculatePlatformFee(chargedSubtotal: number): number {
  return calculatePlatformFeePence(toPence(chargedSubtotal)) / 100;
}

/** Pounds to whole pence; anything that isn't a positive number is 0. */
export function toPence(amount: number): number {
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
}

/**
 * The fee in whole pence, so it rounds exactly like Postgres's
 * round(numeric, 2) (half a penny rounds up). Floating-point pounds don't:
 * £34.30 gives 2.115, which the server charges as £2.12.
 */
export function calculatePlatformFeePence(chargedPence: number): number {
  if (chargedPence <= 0) return 0;
  // 5% + 40p in hundredths of a penny, plus half a penny, floored to pence.
  const fee = Math.floor((chargedPence * FEE_PERCENT + FEE_FIXED_PENCE * 100 + 50) / 100);
  return Math.min(FEE_MAX_PENCE, Math.max(FEE_MIN_PENCE, fee));
}

/**
 * Checkouts whose in-app total (fee included) is above this don't offer
 * PayPal: PayPal costs CERVICED about 3.1% + 40p, so with the fee capped at
 * £24.99 a larger PayPal payment loses money. Card, Apple Pay and Google Pay
 * stay available. The server decides (create-payment-intent's
 * PAYPAL_MAX_CHECKOUT_PENCE); the payment sheet mirrors it so it never shows
 * a PayPal button the server will refuse.
 */
export const PAYPAL_MAX_CHECKOUT_TOTAL = 600;
