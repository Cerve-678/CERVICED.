// src/services/bookingService.ts
import { CartItem } from '../contexts/CartContext';
import {
  AppointmentData,
  ConfirmedBooking,
  PaymentStatus,
  BookingCoordinates,
  ADDRESS_PENDING_PLACEHOLDER,
  PHONE_PENDING_PLACEHOLDER,
  AvailableDate,
  mapDbBookingStatus,
} from '../types/booking';
import type { BookingWithAddOns, DbBookingRescheduleRequest } from '../types/database';
import type { ProviderLocationData } from './databaseService';
import { getMyBookings } from './databaseService';
import { logger } from '../utils/logger';
import { formatTime12, formatShortDate, formatDurationMinutes } from '../utils/dateUtils';
import { calculatePlatformFeePence, splitPlatformFeePence, toPence } from '../features/cart/platformFee';


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

export const DEPOSIT_PERCENTAGE = 20; // 20% deposit

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
   * 2. Each item is charged either that subtotal or its deposit
   * 3. One platform fee is calculated on the total charged, then shared across
   *    every item by what it's charged (splitPlatformFeePence), the same split
   *    apply_checkout_platform_fee makes
   * 4. All items are paid in ONE checkout transaction
   */
  static createAppointmentData(
    items: CartItem[],
    bookings: Record<string, ServiceBookingData>,
    customerInfo: { name: string; email: string; phone: string },
    providerLocations: Record<string, ProviderLocationData> = {}
  ): AppointmentData[] {
    logger.log('Creating appointment data for', items.length, 'items');

    // What the card is charged for each item, before the fee. A provider's
    // deposit remains exactly the provider-set amount; the fee sits on top.
    const priced = items.map(item => {
      const booking = bookings[item.id];
      if (!booking) {
        logger.error('Missing booking for:', item.serviceName);
        throw new Error(`Missing booking data for ${item.serviceName}`);
      }
      const basePrice = Number(item.price) || 0;
      const addOnsTotal = (item.addOns || []).reduce((sum: number, addOn: any) => {
        return sum + (Number(addOn.price) || 0);
      }, 0);
      const itemSubtotal = basePrice + addOnsTotal;
      const policy: DepositPolicy | number = booking.depositPolicy ?? DEPOSIT_PERCENTAGE;
      const depositAmount = booking.isDepositOnly ? this.calculateDeposit(itemSubtotal, policy) : 0;
      const charged = booking.isDepositOnly ? depositAmount : itemSubtotal;
      return { item, booking, basePrice, addOnsTotal, itemSubtotal, depositAmount, charged };
    });

    // Whole pence throughout, so the fee and its shares round like the server.
    const chargedPence = priced.map(p => toPence(p.charged));
    const totalServiceChargePence = calculatePlatformFeePence(chargedPence.reduce((sum, p) => sum + p, 0));
    const sharesPence = splitPlatformFeePence(totalServiceChargePence, chargedPence);

    logger.log('Cart totals:', {
      chargedPence,
      totalServiceChargePence,
      itemCount: items.length
    });

    return priced.map(({ item, booking, basePrice, addOnsTotal, itemSubtotal, depositAmount, charged }, index) => {
      logger.log('Processing:', item.serviceName);

      // This item's share of the fee, by what it's charged.
      const itemServiceCharge = (sharesPence[index] ?? 0) / 100;

      const paymentType: 'full' | 'deposit' = booking.isDepositOnly ? 'deposit' : 'full';
      const amountPaid = Math.round((charged + itemServiceCharge) * 100) / 100;
      const remainingBalance = booking.isDepositOnly
        ? Math.round((itemSubtotal - depositAmount) * 100) / 100
        : 0;
      const totalWithServiceCharge = itemSubtotal + itemServiceCharge;

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

      const address = providerLocation?.address ?? ADDRESS_PENDING_PLACEHOLDER;
      const coordinates = providerLocation?.coordinates ?? null;
      const phone = providerLocation?.phone ?? PHONE_PENDING_PLACEHOLDER;

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
      
      const date = formatShortDate(booking.selectedDate);

      return `• ${item.serviceName} - ${date} at ${formatTime12(booking.selectedTime)}`;
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
  const toDisplayTime = (t: string): string => formatTime12(t);

  const mapPay = (s: string): PaymentStatus => {
    switch (s) {
      case 'fully_paid':    return PaymentStatus.PAID_IN_FULL;
      case 'deposit_paid':  return PaymentStatus.DEPOSIT_PAID;
      case 'refunded':      return PaymentStatus.REFUNDED;
      case 'partially_refunded': return PaymentStatus.PARTIALLY_REFUNDED;
      case 'refund_pending': return PaymentStatus.REFUND_PENDING;
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
  // Formatted through the shared helper, not inline: the provider screens
  // recover a length for legacy bookings written with no end_time and format
  // it the same way, so a recovered duration has to be indistinguishable from
  // a stored one. Two copies of this arithmetic is how they drift apart.
  const diffMin = toMin(endTime) - toMin(startTime);
  const durationStr = formatDurationMinutes(diffMin);

  return {
    id: db.id,
    cartItemId: db.id,
    bookingRef: db.booking_ref ?? undefined,
    serviceId: db.service_id ?? undefined,
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
    status: mapDbBookingStatus(db.status),
    address: db.provider_address_snapshot ?? '',
    howToGetThere: db.provider_directions_snapshot ?? undefined,
    // provider_coordinates is stored as { lat, lng } (see CartClaimItem), but the
    // whole app reads coordinates.latitude/.longitude — normalize both shapes so
    // the map marker + Directions work after a DB reload (and only once the
    // address-release view returns non-null coordinates).
    coordinates: (() => {
      const c = db.provider_coordinates as any;
      if (!c) return null as unknown as BookingCoordinates;
      const latitude = c.latitude ?? c.lat;
      const longitude = c.longitude ?? c.lng;
      return latitude != null && longitude != null
        ? ({ latitude: Number(latitude), longitude: Number(longitude) } as BookingCoordinates)
        : (null as unknown as BookingCoordinates);
    })(),
    phone: db.provider_phone_snapshot ?? '',
    customerName: db.customer_name ?? '',
    customerEmail: db.customer_email ?? '',
    customerPhone: db.customer_phone ?? '',
    notes: db.notes ?? undefined,
    bookingInstructions: db.booking_instructions ?? undefined,
    isEmergencyRequest: db.is_emergency_request ?? false,
    policyAcceptedAt: db.policy_accepted_at ?? undefined,
    policySnapshot: (db.policy_snapshot as Record<string, unknown>) ?? undefined,
    // Two shapes, one field.
    //
    // Since 20260827161000 was applied (2026-08-27) the SECOND branch is the
    // live one: the address moved into booking_client_addresses, an RLS-gated
    // row a provider cannot read before accepting, and bookings.client_address
    // is a write-only funnel that is always NULL at rest.
    //
    // The first branch is kept for the client_bookings view, which still
    // exposes the address as a plain `client_address` column (sourced from the
    // gated table via a join), and for any read that has not been moved to the
    // embed. It costs nothing and reading it wrongly is the difference between
    // an address and an empty field, not an error — which is exactly why the
    // reader assertions in clientAddressGating.test.ts are not optional.
    clientAddress:
      (db as any).client_address ??
      (() => {
        // booking_id is that table's PRIMARY KEY so PostgREST returns one
        // object, but a to-one embed is indistinguishable from to-many by the
        // foreign key alone — handle both rather than guess. Guessing wrong
        // reads as "no address given" and sends a mobile provider nowhere.
        const e = (db as any).booking_client_addresses;
        if (!e) return undefined;
        return (Array.isArray(e) ? e[0]?.address : e.address) ?? undefined;
      })(),
    providerBusinessType: (db as any).provider_business_type ?? undefined,
    addressReleasedAt: db.address_released_at ?? undefined,
    // Undefined rather than null on both counts: absent (migration
    // 20260827154500 not applied / column not selected) and never-marked are
    // the same thing to every caller — see canDisputeNoShow.
    noShowMarkedAt: db.no_show_marked_at ?? undefined,
    noShowDisputedAt: db.no_show_disputed_at ?? undefined,
    noShowDisputeReason: db.no_show_dispute_reason ?? undefined,
    // numeric columns arrive as strings from PostgREST; Number() both.
    refundedAmount: db.refunded_amount != null ? Number(db.refunded_amount) : undefined,
    policyRetainedAmount: db.policy_retained_amount != null ? Number(db.policy_retained_amount) : undefined,
    lateRescheduleFrom: db.late_reschedule_from ?? undefined,
    lateRescheduleRuleApplies: db.late_reschedule_rule_applies ?? undefined,
    cancelledBy: db.cancelled_by ?? undefined,
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
    groupBookingId: db.group_booking_id ?? undefined,
    isGroupBooking: db.is_group_booking ?? undefined,
    groupBookingCount: db.group_booking_count ?? undefined,
    createdAt: db.created_at ?? new Date().toISOString(),
    updatedAt: db.updated_at ?? new Date().toISOString(),
  };
};

/**
 * Overlay reschedule state from a booking_reschedule_requests row onto a booking.
 *
 * mapDbBookingToConfirmed cannot do this — the state lives in a different table —
 * so it is applied separately during hydration. Without it, isPendingReschedule
 * and rescheduleRequest exist only in AsyncStorage, making an in-flight
 * reschedule invisible on another device.
 *
 * `row` of null/undefined means "no open request", which clears the pending flag.
 */
export function applyRescheduleRequestRow(
  b: ConfirmedBooking,
  row: DbBookingRescheduleRequest | null | undefined
): ConfirmedBooking {
  // lastRescheduledAt drives the 24h re-request cooldown and has NO DB column,
  // so it is app-only state that must survive hydration in every branch.
  const lastRescheduledAt = b.rescheduleRequest?.lastRescheduledAt;

  if (!row) {
    if (!b.isPendingReschedule && !b.rescheduleRequest) return b;
    return {
      ...b,
      isPendingReschedule: false,
      rescheduleRequest: {
        ...(b.rescheduleRequest?.originalDate ? { originalDate: b.rescheduleRequest.originalDate } : {}),
        ...(b.rescheduleRequest?.originalTime ? { originalTime: b.rescheduleRequest.originalTime } : {}),
        ...(b.rescheduleRequest?.rescheduleCount != null
          ? { rescheduleCount: b.rescheduleRequest.rescheduleCount }
          : {}),
        ...(lastRescheduledAt ? { lastRescheduledAt } : {}),
      },
    };
  }

  const responded = row.status === 'provider_responded' && !!row.provider_available_slots;

  return {
    ...b,
    isPendingReschedule: true,
    rescheduleRequest: {
      originalDate: row.original_date,
      originalTime: row.original_time,
      ...(row.requested_dates ? { requestedDates: row.requested_dates } : {}),
      ...(row.requested_times ? { requestedTimes: row.requested_times } : {}),
      requestedAt: row.created_at,
      ...(responded
        ? {
            providerAvailableDates: row.provider_available_slots as AvailableDate[],
            providerRespondedAt: row.updated_at,
          }
        : {}),
      rescheduleCount: row.reschedule_count,
      ...(lastRescheduledAt ? { lastRescheduledAt } : {}),
      ...(row.group_reschedule_batch_id ? { groupRescheduleBatchId: row.group_reschedule_batch_id } : {}),
    },
  };
}

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

// cancelBookingInSupabase() and rescheduleBookingInSupabase() were removed
// here (2026-08-20) — both were 100% dead (zero callers anywhere in the
// app) and both wrapped an enforcement gap: cancelBookingInSupabase called
// updateBookingStatus(id, 'cancelled'), which the live
// provider_update_booking_status() RPC now rejects outright ("Use
// provider_cancel_own_booking() to cancel a booking" — see
// supabase/migrations/20260817105507_fix_client_reliability_tracking.sql),
// and rescheduleBookingInSupabase called databaseService.ts's
// updateBookingDateTime(), a raw .update() on booking_date/booking_time/
// end_time with none of the reschedule-request approval flow, reschedule-
// count limit, or notice-window checks the real path
// (requestRescheduleOwnBooking / confirmRescheduleOwnBooking) enforces —
// and bookings' RLS has no WITH CHECK clause to catch it at the DB layer
// either. Real cancellation goes through BookingContext's cancelBooking()
// (cancelOwnBooking/providerCancelOwnBooking); real reschedule goes through
// the request/confirm RPC pair. updateBookingDateTime() itself was removed
// from databaseService.ts in the same pass for the same reason.
