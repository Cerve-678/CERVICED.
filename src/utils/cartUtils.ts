// src/utils/cartUtils.ts - Corrected to match your CartContext types
import { CartItem } from '../contexts/CartContext';

export const calculateServiceFee = (subtotal: number): number => {
  return Math.max(subtotal * 0.05, 2); // 5% service fee with £2 minimum (matches your context)
};

export const calculateTotal = (items: CartItem[]): number => {
  const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  return subtotal + calculateServiceFee(subtotal);
};

export const groupItemsByProvider = (items: CartItem[]): Record<string, CartItem[]> => {
  return items.reduce((acc, item) => {
    if (!acc[item.providerName]) {
      acc[item.providerName] = [];
    }
    const providerItems = acc[item.providerName];
    if (providerItems) {
      providerItems.push(item); // ✅ FIXED
    }
    return acc;
  }, {} as Record<string, CartItem[]>);
};

export const getTotalUniqueServices = (items: CartItem[]): number => {
  const uniqueServices = new Set(items.map(item => `${item.providerName}_${item.serviceId}`));
  return uniqueServices.size;
};

export const getProviderServiceCount = (items: CartItem[], providerName: string): number => {
  const providerItems = items.filter(item => item.providerName === providerName);
  const uniqueServices = new Set(providerItems.map(item => item.serviceId));
  return uniqueServices.size;
};

export const formatPrice = (price: number): string => {
  return `£${price.toFixed(2)}`;
};

export const getCartSummary = (items: CartItem[]) => {
  const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const serviceFee = calculateServiceFee(subtotal);
  const total = subtotal + serviceFee;
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const uniqueServices = getTotalUniqueServices(items);
  
  return {
    subtotal,
    serviceFee,
    total,
    totalItems,
    uniqueServices,
    providers: Object.keys(groupItemsByProvider(items)).length
  };
};