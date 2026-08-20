// src/types/booking.ts
// Shared booking domain types — imported by both BookingContext and
// bookingService to avoid circular dependencies.

export enum BookingStatus {
  PENDING = 'pending',
  UPCOMING = 'upcoming',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show',
  /** Reverse of NO_SHOW — the CLIENT marked the PROVIDER as not having shown
   *  up (client_mark_provider_no_show() RPC). Terminal, same as NO_SHOW. */
  PROVIDER_NO_SHOW = 'provider_no_show',
}

// Map a raw DB bookings.status string → app BookingStatus enum. Single source
// of truth — screens must never cast a raw DB status string directly, since
// 'confirmed' (DB) has no identically-named BookingStatus member (it maps to
// UPCOMING) and a raw cast silently produces an unmatched status. Lives here
// (not in BookingContext.tsx or bookingService.ts) because both of those
// files import from each other already — putting it in either would risk a
// circular import.
export function mapDbBookingStatus(s: string): BookingStatus {
  switch (s) {
    case 'pending': return BookingStatus.PENDING;
    case 'completed': return BookingStatus.COMPLETED;
    case 'cancelled': return BookingStatus.CANCELLED;
    case 'in_progress': return BookingStatus.IN_PROGRESS;
    case 'no_show': return BookingStatus.NO_SHOW;
    case 'provider_no_show': return BookingStatus.PROVIDER_NO_SHOW;
    default: return BookingStatus.UPCOMING;
  }
}

export interface BookingCoordinates {
  latitude: number;
  longitude: number;
}

/**
 * Sentinels written into a booking's address/phone snapshot when the provider
 * had no location on file at checkout. They are NOT real values — they must
 * never be rendered as a tappable address, opened in maps, or dialled.
 */
export const ADDRESS_PENDING_PLACEHOLDER = 'Address will be confirmed by provider';
export const PHONE_PENDING_PLACEHOLDER = 'Phone will be confirmed by provider';

/** True when an address is missing, blank, or the "not set yet" sentinel. */
export function isAddressPending(address: string | null | undefined): boolean {
  const trimmed = address?.trim();
  return !trimmed || trimmed === ADDRESS_PENDING_PLACEHOLDER;
}

/**
 * Whether a booking can actually be opened in a maps app.
 *
 * `ConfirmedBooking.coordinates` is TYPED non-null but is genuinely null at
 * runtime whenever the client_bookings view masks it (address not yet released)
 * or the provider never geocoded — mapDbBookingToConfirmed casts null through
 * `as unknown as BookingCoordinates`. Callers must check, not trust the type.
 */
export function hasMapDestination(b: {
  address?: string | null;
  coordinates?: BookingCoordinates | null;
}): boolean {
  return (
    !isAddressPending(b.address) &&
    b.coordinates?.latitude != null &&
    b.coordinates?.longitude != null
  );
}

export enum PaymentStatus {
  PENDING = 'pending',
  DEPOSIT_PAID = 'deposit_paid',
  PAID_IN_FULL = 'paid_in_full',
  REFUND_PENDING = 'refund_pending',
  REFUNDED = 'refunded',
  FAILED = 'failed',
}

export interface PaymentBreakdown {
  baseServicePrice: number;
  addOnsTotal: number;
  subtotal: number;
  serviceChargeRate: number;
  serviceChargeAmount: number;
  totalBeforePayment: number;
  depositPercentage?: number | undefined;
  depositAmount?: number | undefined;
  amountCharged: number;
  remainingBalance: number;
  addOnItems?: {
    name: string;
    price: number;
  }[] | undefined;
}

// AvailableDate is used by the reschedule flow (context + screens)
export interface AvailableDate {
  date: string;
  times: string[];
}

export interface ConfirmedBooking {
  id: string;
  cartItemId: string;
  providerName: string;
  providerImage: any;
  providerService: string;
  serviceName: string;
  serviceDescription: string;
  price: number;
  duration: string;
  quantity: number;

