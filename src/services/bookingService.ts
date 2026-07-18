// src/services/bookingService.ts
import { CartItem } from '../contexts/CartContext';
import {
  AppointmentData,
  ConfirmedBooking,
  BookingStatus,
  PaymentStatus,
  BookingCoordinates,
} from '../types/booking';
import type { BookingWithAddOns } from '../types/database';
import type { ProviderLocationData } from './databaseService';
import {
  getMyBookings,
  updateBookingStatus as dbUpdateBookingStatus,
  updateBookingDateTime,
} from './databaseService';
import { logger } from '../utils/logger';


export interface DepositPolicy {
  type: 'percentage' | 'fixed';
  amount: number;
}

export interface ServiceBookingData {
  selectedDate: string;
  selectedTime: string;
  notes: string;
  isDepositOnly?: boolean;
  depositPolicy?: DepositPolicy;
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
    logger.log('Creating appointment data for', items.length, 'items');

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

    logger.log('Cart totals:', {
      cartSubtotal,
      totalServiceCharge,
      itemCount: items.length
    });

    // Step 2: Create appointment data for each item with proportional service charge
    return items.map(item => {
      const booking = bookings[item.id];

      if (!booking) {
        logger.error('Missing booking for:', item.serviceName);
        throw new Error(`Missing booking data for ${item.serviceName}`);
      }

      logger.log('Processing:', item.serviceName);

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
        // Deposit payment — use provider's actual policy if available, otherwise default 20%
        paymentType = 'deposit';
        const policy: DepositPolicy | number = booking.depositPolicy ?? DEPOSIT_PERCENTAGE;
        depositAmount = this.calculateDeposit(totalWithServiceCharge, policy);
        amountPaid = depositAmount;
        remainingBalance = Math.round((totalWithServiceCharge - depositAmount) * 100) / 100;
      } else {
        // Full payment
        paymentType = 'full';
        amountPaid = totalWithServiceCharge;
        depositAmount = 0;
        remainingBalance = 0;
      }

      logger.log(`Payment calculation for ${item.serviceName}:`, {
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

      logger.log('Created appointment data:', {
        service: item.serviceName,
        paymentType: appointmentData.paymentType,
        amountPaid: appointmentData.amountPaid,
        serviceCharge: appointmentData.serviceCharge
      });

      return appointmentData;
    });
  }

  /**
   * Calculate deposit amount.
   * Accepts either a legacy percentage number (default 20) or a DepositPolicy object.
   * For 'fixed' type, the deposit is the fixed amount (capped at totalAmount).
   * For 'percentage' type, the deposit is that percentage of totalAmount.
   */
  static calculateDeposit(totalAmount: number, policyOrPercentage: DepositPolicy | number = DEPOSIT_PERCENTAGE): number {
    if (typeof policyOrPercentage === 'number') {
      return Math.round((totalAmount * policyOrPercentage) / 100 * 100) / 100;
    }
    if (policyOrPercentage.type === 'fixed') {
      return Math.round(Math.min(policyOrPercentage.amount, totalAmount) * 100) / 100;
    }
    return Math.round((totalAmount * policyOrPercentage.amount) / 100 * 100) / 100;
  }

  /**
   * Calculate remaining balance after deposit
   */
  static calculateRemainingBalance(totalAmount: number, policyOrPercentage: DepositPolicy | number = DEPOSIT_PERCENTAGE): number {
    const deposit = this.calculateDeposit(totalAmount, policyOrPercentage);
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
      
      const date = new Date(booking.selectedDate).toLocaleDateString('en-GB', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      return `• ${item.serviceName} - ${date} at ${booking.selectedTime}`;
    });

