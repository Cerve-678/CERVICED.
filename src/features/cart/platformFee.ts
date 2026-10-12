/**
 * The client-facing Cerviced platform fee, charged once per checkout on top of
 * what the provider gets. Provider deposits are never reduced by it.
 *
 * Mirrors the server, which is what actually charges it:
 * public.calculate_platform_fee + public.apply_checkout_platform_fee
 * (supabase/migrations/20261002140000_platform_fee_three_tier.sql).
 *
 *   under £100       -> £1.99
 *   £100 to £300     -> £3.99 (inclusive of £300)
 *   above £300       -> £5.99
 *
 * The tier is read from the full-payment subtotal. A deposit-only checkout has
 * none, so it is tiered on the FULL service price of its deposit bookings
 * instead (not the deposit amount).
 */
export function calculatePlatformFee(fullPaymentSubtotal: number, depositOnlyServiceSubtotal = 0): number {
  const basis = fullPaymentSubtotal > 0 ? fullPaymentSubtotal : depositOnlyServiceSubtotal;
  const amount = Math.max(0, basis);
  if (amount <= 0) return 0;
  if (amount < 100) return 1.99;
  if (amount <= 300) return 3.99;
  return 5.99;
}