  // Booking specific
  bookingDate: string;
  bookingTime: string;
  endTime: string;
  status: BookingStatus;

  // Location
  address: string;
  coordinates: BookingCoordinates;

  // Contact
  phone: string;

  // Customer information (who made the booking)
  customerName: string;
  customerEmail: string;
  customerPhone: string;

  // Payment (per booking) - legacy fields kept for backwards compatibility
  paymentType: 'full' | 'deposit';
  amountPaid: number;
  depositAmount: number;
  remainingBalance: number;
  serviceCharge: number;

  // Enhanced payment tracking
  paymentStatus: PaymentStatus;
  paymentBreakdown?: PaymentBreakdown | undefined;
  paymentMethod?: string | undefined;
  paymentConfirmedAt?: string | undefined;
  transactionId?: string | undefined;

  // Group booking
  groupBookingId?: string | undefined;
  isGroupBooking?: boolean | undefined;
  groupBookingCount?: number | undefined;

  // Reschedule tracking
  isPendingReschedule?: boolean | undefined;
  rescheduleRequest?: {
    originalDate?: string | undefined;
    originalTime?: string | undefined;
    requestedDates?: string[] | undefined;
    // Index-aligned with requestedDates (element i is the time requested
    // alongside requestedDates[i]) — requestedDates alone can't carry a
    // time-of-day. See applyRescheduleRequestRow() in bookingService.ts.
    requestedTimes?: string[] | undefined;
    requestedAt?: string | undefined;
    providerAvailableDates?: AvailableDate[] | undefined;
    providerRespondedAt?: string | undefined;
    rescheduleCount?: number | undefined;
    lastRescheduledAt?: string | undefined;
    // Set when this booking's reschedule request is one sibling of a
    // provider_initiate_group_reschedule() proposal (see
    // supabase/fix_group_booking_reschedule.sql) — every sibling's request
    // row carries the same batch id. Presence of this field (not just
    // groupBookingId on the booking itself) is what RescheduleScreen uses
    // to decide whether to show/confirm the whole group as one unit, since
    // a booking can be part of a group without currently having an active
    // reschedule request at all.
    groupRescheduleBatchId?: string | undefined;
  } | undefined;

  // Real services.id from the services table (optional — absent on legacy bookings)
  serviceId?: string | undefined;

  // Provider ID (for provider-facing screens)
  providerId?: string | undefined;

  // Client user ID (for provider-facing screens — the user who made the booking)
  clientUserId?: string | undefined;

  // Client address (for mobile providers who travel to the client)
  clientAddress?: string | undefined;

  // Address release tracking (for non-mobile providers)
  addressReleasedAt?: string | undefined;

  // Metadata
  notes?: string | undefined;
  addOns?: {
    id: string | number;
    name: string;
    price: number;
  }[] | undefined;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string | undefined;
  bookingInstructions?: string | undefined;

  // The provider's cancellation/booking policy as the client agreed to it at
  // checkout (BookingSheet/MultiBookingSheet only — CartScreen's checkbox is
  // the separate, deferred Cerviced-wide terms). Undefined for bookings made
  // before this existed.
  policyAcceptedAt?: string | undefined;
  policySnapshot?: Record<string, unknown> | undefined;
}

export interface BookingsByDate {
  [date: string]: ConfirmedBooking[];
}

export interface BookingConflictResult {
  isValid: boolean;
  conflicts: {
    cartItemId: string;
    message: string;
  }[];
}

export interface AppointmentData {
  cartItemId: string;
  date: string;
  time: string;
  address: string;
  coordinates: BookingCoordinates | null;
  phone: string;
  notes?: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  paymentType: 'full' | 'deposit';
  amountPaid: number;
  depositAmount: number;
  remainingBalance: number;
  serviceCharge: number;
  paymentMethod?: string;
  /** Real Stripe PaymentIntent id — one PaymentIntent covers the whole
   *  checkout total, shared across every booking created from it. */
  paymentIntentId?: string;
}