    return summary.join('\n');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase-backed booking operations
// These are the single implementations — do NOT duplicate in BookingContext.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map a Supabase BookingWithAddOns row → ConfirmedBooking shape for local display.
 * This is the SINGLE SOURCE OF TRUTH for the DB→local mapping.
 * Screens and contexts import this from here, never redefine it.
 */
export const mapDbBookingToConfirmed = (db: BookingWithAddOns): ConfirmedBooking => {
  const toDisplayTime = (t: string): string => {
    const parts = t.split(':');
    let h = parseInt(parts[0] ?? '0');
    const m = parseInt(parts[1] ?? '0');
    const period = h >= 12 ? 'PM' : 'AM';
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return `${h}:${m.toString().padStart(2, '0')} ${period}`;
  };

  const mapSt = (s: string): BookingStatus => {
    switch (s) {
      case 'pending':     return BookingStatus.PENDING;
      case 'completed':   return BookingStatus.COMPLETED;
      case 'cancelled':   return BookingStatus.CANCELLED;
      case 'in_progress': return BookingStatus.IN_PROGRESS;
      case 'no_show':     return BookingStatus.NO_SHOW;
      default:            return BookingStatus.UPCOMING;
    }
  };

  const mapPay = (s: string): PaymentStatus => {
    switch (s) {
      case 'fully_paid':    return PaymentStatus.PAID_IN_FULL;
      case 'deposit_paid':  return PaymentStatus.DEPOSIT_PAID;
      case 'refunded':      return PaymentStatus.REFUNDED;
      case 'failed':        return PaymentStatus.FAILED;
      default:              return PaymentStatus.PENDING;
    }
  };

  const startTime = toDisplayTime(db.booking_time);
  const endTime   = toDisplayTime((db as any).end_time ?? db.booking_time);

  // Compute duration string from start/end minutes
  const toMin = (t: string | null | undefined): number => {
    if (!t) return 0;
    const clean = t.trim().toUpperCase();
    const isPM = clean.includes('PM');
    const isAM = clean.includes('AM');
    const part  = clean.replace(/[AP]M/i, '').trim();
    const [hs, ms] = part.split(':');
    let h = parseInt(hs || '0', 10);
    const m = parseInt(ms || '0', 10);
    if (isAM && h === 12) h = 0;
    if (isPM && h !== 12) h += 12;
    return h * 60 + m;
  };
  const diffMin = toMin(endTime) - toMin(startTime);
  const durationStr = diffMin > 0
    ? (Math.floor(diffMin / 60) > 0 ? `${Math.floor(diffMin / 60)}h ` : '') +
      (diffMin % 60 > 0 ? `${diffMin % 60}m` : '')
    : '';

  return {
    id: db.id,
    cartItemId: db.id,
    providerName: db.provider_name_snapshot,
    providerImage: db.provider_logo_snapshot ?? null,
    providerService: db.service_category_snapshot ?? '',
    serviceName: db.service_name_snapshot,
    serviceDescription: '',
    price: db.base_price,
    duration: durationStr,
    quantity: 1,
    bookingDate: db.booking_date,
    bookingTime: startTime,
    endTime,
    status: mapSt(db.status),
    address: db.provider_address_snapshot ?? '',
    coordinates: db.provider_coordinates
      ? (db.provider_coordinates as unknown as BookingCoordinates)
      : (null as unknown as BookingCoordinates),
    phone: db.provider_phone_snapshot ?? '',
    customerName: db.customer_name ?? '',
    customerEmail: db.customer_email ?? '',
    customerPhone: db.customer_phone ?? '',
    notes: db.notes ?? undefined,
    bookingInstructions: db.booking_instructions ?? undefined,
    clientAddress: (db as any).client_address ?? undefined,
    addressReleasedAt: db.address_released_at ?? undefined,
    providerId: (db as any).provider_id ?? undefined,
    clientUserId: (db as any).user_id ?? undefined,
    addOns: (db.add_ons ?? []).map((a: any, idx: number) => ({
      id: idx,
      name: a.name_snapshot,
      price: a.price_snapshot,
    })),
    paymentType: db.payment_type as 'full' | 'deposit',
    amountPaid: db.amount_paid,
    depositAmount: db.deposit_amount ?? 0,
    remainingBalance: db.remaining_balance ?? 0,
    serviceCharge: db.service_charge ?? 2.99,
    paymentStatus: mapPay(db.payment_status),
    paymentMethod: (db as any).payment_method ?? undefined,
    createdAt: db.created_at ?? new Date().toISOString(),
    updatedAt: db.updated_at ?? new Date().toISOString(),
  };
};

/**
 * Fetch all bookings for the current authenticated user from Supabase,
 * mapped to the local ConfirmedBooking shape.
 * Throws on network / DB error so callers can handle loading state.
 */
export async function fetchBookingsFromSupabase(userId: string): Promise<ConfirmedBooking[]> {
  // userId is accepted for interface clarity but getMyBookings() uses the
  // session internally — keep consistent with the rest of the service layer.
  void userId;
  const rows = await getMyBookings();
  return rows.map(mapDbBookingToConfirmed);
}

/**
 * Mark a booking as cancelled in Supabase.
 * The reason parameter is reserved for future cancellation-reason tracking.
 * Throws on failure — callers must handle the error.
 */
export async function cancelBookingInSupabase(
  bookingId: string,
  _reason?: string
): Promise<void> {
  await dbUpdateBookingStatus(bookingId, 'cancelled');
}

/**
 * Persist a rescheduled date/time for a booking in Supabase.
 * Throws on failure — callers must handle the error.
 */
export async function rescheduleBookingInSupabase(
  bookingId: string,
  newDate: string,
  newTime: string,
  newEndTime: string
): Promise<void> {
  await updateBookingDateTime(bookingId, newDate, newTime, newEndTime);
}