import type { CartItem } from '../../contexts/CartContext';
import type { ProviderDepositPolicy } from '../../services/databaseService';
import { DEPOSIT_PERCENTAGE, type DepositPolicy } from '../../services/bookingService';

/** Full service price before discounts or deposit policy. */
export function getCartItemFullPrice(item: Pick<CartItem, 'price' | 'addOns'>): number {
  const basePrice = Number(item.price) || 0;
  const addOnsTotal = (item.addOns ?? []).reduce(
    (total, addOn) => total + (Number(addOn?.price) || 0),
    0,
  );
  return basePrice + addOnsTotal;
}

export function getCartAddOnsSummary(item: Pick<CartItem, 'addOns'>) {
  const addOns = (item.addOns ?? []).filter(addOn => addOn?.name);
  if (addOns.length === 0) return null;

  return {
    count: addOns.length,
    total: addOns.reduce((sum, addOn) => sum + (Number(addOn?.price) || 0), 0),
    names: addOns.map(addOn => addOn.name).join(', '),
  };
}

/** ProviderDepositPolicy (as fetched into CartScreen's providerDepositPolicies)
 *  → the {type, amount} shape BookingService.calculateDeposit expects.
 *  undefined when nothing was fetched for this provider — callers decide their
 *  own fallback (BookingService.calculateDeposit defaults to
 *  DEPOSIT_PERCENTAGE). */
export function toDepositPolicy(policy: ProviderDepositPolicy | undefined): DepositPolicy | undefined {
  return policy ? { type: policy.depositType, amount: policy.depositAmount } : undefined;
}

/** Same conversion, with the legacy 20% fallback baked in — for display math
 *  that needs a concrete arg right now (BookingService.calculateDeposit takes
 *  DepositPolicy | number, never undefined). Centralises what used to be three
 *  independently drifting copies in CartScreen (effectiveTotal,
 *  effectiveTotalNoPromo, effectiveCartItems). */
export function resolveDepositPolicyArg(
  providerDepositPolicies: Record<string, ProviderDepositPolicy>,
  providerKey: string,
): DepositPolicy | number {
  return toDepositPolicy(providerDepositPolicies[providerKey]) ?? DEPOSIT_PERCENTAGE;
}

/** The total the client was shown, when the server priced the checkout
 *  differently (the provider changed a price after it went in the cart), so
 *  the payment sheet can say so. null when they agree to the penny. */
export function priceChangedFrom(shownTotal: number, serverTotal: number): number | null {
  return Math.round(shownTotal * 100) === Math.round(serverTotal * 100) ? null : shownTotal;
}
