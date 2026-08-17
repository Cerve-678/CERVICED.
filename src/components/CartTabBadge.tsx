// src/components/CartTabBadge.tsx - Separate component for cart badge
import { useCart } from '../contexts/CartContext';

export function useCartBadge() {
  const { totalItems } = useCart();
  return totalItems > 0 ? (totalItems > 99 ? '99+' : totalItems) : undefined;
}
