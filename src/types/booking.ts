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
  addOnItems?: Array<{
    name: string;
    price: number;
  }> | undefined;
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
  addOns?: Array<{
    id: string | number;
    name: string;
    price: number;
  }> | undefined;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string | undefined;
  bookingInstructions?: string | undefined;
}

export interface BookingsByDate {
  [date: string]: ConfirmedBooking[];
}

export interface BookingConflictResult {
  isValid: boolean;
  conflicts: Array<{
    cartItemId: string;
    message: string;
  }>;
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
