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
export const PLATFORM_FEE_RATE = 0.05;
export const PLATFORM_FEE_FIXED = 0.4;
export const PLATFORM_FEE_MIN = 1.99;
export const PLATFORM_FEE_MAX = 24.99;

export function calculatePlatformFee(chargedSubtotal: number): number {
  const amount = Number.isFinite(chargedSubtotal) ? chargedSubtotal : 0;
  if (amount <= 0) return 0;
  const fee = Math.round((amount * PLATFORM_FEE_RATE + PLATFORM_FEE_FIXED) * 100) / 100;
  return Math.min(PLATFORM_FEE_MAX, Math.max(PLATFORM_FEE_MIN, fee));
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
