// src/types/booking.ts
// Shared booking domain types — imported by both BookingContext and
// bookingService to avoid circular dependencies.

import { appointmentVenue } from '../features/business-details/options';
import type { BusinessType } from './database';

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
 * Who travels to whom.
 *
 * A mobile provider comes to the CLIENT, so the venue is the client's own
 * address — the provider's location is their private base and is never the
 * appointment's location. Every other business type is the reverse.
 *
 * `providerBusinessType` is the real answer, carried through the
 * client_bookings view. The clientAddress fallback only covers a booking read
 * before that column existed; never branch on clientAddress presence directly
 * — a non-mobile booking could carry one (see the checkout fix in
 * BookingContext.createBookingsFromCart), and a mobile booking legitimately
 * has none until the client sends it.
 *
 * The 'mobile' comparison itself lives in `appointmentVenue`
 * (features/business-details/options.ts) with the rest of what defines a
 * business type — this function is the booking-shaped wrapper around it, and
 * owns only the fallback for a booking whose type didn't come through.
 */
export function isMobileBooking(b: {
  providerBusinessType?: string | null | undefined;
  clientAddress?: string | null | undefined;
}): boolean {
  const venue = appointmentVenue(b.providerBusinessType as BusinessType | null | undefined);
  if (venue) return venue === 'client';
  return !!b.clientAddress?.trim();
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
  address?: string | null | undefined;
  coordinates?: BookingCoordinates | null | undefined;
  providerBusinessType?: string | null | undefined;
  clientAddress?: string | null | undefined;
}): boolean {
  // A mobile booking has no mappable provider destination by definition — the
  // provider travels to the client. Any coordinates on such a booking are the
  // provider's own base (legacy rows snapshotted them before checkout stopped
  // doing so), and pointing the client's Directions button at them sends them
  // to the person who is on their way over.
  if (isMobileBooking(b)) return false;
  return (
    !isAddressPending(b.address) &&
    b.coordinates?.latitude != null &&
    b.coordinates?.longitude != null
  );
}

/** Statuses a booking never leaves. Nothing may re-derive a booking out of one
 *  of these on the client — the row reached this state server-side and the app
 *  is not entitled to overrule it.
 *
 *  Exported as one list rather than spelled out at each call site because the
 *  bug it exists to prevent was exactly an incomplete inline list: the
 *  pending-reschedule exemption in BookingContext named CANCELLED and NO_SHOW
 *  but not COMPLETED, so a completed booking with a stale open reschedule
 *  request was forced back to UPCOMING and could never leave the client's
 *  Upcoming tab. Add a new terminal status here and every guard picks it up. */
export const TERMINAL_BOOKING_STATUSES: readonly BookingStatus[] = [
  BookingStatus.COMPLETED,
  BookingStatus.CANCELLED,
  BookingStatus.NO_SHOW,
  BookingStatus.PROVIDER_NO_SHOW,
];

export function isTerminalBookingStatus(status: BookingStatus): boolean {
  return TERMINAL_BOOKING_STATUSES.includes(status);
}

/** Should a booking mid-reschedule be held at UPCOMING instead of being aged
 *  out by its original appointment date?
 *
 *  Yes while the reschedule is genuinely open — the date is being replaced, so
 *  judging the booking by the old one would expire it early. No once the
 *  booking is terminal: that state was reached server-side and the app doesn't
 *  get to overrule it.
 *
 *  Returns the status to force, or null to mean "fall through to the normal
 *  date-based derivation". A named unit rather than an inline condition
 *  because the defect it encodes was an inline list that omitted COMPLETED. */
export function pendingRescheduleStatusOverride(booking: {
  status: BookingStatus;
  isPendingReschedule?: boolean | undefined;
}): BookingStatus | null {
  if (!booking.isPendingReschedule) return null;
  if (isTerminalBookingStatus(booking.status)) return null;
  return BookingStatus.UPCOMING;
}

