import type { CartItem } from '../../contexts/CartContext';

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
