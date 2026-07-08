// src/services/bookingService.ts
import { CartItem } from '../contexts/CartContext';
import { AppointmentData } from '../contexts/BookingContext';
import type { ProviderLocationData } from './databaseService';


export interface ServiceBookingData {
  selectedDate: string;
  selectedTime: string;
  notes: string;
  isDepositOnly?: boolean;
}

export interface PaymentInfo {
  method: 'card' | 'paypal' | 'apple' | 'google';
  amount: number;
  isDeposit: boolean;
  depositPercentage?: number;
}

// Service charge constants - SINGLE SOURCE OF TRUTH
export const SERVICE_CHARGE_RATE = 0.05; // 5%
export const SERVICE_CHARGE_MINIMUM = 2.00; // £2 minimum
export const DEPOSIT_PERCENTAGE = 20; // 20% deposit

/**
 * Calculate service charge for a given subtotal
 * Uses 5% of subtotal or £2 minimum, whichever is higher
 */
export const calculateServiceCharge = (subtotal: number): number => {
  return Math.max(subtotal * SERVICE_CHARGE_RATE, SERVICE_CHARGE_MINIMUM);
};

/**
 * Calculate per-item service charge when multiple items share the total fee
 * Distributes the cart-level service charge proportionally by item price
 */
export const calculatePerItemServiceCharge = (
  itemSubtotal: number,
  cartSubtotal: number,
  totalServiceCharge: number
): number => {
  if (cartSubtotal === 0) return 0;
  // Proportional distribution based on item's share of cart
  const proportion = itemSubtotal / cartSubtotal;
  return Math.round(totalServiceCharge * proportion * 100) / 100;
};