/** How long after a no-show is recorded the accused party can dispute it.
 *  Mirrors the same constant in dispute_no_show() and
 *  settle_no_show_reliability() (migration 20260827154500) — the RPC is the
 *  enforcement, this is only what decides whether to show the button. */
export const NO_SHOW_DISPUTE_WINDOW_DAYS = 7;

/**
 * Whether this booking's no-show can still be disputed, from the point of
 * view of the party it was recorded against.
 *
 * Deliberately does NOT check WHO is asking — the two hats reach this from
 * opposite directions (a client disputes 'no_show', a provider disputes
 * 'provider_no_show') and each screen only ever shows one of them. The RPC
 * checks identity properly; this decides whether there is a button at all.
 *
 * A booking marked before the dispute columns existed has no
 * noShowMarkedAt. Treat the window as open rather than hiding the button on
 * a technicality of when the row happened to be written — dispute_no_show()
 * makes the same allowance.
 */
export function canDisputeNoShow(
  b: {
    status?: BookingStatus | undefined;
    noShowMarkedAt?: string | undefined;
    noShowDisputedAt?: string | undefined;
  },
  status: BookingStatus.NO_SHOW | BookingStatus.PROVIDER_NO_SHOW,
  nowMs: number = Date.now(),
): boolean {
  if (b.status !== status) return false;
  if (b.noShowDisputedAt) return false;
  if (!b.noShowMarkedAt) return true;
  const markedMs = new Date(b.noShowMarkedAt).getTime();
  if (Number.isNaN(markedMs)) return true;
  return nowMs <= markedMs + NO_SHOW_DISPUTE_WINDOW_DAYS * 86400000;
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
  /** The stored, guaranteed-unique short code. Absent on rows written
   *  before migration 20260827153834, which is why formatBookingRef still
   *  falls back to truncating the id. */
  bookingRef?: string | undefined;
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

  // The provider's business_type, read live through the client_bookings view
  // rather than snapshotted — it decides whose address is the appointment's
  // location. Undefined on a booking read from a source that doesn't carry it
  // (see isMobileBooking).
  providerBusinessType?: string | undefined;

  // Address release tracking (for non-mobile providers)
  addressReleasedAt?: string | undefined;

  // No-show dispute state. All four are undefined on any booking that was
  // never marked as a no-show — and on every booking at all until migration
  // 20260827154500 is applied, since the reads are select('*').
  /** When the no-show was recorded, in either direction. Opens the dispute
   *  window (see canDisputeNoShow). */
  noShowMarkedAt?: string | undefined;
  /** When the ACCUSED party said it was false. Records a disagreement — it
   *  does not reverse the status, and nothing adjudicates it. */
  noShowDisputedAt?: string | undefined;
  /** The accused party's own words, shown to the other party. */
  noShowDisputeReason?: string | undefined;

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

  /** The client asked for a time this provider's own scheduling rules
   *  exclude, under one of their allow_*_requests opt-ins. Always pending
   *  until the provider accepts it — so the provider-facing screens have to
   *  say so before the Confirm button, not after. */
  isEmergencyRequest?: boolean | undefined;
}

export interface BookingsByDate {
  [date: string]: ConfirmedBooking[];
}

/** Why a cart item can't be booked, as one of a fixed set of reasons.
 *  `message` is a full sentence built for a dialog and can carry names, so it
 *  is no good for deciding anything — this is what a caller switches on when
 *  it needs its OWN shorter wording (see CartScreen's CART_ISSUE vocabulary,
 *  which used to have to string-match the sentence to recognise it).
 *
 *  cartCrossProviderClash: two items in THIS cart, different providers,
 *  overlapping time — the message names which provider, so (like
 *  clientClash) it can't be recognised by string-matching in toCartIssue(). */
export type BookingConflictCode = 'clientClash' | 'cartCrossProviderClash';

export interface BookingConflictResult {
  isValid: boolean;
  conflicts: {
    cartItemId: string;
    message: string;
    code?: BookingConflictCode;
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
