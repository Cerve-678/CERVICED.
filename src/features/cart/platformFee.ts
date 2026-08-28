/**
 * The client-facing Cerviced platform fee. It is charged once per checkout
 * for full-payment checkouts, or £0.99 for a deposit-only checkout. Provider
 * deposits are never reduced by this fee: the £0.99 is added separately.
 */
export function calculatePlatformFee(fullPaymentSubtotal: number, isDepositOnlyCheckout = false): number {
  const amount = Math.max(0, fullPaymentSubtotal);
  if (amount <= 0) return isDepositOnlyCheckout ? 0.99 : 0;
  if (amount < 50) return 1.99;
  if (amount < 100) return 3.99;
  if (amount < 200) return 5.99;
  return 9.99;
}