export class BookingService {
  /**
   * Validate all bookings have required scheduling info
   */
  static validateBookings(
    cartItems: CartItem[],
    bookings: Record<string, ServiceBookingData>
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    cartItems.forEach(item => {
      const booking = bookings[item.id];

      if (!booking?.selectedDate) {
        errors.push(`${item.serviceName} needs a date`);
      }

      if (!booking?.selectedTime) {
        errors.push(`${item.serviceName} needs a time`);
      }

      // Validate date format
      if (booking?.selectedDate) {
        const date = new Date(booking.selectedDate);
        if (isNaN(date.getTime())) {
          errors.push(`Invalid date for ${item.serviceName}`);
        }
      }

      // Validate time format (HH:mm)
      if (booking?.selectedTime) {
        const time = booking.selectedTime;
        const is24Hour = /^\d{1,2}:\d{2}$/.test(time);
        const is12Hour = /^\d{1,2}:\d{2}\s?(AM|PM|am|pm)$/i.test(time);

        if (!is24Hour && !is12Hour) {
          errors.push(`Invalid time format for ${item.serviceName}`);
        }
      }
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Create appointment data from cart items and bookings
   * Uses real provider locations from PROVIDER_LOCATIONS
   * INCLUDES DEPOSIT CALCULATION
   *
   * PAYMENT LOGIC FOR MULTIPLE BOOKINGS:
   * 1. Each item has its own subtotal (base price + add-ons)
   * 2. Service charge is calculated on the CART TOTAL, then distributed proportionally
   * 3. Each item can independently choose full payment or deposit (20%)
   * 4. All items are paid in ONE checkout transaction
   */
  static createAppointmentData(
    items: CartItem[],
    bookings: Record<string, ServiceBookingData>,
    customerInfo: { name: string; email: string; phone: string },
    providerLocations: Record<string, ProviderLocationData> = {}
  ): AppointmentData[] {
    if (__DEV__) console.log('Creating appointment data for', items.length, 'items');

    // Step 1: Calculate cart-level totals for service charge distribution
    const cartSubtotal = items.reduce((total, item) => {
      const basePrice = Number(item.price) || 0;
      const addOnsTotal = (item.addOns || []).reduce((sum: number, addOn: any) => {
        return sum + (Number(addOn.price) || 0);
      }, 0);
      return total + basePrice + addOnsTotal;
    }, 0);

    // Service charge calculated on entire cart (5% or £2 min)
    const totalServiceCharge = calculateServiceCharge(cartSubtotal);

    if (__DEV__) console.log('Cart totals:', {
      cartSubtotal,
      totalServiceCharge,
      itemCount: items.length
    });

    // Step 2: Create appointment data for each item with proportional service charge
    return items.map(item => {
      const booking = bookings[item.id];

      if (!booking) {
        console.error('Missing booking for:', item.serviceName);
        throw new Error(`Missing booking data for ${item.serviceName}`);
      }

      if (__DEV__) console.log('Processing:', item.serviceName);

      // Calculate item subtotal (base price + add-ons)
      const basePrice = Number(item.price) || 0;
      const addOnsTotal = (item.addOns || []).reduce((sum: number, addOn: any) => {
        return sum + (Number(addOn.price) || 0);
      }, 0);
      const itemSubtotal = basePrice + addOnsTotal;

      // Proportional service charge for this item
      const itemServiceCharge = calculatePerItemServiceCharge(
        itemSubtotal,
        cartSubtotal,
        totalServiceCharge
      );

      const totalWithServiceCharge = itemSubtotal + itemServiceCharge;

      // Determine payment type and amounts
      let paymentType: 'full' | 'deposit';
      let amountPaid: number;
      let depositAmount: number;
      let remainingBalance: number;

      if (booking.isDepositOnly) {
        // Deposit payment (20% of total including service charge)
        paymentType = 'deposit';
        depositAmount = this.calculateDeposit(totalWithServiceCharge, DEPOSIT_PERCENTAGE);
        amountPaid = depositAmount;
        remainingBalance = Math.round((totalWithServiceCharge - depositAmount) * 100) / 100;
      } else {
        // Full payment
        paymentType = 'full';
        amountPaid = totalWithServiceCharge;
        depositAmount = 0;
        remainingBalance = 0;
      }

      if (__DEV__) console.log(`Payment calculation for ${item.serviceName}:`, {
        basePrice,
        addOnsTotal,
        itemSubtotal,
        itemServiceCharge,
        totalWithServiceCharge,
        paymentType,
        amountPaid,
        depositAmount,
        remainingBalance
      });

      // Get provider location from DB data (passed in) or fall back gracefully
      const fullProviderName = item.providerDisplayName ?? item.providerName;
      const providerLocation = providerLocations[fullProviderName] ?? providerLocations[item.providerName];

      const address = providerLocation?.address ?? 'Address will be confirmed by provider';
      const coordinates = providerLocation?.coordinates ?? null;
      const phone = providerLocation?.phone ?? 'Phone will be confirmed by provider';

      const appointmentData: AppointmentData = {
        cartItemId: item.id,
        date: booking.selectedDate,
        time: booking.selectedTime,
        address,
        coordinates,
        phone,
        notes: booking.notes || '',
        customerName: customerInfo.name,
        customerEmail: customerInfo.email,
        customerPhone: customerInfo.phone,
        paymentType,
        amountPaid,
        depositAmount,
        remainingBalance,
        serviceCharge: itemServiceCharge,
      };

      if (__DEV__) console.log('Created appointment data:', {
        service: item.serviceName,
        paymentType: appointmentData.paymentType,
        amountPaid: appointmentData.amountPaid,
        serviceCharge: appointmentData.serviceCharge
      });

      return appointmentData;
    });
  }

  /**
   * Calculate deposit amount (default 20%)
   */
  static calculateDeposit(totalAmount: number, percentage: number = DEPOSIT_PERCENTAGE): number {
    return Math.round((totalAmount * percentage) / 100 * 100) / 100;
  }

  /**
   * Calculate remaining balance after deposit
   */
  static calculateRemainingBalance(totalAmount: number, percentage: number = DEPOSIT_PERCENTAGE): number {
    const deposit = this.calculateDeposit(totalAmount, percentage);
    return Math.round((totalAmount - deposit) * 100) / 100;
  }

  /**
   * Get payment summary
   */
  static getPaymentSummary(
    totalAmount: number,
    isDeposit: boolean,
    depositPercentage: number = 20
  ): {
    amountDue: number;
    remainingBalance: number;
    depositAmount: number;
    paymentType: 'full' | 'deposit';
  } {
    if (isDeposit) {
      const depositAmount = this.calculateDeposit(totalAmount, depositPercentage);
      return {
        amountDue: depositAmount,
        remainingBalance: this.calculateRemainingBalance(totalAmount, depositPercentage),
        depositAmount,
        paymentType: 'deposit',
      };
    }

    return {
      amountDue: totalAmount,
      remainingBalance: 0,
      depositAmount: 0,
      paymentType: 'full',
    };
  }

  /**
   * Format booking summary for confirmation
   */
  static formatBookingSummary(
    cartItems: CartItem[],
    bookings: Record<string, ServiceBookingData>
  ): string {
    const summary = cartItems.map(item => {
      const booking = bookings[item.id];
      
      if (!booking) {
        return `• ${item.serviceName} - Not scheduled`;
      }
      
      const date = new Date(booking.selectedDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      return `• ${item.serviceName} - ${date} at ${booking.selectedTime}`;
    });

    return summary.join('\n');
  }
}