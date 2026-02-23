// src/services/checkoutService.ts
import { CartItem } from '../contexts/CartContext';
import { BookingService, ServiceBookingData } from './bookingService';

export interface CheckoutPaymentOption {
  isDeposit: boolean;
  depositPercentage: number;
}

export interface CheckoutItem extends CartItem {
  paymentOption: CheckoutPaymentOption;
}

export class CheckoutService {
  /**
   * Calculate total with per-item deposit options
   */
  static calculateCheckoutTotal(
    items: CheckoutItem[]
  ): {
    subtotal: number;
    depositItems: number;
    fullPaymentItems: number;
    totalDue: number;
  } {
    let subtotal = 0;
    let totalDue = 0;
    let depositItems = 0;
    let fullPaymentItems = 0;

    items.forEach(item => {
      const itemTotal = item.price * item.quantity;
      subtotal += itemTotal;

      if (item.paymentOption.isDeposit) {
        const deposit = BookingService.calculateDeposit(
          itemTotal,
          item.paymentOption.depositPercentage
        );
        totalDue += deposit;
        depositItems++;
      } else {
        totalDue += itemTotal;
        fullPaymentItems++;
      }
    });

    return {
      subtotal,
      depositItems,
      fullPaymentItems,
      totalDue
    };
  }

  /**
   * Get breakdown per item
   */
  static getItemPaymentBreakdown(item: CheckoutItem): {
    itemTotal: number;
    amountDue: number;
    remainingBalance: number;
  } {
    const itemTotal = item.price * item.quantity;

    if (item.paymentOption.isDeposit) {
      const deposit = BookingService.calculateDeposit(
        itemTotal,
        item.paymentOption.depositPercentage
      );
      return {
        itemTotal,
        amountDue: deposit,
        remainingBalance: itemTotal - deposit
      };
    }

    return {
      itemTotal,
      amountDue: itemTotal,
      remainingBalance: 0
    };
  }
}