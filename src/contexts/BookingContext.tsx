// src/contexts/BookingContext.tsx
import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CartItem } from './CartContext';
import { AvailabilityService, parseDurationToMinutes } from '../services/AvailabilityService';
import { getMyBookings, getOlderBookings, getProviderIdByDisplayName, getProviderBySlug, updateBookingStatus as dbUpdateBookingStatus, insertBookingUserNotification, getProviderLocationsByIds, getProviderBookingCapSettingsForProviders, countProviderBookingsOnDates, getActiveRescheduleRequestsForBookings, getServiceIdsByNames, isSlotTaken, getSlotsTaken, cancelOwnBooking, providerCancelOwnBooking, requestRescheduleOwnBooking, confirmRescheduleOwnBooking, declineRescheduleOffer, confirmGroupReschedule as dbConfirmGroupReschedule, declineGroupRescheduleOffer, updateBookingGroupInfo, holdCartBookingSlots, claimCartBookingSlots, releaseCartBookingSlots, CartHoldItem, markProviderNoShow as dbMarkProviderNoShow, getCurrentAuthUserId, subscribeToUserBookingChanges, subscribeToRescheduleRequestChanges } from '../services/databaseService';
import { mapDbBookingToConfirmed, applyRescheduleRequestRow } from '../services/bookingService';
import { useBookingStore } from '../stores/useBookingStore';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { parseRescheduleRequestToken } from '../utils/rescheduleWindow';

import {
  BookingStatus,
  PaymentStatus,
  pendingRescheduleStatusOverride,
  type BookingCoordinates,
  type ConfirmedBooking,
  type BookingConflictResult,
  type AppointmentData,
  type AvailableDate,
  type PaymentBreakdown,
} from '../types/booking';
import { logger } from '../utils/logger';
import { formatTime12, formatLongDate } from '../utils/dateUtils';

export class BookingError extends Error {
  succeededCartItemIds: string[];
  // Total already paid for the bookings that DID persist, even though this
  // error represents an overall checkout failure. The payment layer needs
  // this to capture only that amount (and release the rest of the
  // authorisation) instead of treating any persistence failure as "capture
  // nothing" — which would leave a real, provider-visible booking marked
  // paid while the card was never actually charged for it.
  succeededAmountPaid: number;
  constructor(message: string, succeededCartItemIds: string[] = [], succeededAmountPaid = 0) {
    super(message);
    this.name = 'BookingError';
    this.succeededCartItemIds = succeededCartItemIds;
    this.succeededAmountPaid = succeededAmountPaid;
  }
}

// ── Re-export all shared types so existing import paths stay unchanged ──────
export type {
  BookingCoordinates,
  PaymentBreakdown,
  ConfirmedBooking,
  BookingsByDate,
  BookingConflictResult,
  AppointmentData,
  AvailableDate,
} from '../types/booking';
export { BookingStatus, PaymentStatus } from '../types/booking';

// Re-export the DB→local mapper so ProviderBookingHistoryScreen and others
// can import it from here without changing their import paths.
export { mapDbBookingToConfirmed };

/**
 * The client's own address, and which providers in the cart it actually
 * applies to.
 *
 * Only a MOBILE provider travels to the client, so only a mobile provider's
 * booking gets a client address. This used to be a bare `clientAddress?:
 * string` applied to every row in the cart — and because CartScreen seeds the
 * field from the account's saved default regardless of what's in the cart,
 * every booking a client with a saved address ever made was stamped with it.
 * That address then read as the appointment's location on the client's own
 * booking screens, hiding the salon's real (already released) address.
 *
 * `providerNames` holds `providerDisplayName ?? providerName` per cart item —
 * the same key CartScreen resolves mobile providers by.
 */
export interface MobileClientAddress {
  address: string;
  /**
   * The coarse area the client chose in Account > Your Address ("Camden,
   * London"). Travels with the address because it answers the same question
   * at a different resolution — but it is NOT gated: the provider reads it
   * the moment the request arrives, which is the whole point (they need to
   * judge travel before accepting, and the address is hidden until they do).
   *
   * Optional because a client who has never picked one is the normal case;
   * the DB then falls back to deriving a postcode district from the address,
   * and to NULL when there is no postcode to read.
   */
  area?: string | null;
  providerNames: readonly string[];
}

export interface BookingContextType {
  bookings: ConfirmedBooking[];
  confirmedBookings: ConfirmedBooking[];
  upcomingBookings: ConfirmedBooking[];
  pastBookings: ConfirmedBooking[];
  todayBookings: ConfirmedBooking[];
  currentBooking: ConfirmedBooking | null;
  nextBookings: ConfirmedBooking[];
  allTodayBookingsCompleted: boolean;

  // Actions
  createBookingsFromCart: (cartItems: CartItem[], appointmentData: AppointmentData[], mobileClientAddress?: MobileClientAddress, holdBatchId?: string) => Promise<void>;
  validateBookingsBeforeCheckout: (cartItems: CartItem[], appointmentData: AppointmentData[]) => Promise<BookingConflictResult>;
  // Reserves every cart item's slot as an on_hold booking, all-or-nothing,
  // for the 10-minute window while the user is on the payment screen —
  // closes the gap between "committed to paying" and "booking actually
  // inserted" that the claim RPC's insert-time-only conflict check can't
  // cover on its own. Only needs date/time per item (not full
  // AppointmentData — customer/payment details aren't known yet at this
  // point in checkout). Returns the batch id to pass into
  // createBookingsFromCart later (claim), or throws with the same
  // conflict-message shape validateBookingsBeforeCheckout already produces
  // if any item can't be held.
  holdCartCheckoutSlots: (
    cartItems: CartItem[],
    scheduleByItemId: Record<string, { selectedDate: string; selectedTime: string }>,
    /** The Confirm & Pay checkbox, passed through rather than assumed. It
     *  gates the button that calls this, so it is always true in practice —
     *  but hold_cart_booking_slots() rejects a batch without it, and reading
     *  the real state keeps the assertion honest if that gating ever changes. */
    consent: { policyAccepted: boolean; safetyAcknowledged: boolean }
  ) => Promise<string>;
  // Best-effort release of a hold batch when the user backs out of payment
  // before claiming it (close button, payment failure/cancel). Never throws
  // — the 10-minute TTL cron sweep is the real backstop, this just frees the
  // slot sooner. Safe to call on an already-claimed or already-expired batch.
  releaseCartCheckoutSlots: (holdBatchId: string) => Promise<void>;
  updateBookingStatus: (bookingId: string, status: BookingStatus) => Promise<void>;
  cancelBooking: (bookingId: string) => Promise<void>;
  // Reverse of the provider's no_show action — client marks the PROVIDER as
  // not having shown up. Routed through client_mark_provider_no_show() (see
  // supabase/fix_provider_no_show_status.sql), same guardrails philosophy
  // as the provider's own no_show button (same-day, appointment start
  // passed, terminal-state check, no active reschedule request) enforced
  // server-side.
  markProviderNoShow: (bookingId: string) => Promise<void>;
  getBookingsByProvider: (providerName: string) => ConfirmedBooking[];
  getBookingsByDate: (date: string) => ConfirmedBooking[];
  getBookingById: (bookingId: string) => ConfirmedBooking | undefined;
  getBookingsByGroupId: (groupId: string) => ConfirmedBooking[];
  canReschedule: (bookingId: string) => { canReschedule: boolean; reason?: string };
  refreshBookingStatuses: () => void;
  reloadBookings: () => Promise<void>;

  // getMyBookings() only loads a recent window (default 90 days) plus
  // everything upcoming, for scale — call this to page further back.
  hasMoreHistory: boolean;
  loadingMoreHistory: boolean;
  loadOlderBookings: () => Promise<void>;

  // Reschedule functions
  requestReschedule: (bookingId: string, preferredDates: string[]) => Promise<void>;
  providerRespondToReschedule: (bookingId: string, availableDates: AvailableDate[]) => Promise<void>;
  confirmReschedule: (bookingId: string, newDate: string, newTime: string) => Promise<void>;
  declineReschedule: (bookingId: string) => Promise<void>;
  // Group reschedule — confirm/decline every sibling booking sharing a
  // group_booking_id at once, matching a provider's group-scoped proposal
  // (see supabase/fix_group_booking_reschedule.sql). `siblings` and, for
  // confirm, `chain` come from getBookingsByGroupId() + the picked chain
  // out of the group's shared providerAvailableDates.
  confirmGroupReschedule: (
    groupBookingId: string,
    siblings: ConfirmedBooking[],
    newDate: string,
    newTime: string
  ) => Promise<void>;
  declineGroupReschedule: (groupBookingId: string, siblings: ConfirmedBooking[]) => Promise<void>;
}

const STORAGE_KEY = STORAGE_KEYS.BOOKINGS;

// Bookings that reached Supabase carry its UUID; legacy/local-only bookings
// have "booking_…" ids and must never be sent to the DB (uuid cast error)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isDbBookingId = (id: string) => UUID_RE.test(id);

// RFC4122-shaped v4 UUID (Math.random is fine here — these are correlation
// ids, not security tokens)
const generateUuid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

// Resolve every cart item to a real provider UUID. Chain: providerId
// carried on the cart item (canonical) → slug lookup → display-name lookup
// (legacy fallback). Shared by createBookingsFromCart and
// holdCartCheckoutSlots so both stay in sync — this used to live inline
// only inside createBookingsFromCart. Returns a map keyed by
// item.providerName (matching the cache key both callers already used) and
// the list of item names that failed to resolve, if any.
const resolveCartProviderIds = async (
  cartItems: CartItem[]
): Promise<{ providerIdCache: Record<string, string | null>; unresolvedNames: string[] }> => {
  const providerIdCache: Record<string, string | null> = {};

  const resolveOne = async (item: CartItem): Promise<string | null> => {
    if (item.providerId) return item.providerId;
    if (item.providerSlug) {
      const bySlug = await getProviderBySlug(item.providerSlug).catch(() => null);
      if (bySlug?.id) return bySlug.id;
    }
    return getProviderIdByDisplayName(item.providerName).catch(() => null);
  };

  // Genuine per-item fallback logic, so this stays a sequential loop — but
  // nothing inside it makes more than one Supabase call per distinct
  // provider name (cached by name across duplicate cart items).
  for (const item of cartItems) {
    const name = item.providerName;
    if (providerIdCache[name] === undefined) {
      providerIdCache[name] = await resolveOne(item);
    }
  }

  const unresolvedNames = [
    ...new Set(
      cartItems
        .filter(item => !providerIdCache[item.providerName])
        .map(i => i.providerDisplayName ?? i.providerName)
    ),
  ];

  return { providerIdCache, unresolvedNames };
};

/** cartItemId → real `services.id` UUID, for every item we can resolve one for.
 *
 *  A cart item's `serviceId` is whatever id the screen that added it had.
 *  Usually that's the live UUID, but some paths (rebook from a booking whose
 *  own service link was already missing, anything falling back to a local or
 *  synthetic id) carry something that is not a UUID — and `bookings.service_id`
 *  is a uuid FK, so those were written as NULL and the booking ended up with no
 *  link to the service it is for. Resolving by (provider, service name) puts
 *  the link back; an item that still can't be matched is written NULL exactly
 *  as before, so this can only ever improve a row.
 *
 *  One query per distinct provider, not one per item.
 */
const resolveCartServiceIds = async (
  cartItems: CartItem[],
  providerIdCache: Record<string, string | null>,
): Promise<Record<string, string>> => {
  const resolved: Record<string, string> = {};
  const needsLookup = new Map<string, CartItem[]>();

  for (const item of cartItems) {
    if (item.serviceId && UUID_RE.test(item.serviceId)) {
      resolved[item.id] = item.serviceId;
      continue;
    }
    const providerId = providerIdCache[item.providerName];
    if (!providerId || !item.serviceName) continue;
    const forProvider = needsLookup.get(providerId) ?? [];
    forProvider.push(item);
    needsLookup.set(providerId, forProvider);
  }

  await Promise.all(
    [...needsLookup.entries()].map(async ([providerId, items]) => {
      try {
        const byName = await getServiceIdsByNames(
          providerId,
          [...new Set(items.map(i => i.serviceName))],
        );
        for (const item of items) {
          const id = byName[item.serviceName];
          if (id) resolved[item.id] = id;
        }
      } catch (err) {
        // A failed lookup means the row keeps the NULL it would have had
        // anyway — never a reason to fail the checkout.
        logger.error('[Booking] service id resolution failed:', err);
      }
    }),
  );

  return resolved;
};

const BookingContext = createContext<BookingContextType | undefined>(undefined);

// ==================== HELPER FUNCTIONS ====================

const parseTimeToMinutes = (timeStr: string): number => {
  try {
    const cleanTime = timeStr.trim().toUpperCase();
    const isPM = cleanTime.includes('PM');
    const isAM = cleanTime.includes('AM');
    
    const timeOnly = cleanTime.replace(/\s*(AM|PM)/gi, '').trim();
    const timeParts = timeOnly.split(':');
    
    if (timeParts.length !== 2) return 0;
    
    const hoursStr = timeParts[0];
    const minutesStr = timeParts[1];
    
    if (!hoursStr || !minutesStr) return 0;
    
    let hours = parseInt(hoursStr);
    const minutes = parseInt(minutesStr);
    
    if (isNaN(hours) || isNaN(minutes)) return 0;
    
    if (isPM && hours !== 12) hours += 12;
    else if (isAM && hours === 12) hours = 0;
    
    return hours * 60 + minutes;
  } catch (error) {
    logger.error('❌ Error parsing time:', error);
    return 0;
  }
};

const calculateEndTime = (startTime: string, duration: string): string => {
  try {
    const startMinutes = parseTimeToMinutes(startTime);
    // Shared parser: the local first-match-only regex here read "1h 30min" as
    // 60 minutes, so a booking's stored end time was an hour after its start
    // no matter how long the service actually ran.
    if (!/\d/.test(duration)) return startTime;
    const durationMinutes = parseDurationToMinutes(duration);

    const totalMinutes = startMinutes + durationMinutes;
    const endHours = Math.floor(totalMinutes / 60) % 24;
    const endMinutes = totalMinutes % 60;

    return formatTime12(`${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`);
  } catch (error) {
    logger.error('❌ Error calculating end time:', error);
    return startTime;
  }
};

// Exported: the ONLY safe way to combine a YYYY-MM-DD date with a 12h/24h
// display time. `new Date("YYYY-MM-DDT10:00 AM")` is Invalid Date — screens
// that need booking timestamps must use this instead.
export const createBookingDateTime = (dateStr: string, timeStr: string): Date => {
  try {
    if (!dateStr || typeof dateStr !== 'string' || dateStr.length < 10) {
      logger.error('❌ Invalid date:', dateStr);
      return new Date();
    }
    
    if (!timeStr || typeof timeStr !== 'string') {
      logger.error('❌ Invalid time:', timeStr);
      return new Date();
    }
    
    const dateParts = dateStr.split('-');
    if (dateParts.length !== 3) {
      logger.error('❌ Invalid date format:', dateStr);
      return new Date();
    }
    
    const year = parseInt(dateParts[0] || '0');
    const month = parseInt(dateParts[1] || '0');
    const day = parseInt(dateParts[2] || '0');
    
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      logger.error('❌ Invalid date parts:', { year, month, day });
      return new Date();
    }
    
    const minutes = parseTimeToMinutes(timeStr);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    return new Date(year, month - 1, day, hours, mins, 0, 0);
  } catch (error) {
    logger.error('❌ Error creating booking datetime:', error);
    return new Date();
  }
};

const determineBookingStatus = (
  bookingDate: string, 
  bookingTime: string, 
  endTime: string, 
  currentStatus: BookingStatus
): BookingStatus => {
  if (
    currentStatus === BookingStatus.CANCELLED ||
    currentStatus === BookingStatus.NO_SHOW ||
    currentStatus === BookingStatus.COMPLETED ||
    // Awaiting provider confirmation — only the provider's action (synced
    // from the DB) moves a booking out of PENDING, never the passage of time
    currentStatus === BookingStatus.PENDING
  ) {
    return currentStatus;
  }
  
  try {
    const now = new Date();
    const appointmentStart = createBookingDateTime(bookingDate, bookingTime);
    let appointmentEnd = createBookingDateTime(bookingDate, endTime);

    // A booking row written before insertDirectBooking started requiring
    // end_time has bookings.end_time NULL, and mapDbBookingToConfirmed then
    // sets endTime to the START time. That made the appointment zero-length
    // here: `now <= appointmentEnd` was true for one millisecond, so the
    // booking skipped IN_PROGRESS entirely and flipped from UPCOMING to
    // COMPLETED the instant its start time passed — a client sitting in the
    // chair saw their live appointment filed under Past. Treat a
    // non-positive span as one hour, the same assumed length the provider
    // side's scheduleIssues.resolveSpan falls back to.
    if (appointmentEnd.getTime() <= appointmentStart.getTime()) {
      appointmentEnd = new Date(appointmentStart.getTime() + 60 * 60 * 1000);
    }

    if (now < appointmentStart) {
      return BookingStatus.UPCOMING;
    } else if (now >= appointmentStart && now <= appointmentEnd) {
      return BookingStatus.IN_PROGRESS;
    } else {
      return BookingStatus.COMPLETED;
    }
  } catch (error) {
    logger.error('❌ Error determining status:', error);
    return BookingStatus.UPCOMING;
  }
};

// Convert "10:00 AM" → "10:00:00" for Postgres TIME type
const timeTo24 = (t: string): string | null => {
  const match = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let hh = parseInt(match[1] ?? '0');
  const mm = parseInt(match[2] ?? '0');
  const pp = (match[3] ?? 'AM').toUpperCase();
  if (pp === 'PM' && hh !== 12) hh += 12;
  else if (pp === 'AM' && hh === 12) hh = 0;
  return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}:00`;
};

const sortBookingsByDateTime = (bookings: ConfirmedBooking[]): ConfirmedBooking[] => {
  return [...bookings].sort((a, b) => {
    const dateA = createBookingDateTime(a.bookingDate, a.bookingTime);
    const dateB = createBookingDateTime(b.bookingDate, b.bookingTime);
    return dateA.getTime() - dateB.getTime();
  });
};


// mapDbBookingStatus now lives in ../types/booking.ts (single source of
// truth, shared by BookingContext and bookingService without a circular
// import) and is re-exported here so existing importers of it from this
// module keep working.
export { mapDbBookingStatus } from '../types/booking';


// ==================== PROVIDER COMPONENT ====================

export const BookingProvider = ({ children }: { children: ReactNode }) => {
  const [bookings, setBookings] = useState<ConfirmedBooking[]>([]);
  // Mirror of the current booking ids, for the realtime handler below. Held in a
  // ref rather than read from `bookings` directly so the subscription doesn't
  // tear down and re-establish on every bookings change.
  const bookingIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    bookingIdsRef.current = new Set(bookings.map(b => b.id));
  }, [bookings]);
  const [isLoading, setIsLoading] = useState(true);
  // Paging state for history beyond getMyBookings()'s default recent window.
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);

  const loadBookings = useCallback(async () => {
    try {
      logger.log('Loading bookings from storage...');
      setIsLoading(true);
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      
      if (stored) {
        const parsed = JSON.parse(stored);
        logger.log('Loaded', parsed.length, 'bookings from storage');
        
        const cleanedBookings = parsed.map((booking: any) => {
          if (!booking.bookingDate || typeof booking.bookingDate !== 'string' || booking.bookingDate.length < 10) {
            logger.warn('Fixing corrupted date for booking:', booking.id);
            booking.bookingDate = new Date().toISOString().split('T')[0];
          }
          
          if (!booking.bookingTime || typeof booking.bookingTime !== 'string') {
            logger.warn('Fixing missing time for booking:', booking.id);
            booking.bookingTime = '10:00 AM';
          }
          
          if (booking.rescheduleRequest?.originalDate && booking.rescheduleRequest.originalDate.length < 10) {
            logger.warn('Fixing corrupted originalDate');
            booking.rescheduleRequest.originalDate = booking.bookingDate;
          }
          
          return booking;
        });
        
        const migratedBookings = cleanedBookings.map((booking: any) => {
          if ('depositPaid' in booking && !('paymentType' in booking)) {
            const subtotal = booking.price + 
              (booking.addOns?.reduce((sum: number, addon: any) => sum + addon.price, 0) || 0);
            const serviceCharge = booking.serviceCharge || 2.99;
            const total = subtotal + serviceCharge;
            const oldDepositPaid = booking.depositPaid || 0;
            const isFullPayment = Math.abs(total - oldDepositPaid) < 0.01;
            
            return {
              ...booking,
              paymentType: isFullPayment ? 'full' : 'deposit',
              amountPaid: oldDepositPaid,
              depositAmount: isFullPayment ? 0 : (oldDepositPaid - serviceCharge),
              remainingBalance: isFullPayment ? 0 : (subtotal - (oldDepositPaid - serviceCharge)),
              serviceCharge: serviceCharge,
              depositPaid: undefined,
            };
          }
          
          return {
            ...booking,
            paymentType: booking.paymentType || 'full',
            amountPaid: booking.amountPaid || 0,
            depositAmount: booking.depositAmount || 0,
            remainingBalance: booking.remainingBalance || 0,
            serviceCharge: booking.serviceCharge || 2.99,
            // Migrate existing bookings without customer info
            customerName: booking.customerName || '',
            customerEmail: booking.customerEmail || '',
            customerPhone: booking.customerPhone || '',
          };
        });

        // Show the cached copy immediately instead of blocking the screen on
        // the network merge below — the merge still runs and re-renders with
        // authoritative data once it resolves, but the user isn't staring at
        // a loading state for a round-trip that isn't needed to show *something*.
        setBookings(migratedBookings);
        setIsLoading(false);

        // Merge authoritative fields from Supabase for bookings that exist
        // there (status changes, provider-side reschedules, address release),
        // and pick up bookings created on other devices. Local-only bookings
        // (not yet synced) are kept as-is. Local reschedule/UI state is kept.
        let mergedBookings: ConfirmedBooking[] = migratedBookings;
        try {
          const userId = await getCurrentAuthUserId();
          if (userId) {
            const dbBookings = await getMyBookings();
            if (dbBookings.length > 0) {
              const dbById = new Map(dbBookings.map(d => [d.id, d]));
              mergedBookings = migratedBookings.map((b: ConfirmedBooking) => {
                const db = dbById.get(b.id);
                if (!db) return b;
                const fromDb = mapDbBookingToConfirmed(db);
                return {
                  ...b,
                  status: fromDb.status,
                  bookingDate: fromDb.bookingDate,
                  bookingTime: fromDb.bookingTime,
                  endTime: fromDb.endTime,
                  providerId: fromDb.providerId ?? b.providerId,
                  // Refresh from DB rather than trusting the cached copy — a
                  // provider adding/changing their logo after this booking was
                  // first cached should show up without the image staying
                  // stuck on whatever (possibly null) value was cached then.
                  providerImage: fromDb.providerImage ?? b.providerImage,
                  addressReleasedAt: fromDb.addressReleasedAt ?? b.addressReleasedAt,
                  // Address + coordinates are taken from the DB UNCONDITIONALLY
                  // (no `?? b.…` fallback). getMyBookings() reads the
                  // client_bookings view, which masks both until the provider's
                  // release policy allows them — so the view is the authority in
                  // BOTH directions. Falling back to the cached copy would (a)
                  // keep showing the stale pre-release value forever, so the
                  // address never appears once released, and (b) resurrect an
                  // address the policy has not unlocked. The view says null →
                  // we show nothing and let the release countdown render.
                  address: fromDb.address,
                  coordinates: fromDb.coordinates,
                  // The client's own address for mobile bookings is never masked
                  // by the view, so keep a local value that hasn't synced yet.
                  clientAddress: fromDb.clientAddress ?? b.clientAddress,
                  // Read live off the joined provider by the view, so it can
                  // only be absent on a client running against a DB that
                  // predates the column — keep the local value in that case.
                  providerBusinessType: fromDb.providerBusinessType ?? b.providerBusinessType,
                  remainingBalance: fromDb.remainingBalance,
                  paymentStatus: fromDb.paymentStatus,
                };
              });
              const localIds = new Set(migratedBookings.map((b: ConfirmedBooking) => b.id));
              const missingLocally = dbBookings
                .filter(d => !localIds.has(d.id))
                .map(mapDbBookingToConfirmed);
              // Drop local rows that claim a real Supabase id (already
              // adopted via the id-swap in createBookingsFromCart) but no
              // longer exist there — a genuine phantom (e.g. a checkout that
              // failed after the optimistic local save but before/instead of
              // the cleanup step ran). A still-`booking_`-prefixed id is a
              // fresh local-only booking not yet round-tripped (e.g. created
              // offline) and is kept regardless — it was never adopted, so
              // its absence from dbBookings doesn't mean anything failed.
              mergedBookings = mergedBookings.filter(
                (b: ConfirmedBooking) => dbById.has(b.id) || b.id.startsWith('booking_')
              );
              mergedBookings = [...mergedBookings, ...missingLocally];
            }
          }
        } catch {
          // Offline or fetch failed — local copy stands
        }

        // Hydrate reschedule state from booking_reschedule_requests. It is not
        // part of the bookings row, so mapDbBookingToConfirmed cannot carry it —
        // without this, isPendingReschedule/rescheduleRequest live only in
        // AsyncStorage and an in-flight reschedule is invisible on another
        // device. Separate try so a failure here doesn't discard the merge above.
        //
        // Order matters: this must run BEFORE the status pass below, which reads
        // isPendingReschedule to decide whether a booking is exempt from
        // date-based expiry.
        try {
          const rescheduleRows = await getActiveRescheduleRequestsForBookings(
            mergedBookings.map((b: ConfirmedBooking) => b.id)
          );
          mergedBookings = mergedBookings.map((b: ConfirmedBooking) =>
            applyRescheduleRequestRow(b, rescheduleRows[b.id])
          );
        } catch {
          // Offline — the catch-up sweep and realtime subscription still cover it
        }

        const updatedBookings = mergedBookings.map((booking: ConfirmedBooking) => {
          // A booking mid-reschedule should not be auto-expired based on the
          // original appointment date — the date is being replaced, so treat
          // it as still upcoming until the reschedule is resolved.
          //
          // Never out of a TERMINAL status, though: that state was reached
          // server-side and the app doesn't get to overrule it. This guard
          // used to name CANCELLED and NO_SHOW inline and omitted COMPLETED,
          // so a completed booking still carrying an open reschedule request
          // was forced back to UPCOMING — and since BookingsScreen also filters
          // pending-reschedule bookings out of Past, it could never leave the
          // Upcoming tab. Requests are now closed server-side when their
          // booking goes terminal (on_booking_terminal_close_reschedule), so
          // this is the second of two layers rather than the only one.
          const rescheduleHold = pendingRescheduleStatusOverride(booking);
          if (rescheduleHold) {
            return { ...booking, status: rescheduleHold };
          }
          return {
            ...booking,
            status: determineBookingStatus(
              booking.bookingDate,
              booking.bookingTime,
              booking.endTime,
              booking.status
            )
          };
        });

        setBookings(updatedBookings);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedBookings));

      } else {
        logger.log('No bookings in storage — trying Supabase fallback...');
        try {
          const userId = await getCurrentAuthUserId();
          if (userId) {
            const dbBookings = await getMyBookings();
            if (dbBookings.length > 0) {
              const mapped = dbBookings.map(mapDbBookingToConfirmed);
              setBookings(mapped);
              await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(mapped));
              logger.log('Loaded', mapped.length, 'bookings from Supabase');
            } else {
              setBookings([]);
            }
          } else {
            setBookings([]);
          }
        } catch {
          setBookings([]);
        }
      }
    } catch (error) {
      logger.error('❌ Failed to load bookings:', error);
      setBookings([]);
      throw error; // Re-throw so screens can show UI feedback
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBookings().catch(() => {
      // Initial load failure is logged above; screens handle their own UI
    });
  }, [loadBookings]);

  // Realtime: re-fetch bookings whenever a booking row changes for the current user
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let active = true;

    getCurrentAuthUserId().then(userId => {
      if (!active || !userId) return;
      unsubscribe = subscribeToUserBookingChanges(userId, () => {
            // A booking was inserted/updated — reload to reflect latest status.
            // Also update the Zustand store so non-context consumers stay fresh.
            loadBookings().catch(() => {});
            useBookingStore.getState().refreshBookings(userId).catch(() => {});
      });
    }).catch(() => {});

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [loadBookings]);

  const saveBookings = useCallback(async (bookingsToSave: ConfirmedBooking[]) => {
    try {
      logger.log('Saving', bookingsToSave.length, 'bookings...');
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(bookingsToSave));
      setBookings(bookingsToSave);
      // Keep the Zustand store in sync so non-context consumers stay current
      useBookingStore.getState().setBookings(bookingsToSave);
      logger.log('Bookings saved successfully');
    } catch (error) {
      logger.error('❌ Failed to save bookings:', error);
      throw error;
    }
  }, []);

  const canReschedule = useCallback((bookingId: string): { canReschedule: boolean; reason?: string } => {
    // ✅ Use bookings from state for synchronous UI checks
    // Note: The actual reschedule functions read fresh from AsyncStorage
    const booking = bookings.find(b => b.id === bookingId);

    if (!booking) {
      return { canReschedule: false, reason: 'Booking not found' };
    }

    if (booking.status !== BookingStatus.UPCOMING) {
      return { canReschedule: false, reason: 'Only upcoming bookings can be rescheduled' };
    }

    // ✅ STEP 1: Check if PENDING (waiting for provider response)
    // Block new reschedule requests while waiting
    if (booking.isPendingReschedule && !booking.rescheduleRequest?.providerAvailableDates) {
      return { canReschedule: false, reason: 'Waiting for provider to respond with available dates' };
    }

    // ✅ STEP 2: Check if AVAILABLE (provider has responded)
    // Allow user to proceed to select date - this is NOT blocked
    if (booking.isPendingReschedule && booking.rescheduleRequest?.providerAvailableDates) {
      return { canReschedule: true }; // User can select from available dates
    }

    // ✅ STEP 3: Check 24-hour cooldown (only applies to new reschedule requests)
    // This prevents spam reschedules after confirming
    if (booking.rescheduleRequest?.lastRescheduledAt) {
      const lastRescheduleTime = new Date(booking.rescheduleRequest.lastRescheduledAt);
      const now = new Date();
      const hoursSinceLastReschedule = (now.getTime() - lastRescheduleTime.getTime()) / (1000 * 60 * 60);

      if (hoursSinceLastReschedule < 24) {
        const hoursRemaining = Math.ceil(24 - hoursSinceLastReschedule);
        return {
          canReschedule: false,
          reason: `You can reschedule again in ${hoursRemaining} hour${hoursRemaining !== 1 ? 's' : ''}`
        };
      }
    }

    // ✅ All checks passed - can initiate new reschedule request
    return { canReschedule: true };
  }, [bookings]);

  const requestReschedule = useCallback(async (bookingId: string, preferredDates: string[]) => {
    try {
      // ✅ FIX: Read fresh from AsyncStorage to avoid stale closure issues with concurrent reschedules
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (!stored) throw new Error('No bookings found in storage');

      const currentBookings: ConfirmedBooking[] = JSON.parse(stored);
      const booking = currentBookings.find(b => b.id === bookingId);

      if (!booking) throw new Error('Booking not found');

      // ✅ FIX: Inline reschedule validation using fresh booking data
      if (booking.status !== BookingStatus.UPCOMING) {
        throw new Error('Only upcoming bookings can be rescheduled');
      }

      // Check if PENDING (waiting for provider response) - block new requests
      if (booking.isPendingReschedule && !booking.rescheduleRequest?.providerAvailableDates) {
        throw new Error('Waiting for provider to respond with available dates');
      }

      // Check 24-hour cooldown
      if (booking.rescheduleRequest?.lastRescheduledAt) {
        const lastRescheduleTime = new Date(booking.rescheduleRequest.lastRescheduledAt);
        const now = new Date();
        const hoursSinceLastReschedule = (now.getTime() - lastRescheduleTime.getTime()) / (1000 * 60 * 60);

        if (hoursSinceLastReschedule < 24) {
          const hoursRemaining = Math.ceil(24 - hoursSinceLastReschedule);
          throw new Error(`You can reschedule again in ${hoursRemaining} hour${hoursRemaining !== 1 ? 's' : ''}`);
        }
      }

      logger.log('Step 1: User requesting reschedule for:', bookingId);

      // Persist to Supabase BEFORE committing locally, and let a failure
      // throw before any local state changes. This used to save the
      // optimistic "pending" state to AsyncStorage/React state first and
      // call the RPC after — so a failed RPC call (e.g. the requested_dates
      // date[]/text[] type-mismatch fixed by
      // fix_reschedule_requested_dates_type_mismatch.sql) left the local
      // cache saying "pending" with no matching row server-side. The very
      // next attempt then hit the isPendingReschedule guard above and threw
      // "Waiting for provider to respond" — a false positive from stale
      // local state, not a real conflict — while the UI had just reported
      // "Reschedule Failed" for the same request. Writing first (same order
      // confirmReschedule() below already uses, see its comment) means a
      // failure leaves the booking's local state untouched and retryable.
      //
      // Routed through request_reschedule_own_booking() instead of a plain
      // upsert — enforces the 24h cooldown, the provider's maxReschedules
      // cap, and the provider's reschedule notice window server-side (see
      // supabase/booking_rules_server_enforcement.sql). The checks above in
      // this function are just an optimistic pre-check for instant UI
      // feedback; the RPC is the real gate and its rejection message wins
      // if the two ever disagree (e.g. a stale local cache).
      await requestRescheduleOwnBooking(bookingId, preferredDates);

      // ✅ Preserve original date/time from FIRST reschedule request
      const originalDate = booking.rescheduleRequest?.originalDate || booking.bookingDate;
      const originalTime = booking.rescheduleRequest?.originalTime || booking.bookingTime;
      const rescheduleCount = (booking.rescheduleRequest?.rescheduleCount || 0);

      // preferredDates elements are "YYYY-MM-DD" or "YYYY-MM-DD HH:MM" (see
      // RescheduleScreen.tsx handleSubmit) — split so the UI can show the
      // requested date and time separately, mirroring how the RPC now splits
      // them into requested_dates/requested_times server-side.
      // Split on the FIRST space only (see parseRescheduleRequestToken).
      // `d.split(' ')[1]` kept just the first token of the time, so a
      // 12-hour "2026-09-01 2:30 PM" was stored locally as "2:30" — which
      // formatTime12Safe then rendered back to the client as 2:30 AM.
      const requestedDatesOnly = preferredDates.map(d => parseRescheduleRequestToken(d)[0]);
      const requestedTimesOnly = preferredDates.map(d => parseRescheduleRequestToken(d)[1]);

      // ✅ Update only the specific booking
      const updatedBooking = {
        ...booking,
        isPendingReschedule: true, // ✅ PENDING state
        rescheduleRequest: {
          originalDate,
          originalTime,
          requestedDates: requestedDatesOnly,
          requestedTimes: requestedTimesOnly,
          requestedAt: new Date().toISOString(),
          rescheduleCount, // Don't increment yet, only on confirm
          ...(booking.rescheduleRequest?.lastRescheduledAt && { lastRescheduledAt: booking.rescheduleRequest.lastRescheduledAt }),
        },
        updatedAt: new Date().toISOString(),
      } as ConfirmedBooking;

      // ✅ FIX: Map over fresh bookings from storage, not stale state
      const updatedBookings = currentBookings.map(b => b.id === bookingId ? updatedBooking : b);

      await saveBookings(updatedBookings);

      // Provider notification is now trigger-owned (handle_reschedule_request_change()
      // in supabase/fix_reschedule_flow_completion.sql fires on the INSERT
      // that request_reschedule_own_booking() just performed) — no app-side
      // insert needed here anymore.

      logger.log('Step 1 Complete: Status=PENDING, waiting for provider response');
    } catch (error) {
      logger.error('❌ Failed to request reschedule:', error);
      throw error;
    }
  }, [saveBookings]);

  const providerRespondToReschedule = useCallback(async (
    bookingId: string,
    availableDates: AvailableDate[]
  ) => {
    try {
      logger.log('Step 2: Provider responding with available dates for:', bookingId);

      // ✅ FIX: Read fresh from AsyncStorage to avoid stale closure issues with concurrent reschedules
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (!stored) throw new Error('No bookings found in storage');

      const currentBookings: ConfirmedBooking[] = JSON.parse(stored);
      const targetBooking = currentBookings.find(b => b.id === bookingId);

      if (!targetBooking) throw new Error('Booking not found');

      // ✅ FIX: Skip if provider already responded (prevent duplicate responses)
      if (targetBooking.rescheduleRequest?.providerAvailableDates) {
        logger.log(`[${targetBooking.providerName}] Skipping - provider already responded for booking ${bookingId}`);
        return;
      }

      // Not pending locally + no client request on file = PROVIDER-initiated
      // reschedule (provider proposed new slots directly). Only accept it for
      // bookings that can still move; a cancelled/completed booking stays put.
      if (!targetBooking.isPendingReschedule &&
          targetBooking.status !== BookingStatus.UPCOMING &&
          targetBooking.status !== BookingStatus.PENDING) {
        logger.log(`[${targetBooking.providerName}] Skipping - booking ${bookingId} is ${targetBooking.status}, cannot reschedule`);
        return;
      }

      logger.log(`[${targetBooking.providerName}] Before update:`, {
        isPending: targetBooking.isPendingReschedule,
        hasDates: !!targetBooking.rescheduleRequest?.providerAvailableDates,
        datesCount: targetBooking.rescheduleRequest?.providerAvailableDates?.length || 0
      });

      // ✅ Update only the specific booking
      const updatedBooking: ConfirmedBooking = {
        ...targetBooking,
        isPendingReschedule: true, // ✅ AVAILABLE state (also entered directly for provider-initiated reschedules)
        rescheduleRequest: {
          ...targetBooking.rescheduleRequest,
          // Provider-initiated requests have no prior originals — fall back to
          // the booking's current date/time so the UI can show what's moving
          originalDate: targetBooking.rescheduleRequest?.originalDate ?? targetBooking.bookingDate,
          originalTime: targetBooking.rescheduleRequest?.originalTime ?? targetBooking.bookingTime,
          requestedDates: targetBooking.rescheduleRequest?.requestedDates,
          requestedAt: targetBooking.rescheduleRequest?.requestedAt,
          rescheduleCount: targetBooking.rescheduleRequest?.rescheduleCount,
          lastRescheduledAt: targetBooking.rescheduleRequest?.lastRescheduledAt,
          providerAvailableDates: availableDates, // ✅ Explicitly set
          providerRespondedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      };

      logger.log(`[${targetBooking.providerName}] After update:`, {
        isPending: updatedBooking.isPendingReschedule,
        hasDates: !!updatedBooking.rescheduleRequest?.providerAvailableDates,
        datesCount: updatedBooking.rescheduleRequest?.providerAvailableDates?.length || 0
      });

      // ✅ FIX: Map over fresh bookings from storage, not stale state
      const updatedBookings = currentBookings.map(b => b.id === bookingId ? updatedBooking : b);

      await saveBookings(updatedBookings);

      logger.log('Step 2 Complete: Status=AVAILABLE, user can now select date');
    } catch (error) {
      logger.error('❌ Failed to process provider response:', error);
      throw error;
    }
  }, [saveBookings]);

  // Realtime: apply provider reschedule responses the moment they land, plus a
  // catch-up sweep on mount for responses that arrived while the app was
  // closed. Without this, the response only surfaced via the push-notification
  // deep link — if push failed or the user opened Bookings manually, the
  // provider's offered dates never appeared.
  useEffect(() => {
    let cancelled = false;

    const applyProviderResponse = async (
      bookingId: string,
      slots: AvailableDate[] | null | undefined
    ) => {
      if (!slots || slots.length === 0) return;
      try {
        await providerRespondToReschedule(bookingId, slots);
      } catch {
        // Booking not on this device or already applied — safe to ignore
      }
    };

    // Provider declined the client's request outright (reject_reschedule_request,
    // see supabase/fix_reschedule_flow_completion.sql) — clear local pending
    // state so RescheduleScreen/BookingDetailScreen stop showing "waiting on
    // provider" for a request that's actually closed. The notification
    // explaining WHY is trigger-owned and arrives separately; this just
    // keeps the booking's local state from going stale.
    const applyRejection = async (bookingId: string) => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!stored) return;
        const current: ConfirmedBooking[] = JSON.parse(stored);
        const booking = current.find(b => b.id === bookingId);
        if (!booking || !booking.isPendingReschedule) return;
        const updated: ConfirmedBooking = {
          ...booking,
          isPendingReschedule: false,
          rescheduleRequest: {
            ...(booking.rescheduleRequest?.rescheduleCount != null
              ? { rescheduleCount: booking.rescheduleRequest.rescheduleCount }
              : {}),
            ...(booking.rescheduleRequest?.lastRescheduledAt
              ? { lastRescheduledAt: booking.rescheduleRequest.lastRescheduledAt }
              : {}),
          },
          updatedAt: new Date().toISOString(),
        };
        await saveBookings(current.map(b => b.id === bookingId ? updated : b));
      } catch {
        // Safe to ignore — worst case the banner clears next time bookings reload.
      }
    };

    // Catch-up: local bookings still waiting on a provider response
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!stored) return;
        const current: ConfirmedBooking[] = JSON.parse(stored);
        const waiting = current.filter(
          b =>
            // Client requested, still waiting on the provider's dates…
            (b.isPendingReschedule && !b.rescheduleRequest?.providerAvailableDates) ||
            // …or an upcoming booking the PROVIDER may have asked to move
            // while this app was closed (provider-initiated reschedule)
            (!b.isPendingReschedule && b.status === BookingStatus.UPCOMING)
        );
        // No .catch() swallow here: an empty map means "no active request"
        // to the applyRejection branch below, so a failed fetch used to clear
        // isPendingReschedule on bookings whose request was still live
        // server-side. Let it throw into the outer catch and leave local
        // state alone — the realtime subscription below still covers us.
        const rescheduleRows = await getActiveRescheduleRequestsForBookings(
          waiting.map(b => b.id)
        );
        for (const b of waiting) {
          if (cancelled) break;
          const req = rescheduleRows[b.id];
          if (req?.status === 'provider_responded') {
            await applyProviderResponse(
              b.id,
              req.provider_available_slots as AvailableDate[] | null
            );
          } else if (!req && b.isPendingReschedule) {
            // No active (pending/provider_responded) row remains for a
            // booking this device still thinks is mid-reschedule — it was
            // resolved elsewhere (rejected, cancelled, or confirmed on
            // another device) while this app was closed. Clear local state.
            await applyRejection(b.id);
          }
        }
      } catch {
        // Offline — realtime subscription below still covers the live case
      }
    })();

    // booking_reschedule_requests has no user_id column, and postgres_changes
    // filters only support single-column equality — so this subscription cannot
    // be narrowed server-side and RLS on the table is the actual access gate.
    // The membership check below is a local optimisation, not a security
    // boundary: it stops a row for someone else's booking from triggering an
    // AsyncStorage read/write cycle that would find nothing to update.
    const unsubscribe = subscribeToRescheduleRequestChanges(
        (row) => {
          if (!row?.booking_id || !bookingIdsRef.current.has(row.booking_id)) return;
          if (row.status === 'provider_responded') {
            applyProviderResponse(row.booking_id, row.provider_available_slots);
          } else if (row.status === 'rejected') {
            applyRejection(row.booking_id);
          }
        },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [providerRespondToReschedule, saveBookings]);

  const confirmReschedule = useCallback(async (bookingId: string, newDate: string, newTime: string) => {
    try {
      logger.log('Step 3: User confirming reschedule:', bookingId, newDate, newTime);

      // ✅ FIX: Read fresh from AsyncStorage to avoid stale closure issues with concurrent reschedules
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (!stored) throw new Error('No bookings found in storage');

      const currentBookings: ConfirmedBooking[] = JSON.parse(stored);
      const booking = currentBookings.find(b => b.id === bookingId);

      if (!booking) throw new Error('Booking not found');

      // ✅ FIX: Skip if booking is no longer pending (was cancelled or already confirmed)
      if (!booking.isPendingReschedule) {
        logger.log(`[${booking.providerName}] Skipping confirm - booking ${bookingId} is no longer pending reschedule`);
        return;
      }

      // Last-moment double-booking guard. The client picked this slot from the
      // provider's offered dates, but another client may have taken it in the
      // meantime — without this the reschedule silently collided and relied on
      // the unique index to reject it, surfacing as an opaque failure.
      const slotProviderId =
        booking.providerId ?? (await getProviderIdByDisplayName(booking.providerName).catch(() => null));
      const newTime24 = timeTo24(newTime);
      if (slotProviderId && newTime24 && (await isSlotTaken(slotProviderId, newDate, newTime24))) {
        throw new Error('That time has just been taken. Please pick another slot.');
      }

      // Prefer the stated duration; when it's missing/unparseable (common for
      // bookings synced from Supabase) fall back to the original start→end
      // span so the rescheduled booking never ends the minute it starts —
      // an end_time equal to booking_time makes the auto-complete cron close
      // the appointment at its start.
      let newEndTime = calculateEndTime(newTime, booking.duration);
      if (newEndTime === newTime) {
        const spanMins = parseTimeToMinutes(booking.endTime) - parseTimeToMinutes(booking.bookingTime);
        newEndTime = calculateEndTime(newTime, `${spanMins > 0 ? spanMins : 60} minutes`);
      }

      const originalDate = booking.rescheduleRequest?.originalDate || booking.bookingDate;
      const originalTime = booking.rescheduleRequest?.originalTime || booking.bookingTime;
      // ✅ Increment rescheduleCount ONLY when confirming (not on request)
      const rescheduleCount = (booking.rescheduleRequest?.rescheduleCount || 0) + 1;

      // ✅ Update only the specific booking
      const updatedBooking = {
        ...booking,
        bookingDate: newDate,
        bookingTime: newTime,
        endTime: newEndTime,
        isPendingReschedule: false, // ✅ Clear pending state → UPCOMING
        rescheduleRequest: {
          originalDate,
          originalTime,
          rescheduleCount, // ✅ Track total reschedules for this booking
          lastRescheduledAt: new Date().toISOString(), // ✅ Start 24hr cooldown
        },
        updatedAt: new Date().toISOString(),
      } as ConfirmedBooking;

      // ✅ FIX: Map over fresh bookings from storage, not stale state
      const updatedBookings = currentBookings.map(b => b.id === bookingId ? updatedBooking : b);

      // Persist to Supabase BEFORE committing locally, and let a failure throw.
      // This used to be fire-and-forget with a swallowed error, so a failed write
      // left the client's cache saying "rescheduled" while the DB kept the old
      // slot — the client and the provider then saw different appointment times
      // with nothing surfaced. Writing first means a failure leaves the booking
      // in its previous (still-pending) state and RescheduleScreen reports it.
      //
      // Routed through confirm_reschedule_own_booking() instead of a plain
      // date/time update — requires a real provider-approved request to
      // exist server-side (a tampered client can't invent a reschedule),
      // and increments reschedule_count/last_rescheduled_at so the next
      // request_reschedule_own_booking() call sees accurate cooldown/cap
      // state even if this device's AsyncStorage is cleared or out of sync.
      await confirmRescheduleOwnBooking(bookingId, newDate, newTime, newEndTime);

      await saveBookings(updatedBookings);

      // Provider notification is now trigger-owned (handle_reschedule_request_change()
      // in supabase/fix_reschedule_flow_completion.sql fires on the
      // confirm_reschedule_own_booking() UPDATE above) — no app-side insert
      // needed here anymore.

      logger.log('Step 3 Complete: Status=UPCOMING, 24hr cooldown active, total reschedules:', rescheduleCount);
    } catch (error) {
      logger.error('❌ Failed to confirm reschedule:', error);
      throw error;
    }
  }, [saveBookings]);

  // Client declines a provider's offered reschedule times. The booking
  // itself is untouched server-side (decline_reschedule_offer only closes
  // the request row) — clear the local pending flags to match, so the
  // booking falls back to displaying its original, still-confirmed date/time.
  const declineReschedule = useCallback(async (bookingId: string) => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (!stored) throw new Error('No bookings found in storage');

      const currentBookings: ConfirmedBooking[] = JSON.parse(stored);
      const booking = currentBookings.find(b => b.id === bookingId);
      if (!booking) throw new Error('Booking not found');

      await declineRescheduleOffer(bookingId);

      const updatedBooking: ConfirmedBooking = {
        ...booking,
        isPendingReschedule: false,
        rescheduleRequest: {
          ...(booking.rescheduleRequest?.rescheduleCount != null
            ? { rescheduleCount: booking.rescheduleRequest.rescheduleCount }
            : {}),
          ...(booking.rescheduleRequest?.lastRescheduledAt
            ? { lastRescheduledAt: booking.rescheduleRequest.lastRescheduledAt }
            : {}),
        },
        updatedAt: new Date().toISOString(),
      };

      const updatedBookings = currentBookings.map(b => b.id === bookingId ? updatedBooking : b);
      await saveBookings(updatedBookings);
    } catch (error) {
      logger.error('❌ Failed to decline reschedule offer:', error);
      throw error;
    }
  }, [saveBookings]);

  // Confirm ONE proposed day for a whole group reschedule at once — every
  // sibling this client has with the provider (identified by a shared
  // rescheduleRequest.groupRescheduleBatchId, see
  // supabase/fix_group_booking_reschedule.sql) moves to its own shifted
  // time from that chosen day, together. `chain` is the exact per-sibling
  // date/time/endTime the client picked (index-aligned to `siblings`,
  // sorted the same way the provider's proposal was built — earliest
  // original appointment first) — this mirrors how confirmReschedule above
  // trusts a single already-chosen newDate/newTime rather than
  // re-deriving it. The double-booking guard (isSlotTaken) still runs per
  // sibling, same as the single-booking path, since a slot can be taken by
  // someone else between the provider proposing and the client confirming.
  // newDate/newTime is the representative sibling's picked slot — same
  // "already chosen, don't re-derive" trust model as the singular
  // confirmReschedule above. Each OTHER sibling's own time for that same
  // date is read straight off its own rescheduleRequest.providerAvailableDates
  // (every sibling's request row was proposed for the same set of candidate
  // days, just with each sibling's own shifted time per day — see
  // provider_initiate_group_reschedule). endTime is recomputed from each
  // sibling's own duration, same as the singular path — provider_available_
  // slots only ever stores a start time, never an end time.
  const confirmGroupReschedule = useCallback(async (
    groupBookingId: string,
    siblings: ConfirmedBooking[],
    newDate: string,
    newTime: string
  ) => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (!stored) throw new Error('No bookings found in storage');
      const currentBookings: ConfirmedBooking[] = JSON.parse(stored);

      const perSiblingTime = new Map<string, string>();
      for (const sib of siblings) {
        const time = sib.rescheduleRequest?.providerAvailableDates?.find(d => d.date === newDate)?.times?.[0];
        if (!time) throw new Error(`Could not determine ${sib.serviceName}'s time for this date.`);
        perSiblingTime.set(sib.id, time);
      }

      for (const sib of siblings) {
        const time = perSiblingTime.get(sib.id)!;
        const slotProviderId =
          sib.providerId ?? (await getProviderIdByDisplayName(sib.providerName).catch(() => null));
        const time24 = timeTo24(time);
        if (slotProviderId && time24 && (await isSlotTaken(slotProviderId, newDate, time24))) {
          throw new Error(`That time for ${sib.serviceName} has just been taken. Please pick another day.`);
        }
      }

      const selections = siblings.map(sib => {
        const time = perSiblingTime.get(sib.id)!;
        return {
          booking_id: sib.id,
          new_date: newDate,
          new_time: time,
          new_end_time: calculateEndTime(time, sib.duration),
        };
      });

      await dbConfirmGroupReschedule(groupBookingId, selections);

      const selectionById = new Map(selections.map(s => [s.booking_id, s]));
      const updatedBookings = currentBookings.map(b => {
        const sel = selectionById.get(b.id);
        if (!sel) return b;
        const originalDate = b.rescheduleRequest?.originalDate || b.bookingDate;
        const originalTime = b.rescheduleRequest?.originalTime || b.bookingTime;
        const rescheduleCount = (b.rescheduleRequest?.rescheduleCount || 0) + 1;
        return {
          ...b,
          bookingDate: sel.new_date,
          bookingTime: sel.new_time,
          endTime: sel.new_end_time,
          isPendingReschedule: false,
          rescheduleRequest: {
            originalDate,
            originalTime,
            rescheduleCount,
            lastRescheduledAt: new Date().toISOString(),
          },
          updatedAt: new Date().toISOString(),
        } as ConfirmedBooking;
      });

      await saveBookings(updatedBookings);
    } catch (error) {
      logger.error('❌ Failed to confirm group reschedule:', error);
      throw error;
    }
  }, [saveBookings]);

  const declineGroupReschedule = useCallback(async (groupBookingId: string, siblings: ConfirmedBooking[]) => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (!stored) throw new Error('No bookings found in storage');
      const currentBookings: ConfirmedBooking[] = JSON.parse(stored);

      await declineGroupRescheduleOffer(groupBookingId);

      const siblingIds = new Set(siblings.map(s => s.id));
      const updatedBookings = currentBookings.map(b => {
        if (!siblingIds.has(b.id)) return b;
        return {
          ...b,
          isPendingReschedule: false,
          rescheduleRequest: {
            ...(b.rescheduleRequest?.rescheduleCount != null
              ? { rescheduleCount: b.rescheduleRequest.rescheduleCount }
              : {}),
            ...(b.rescheduleRequest?.lastRescheduledAt
              ? { lastRescheduledAt: b.rescheduleRequest.lastRescheduledAt }
              : {}),
          },
          updatedAt: new Date().toISOString(),
        } as ConfirmedBooking;
      });

      await saveBookings(updatedBookings);
    } catch (error) {
      logger.error('❌ Failed to decline group reschedule offer:', error);
      throw error;
    }
  }, [saveBookings]);

  const cancelBooking = useCallback(async (bookingId: string) => {
    try {
      logger.log('Cancelling booking:', bookingId);

      // ✅ FIX: Read fresh from AsyncStorage to avoid stale closure issues
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const currentBookings: ConfirmedBooking[] = stored ? JSON.parse(stored) : [];
      const booking = currentBookings.find(b => b.id === bookingId);

      // Sync to Supabase FIRST — the DB row is what the other party sees.
      // If this fails, nothing is changed locally and the caller gets the
      // error. (Legacy local-only ids never existed in the DB — skip.)
      // The status-change trigger handles the rest server-side: notifying
      // the right party and inviting the next waitlist entry.
      //
      // Routed through cancel_own_booking() / provider_cancel_own_booking()
      // (SECURITY DEFINER RPCs) instead of a plain status update — enforces
      // the provider's cancellation_notice_hours server-side, which a raw
      // .update({status:'cancelled'}) has no way to check (RLS just checks
      // ownership, not business rules). This one function serves both the
      // client and provider cancel buttons, so it tries the client path
      // first and falls back to the provider path on ownership mismatch;
      // any other error (e.g. the notice-window message) is a real
      // rejection and must reach the caller as-is, not be masked by a
      // second attempt.
      if (isDbBookingId(bookingId)) {
        try {
          await cancelOwnBooking(bookingId);
        } catch (clientError: any) {
          if (!String(clientError?.message ?? '').includes('Booking not found')) {
            throw clientError;
          }
          await providerCancelOwnBooking(bookingId);
        }
      }

      if (booking) {
        const updatedBookings = currentBookings.map(b =>
          b.id === bookingId
            ? {
                ...b,
                status: BookingStatus.CANCELLED,
                isPendingReschedule: false,
                updatedAt: new Date().toISOString(),
              }
            : b
        );
        await saveBookings(updatedBookings);
      }

      logger.log('Booking cancelled successfully');
    } catch (error) {
      logger.error('❌ Failed to cancel booking:', error);
      throw error;
    }
  }, [saveBookings]);

  // Reverse of the provider's no_show action — client marks the PROVIDER as
  // not having shown up. Routed through client_mark_provider_no_show()
  // (SECURITY DEFINER RPC, see supabase/fix_provider_no_show_status.sql),
  // which enforces the same guardrails as the provider's own no_show button
  // server-side (same calendar day, appointment start time passed, terminal-
  // state check, no active reschedule request) — this app never trusts a
  // client-side check alone for that kind of rule. The provider is notified
  // by handle_booking_status_change() (DB trigger owns this).
  const markProviderNoShow = useCallback(async (bookingId: string) => {
    try {
      logger.log('Marking provider no-show:', bookingId);
      if (!isDbBookingId(bookingId)) return;
      await dbMarkProviderNoShow(bookingId);

      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const currentBookings: ConfirmedBooking[] = stored ? JSON.parse(stored) : [];
      const booking = currentBookings.find(b => b.id === bookingId);
      if (booking) {
        const updatedBookings = currentBookings.map(b =>
          b.id === bookingId
            ? { ...b, status: BookingStatus.PROVIDER_NO_SHOW, updatedAt: new Date().toISOString() }
            : b
        );
        await saveBookings(updatedBookings);
      }

      logger.log('Provider marked no-show successfully');
    } catch (error) {
      logger.error('❌ Failed to mark provider no-show:', error);
      throw error;
    }
  }, [saveBookings]);

  const updateBookingStatus = useCallback(async (bookingId: string, status: BookingStatus) => {
    try {
      const updatedBookings = bookings.map(b =>
        b.id === bookingId ? { ...b, status, updatedAt: new Date().toISOString() } : b
      );
      await saveBookings(updatedBookings);
      // Sync to Supabase — map context BookingStatus enum → DB status string
      const dbStatusMap: Record<string, string> = {
        [BookingStatus.PENDING]:      'pending',
        [BookingStatus.UPCOMING]:     'confirmed',
        [BookingStatus.IN_PROGRESS]:  'in_progress',
        [BookingStatus.COMPLETED]:    'completed',
        [BookingStatus.CANCELLED]:    'cancelled',
        [BookingStatus.NO_SHOW]:      'no_show',
      };
      // The DB is the source of truth the OTHER party sees — a provider
      // confirming/starting/completing a booking must know if it didn't
      // stick, so failures propagate to the caller instead of vanishing.
      // (Legacy local-only ids never existed in the DB — nothing to sync.)
      const dbStatus = dbStatusMap[status];
      if (dbStatus && isDbBookingId(bookingId)) {
        await dbUpdateBookingStatus(bookingId, dbStatus as any);
      }
    } catch (error) {
      logger.error('❌ Failed to update booking status:', error);
      throw error;
    }
  }, [bookings, saveBookings]);

  const validateBookingsBeforeCheckout = useCallback(async (
    cartItems: CartItem[],
    appointmentData: AppointmentData[]
  ): Promise<BookingConflictResult> => {
    try {
      logger.log('Validating bookings before checkout...');

      // Build list of bookings to validate
      const bookingsToValidate = cartItems.map(item => {
        const appointment = appointmentData.find(a => a.cartItemId === item.id);
        return {
          providerName: item.providerDisplayName ?? item.providerName,
          date: appointment?.date || '',
          time: appointment?.time || '',
          duration: item.duration,
          cartItemId: item.id,
          serviceId: item.serviceId && UUID_RE.test(item.serviceId) ? item.serviceId : undefined,
          // Without this the item is re-checked against the very rules the
          // client already accepted a request under, and reported back to
          // them as a conflict.
          isEmergencyRequest: !!item.emergencyRequest,
        };
      }).filter(b => b.date && b.time);

      // Use AvailabilityService to check for conflicts
      const result = await AvailabilityService.validateCartBookings(bookingsToValidate);

      if (!result.isValid) {
        logger.log('Booking conflicts found:', result.conflicts);
      } else {
        logger.log('All bookings validated - no conflicts');
      }

      return result;
    } catch (error) {
      logger.error('❌ Error validating bookings:', error);
      // User-facing copy stays booking-flavoured even though the cause here
      // is usually a network/server hiccup — "unable to validate" reads as
      // an alarming technical failure for something the client can just retry.
      return {
        isValid: false,
        conflicts: cartItems.map(item => ({
          cartItemId: item.id,
          message: "Couldn't confirm this time is still available — please try again.",
        })),
      };
    }
  }, []);

  const createBookingsFromCart = useCallback(async (
    cartItems: CartItem[],
    appointmentData: AppointmentData[],
    mobileClientAddress?: MobileClientAddress,
    holdBatchId?: string
  ) => {
    try {
      logger.log('Creating bookings from cart...');

      // Which providers in this cart travel to the client. Keyed by
      // `providerDisplayName ?? providerName`, matching how CartScreen resolves
      // them. Empty when nobody in the cart is mobile — which is exactly when
      // no booking here should carry a client address.
      const clientAddressText = mobileClientAddress?.address.trim() || null;
      const clientAreaText = mobileClientAddress?.area?.trim() || null;
      const mobileProviderNames = new Set(mobileClientAddress?.providerNames ?? []);

      // Validate bookings before creating to prevent double-booking. Skipped
      // when a hold batch is present: hold_cart_booking_slots() already did
      // this exact bookability check server-side (atomically, all-or-
      // nothing) at hold time — re-running it here would find this cart's
      // own on_hold rows (inserted by that hold call) and reject every item
      // as "no longer available", since neither this check nor
      // getSlotsTaken below excludes the caller's own in-flight hold batch.
      if (!holdBatchId) {
        const validation = await validateBookingsBeforeCheckout(cartItems, appointmentData);
        if (!validation.isValid) {
          const conflictMessages = validation.conflicts.map(c => c.message).join(' ');
          throw new BookingError(conflictMessages || "We couldn't book that time. Please pick another.");
        }
      }

      // ── Resolve every cart item to a real provider UUID up front ─────────────
      // If any item can't be resolved we abort BEFORE saving anything, so the
      // user never sees a phantom booking that the provider will never
      // receive. Shared with holdCartCheckoutSlots (see resolveCartProviderIds
      // above) so the batch this claims later resolved providers identically.
      const providerCapCache: Record<string, { auto_accept: boolean; max_per_day: number }> = {};
      const { providerIdCache, unresolvedNames } = await resolveCartProviderIds(cartItems);

      if (unresolvedNames.length > 0) {
        throw new BookingError(
          `We couldn't link ${unresolvedNames.join(', ')} to a registered provider, so the booking wasn't placed. ` +
          `Please re-add the service from the provider's profile and try again.`
        );
      }

      const resolvedProviderIds = [
        ...new Set(Object.values(providerIdCache).filter((id): id is string => !!id)),
      ];
      const capSettingsById = await getProviderBookingCapSettingsForProviders(resolvedProviderIds);
      for (const item of cartItems) {
        const pid = providerIdCache[item.providerName];
        providerCapCache[item.providerName] =
          (pid && capSettingsById[pid]) || { auto_accept: false, max_per_day: 0 };
      }

      const capCheckPairs = cartItems
        .map(item => {
          const apt = appointmentData.find(a => a.cartItemId === item.id);
          const pid = providerIdCache[item.providerName];
          const caps = providerCapCache[item.providerName];
          return apt && pid && caps && caps.max_per_day > 0 ? { item, apt, pid, caps } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      const dailyCounts = await countProviderBookingsOnDates(
        capCheckPairs.map(({ pid, apt }) => ({ providerId: pid, date: apt.date }))
      );
      for (const { item, apt, pid, caps } of capCheckPairs) {
        const existingCount = dailyCounts[`${pid}|${apt.date}`] ?? 0;
        if (existingCount >= caps.max_per_day) {
          const displayName = item.providerDisplayName ?? item.providerName;
          throw new BookingError(`${displayName} is fully booked on that date. Please choose a different day.`);
        }
      }

      // ── Slot conflict pre-check against ALL users' bookings ──────────────────
      // validateBookingsBeforeCheckout only checks the current user's own
      // bookings; another client may have taken the slot since the calendar
      // loaded. The DB unique index is the hard guarantee — this check turns a
      // cryptic insert failure into a clear message before anything is saved.
      // Skipped when a hold batch is present — same self-conflict reason as
      // validateBookingsBeforeCheckout above: getSlotsTaken doesn't exclude
      // this cart's own on_hold rows either, so it would find them and
      // report the caller's own held slot as already taken.
      if (!holdBatchId) {
        const slotCheckItems = cartItems
          .map(item => {
            const apt = appointmentData.find(a => a.cartItemId === item.id);
            const pid = providerIdCache[item.providerName];
            const pgTime = apt ? timeTo24(apt.time) : null;
            return apt && pid && pgTime ? { item, apt, pid, pgTime } : null;
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);
        const slotsTaken = await getSlotsTaken(
          slotCheckItems.map(({ pid, apt, pgTime }) => ({ providerId: pid, date: apt.date, time24: pgTime }))
        );
        for (const { item, apt, pid, pgTime } of slotCheckItems) {
          if (slotsTaken[`${pid}|${apt.date}|${pgTime}`]) {
            const displayName = item.providerDisplayName ?? item.providerName;
            throw new BookingError(
              `${displayName} already has a booking at ${apt.time} on ${apt.date}. Please pick another time.`
            );
          }
        }
      }

      // Fetch real provider locations from DB before building appointment records.
      // Keyed by provider id, NOT display name: display_name is not unique, so a
      // name-keyed lookup could stamp a booking with a different provider's
      // address and coordinates. Safe to do here because the providerIdCache
      // check above throws unless every cart item resolved to an id.
      const uniqueProviderIds = [
        ...new Set(
          cartItems
            .map(i => providerIdCache[i.providerName])
            .filter((id): id is string => !!id)
        ),
      ];
      const providerLocations: Record<string, import('../services/databaseService').ProviderLocationData> =
        await getProviderLocationsByIds(uniqueProviderIds).catch(() => ({}));

      // Resolve a real group_booking_id (DB-facing UUID) per distinct
      // CartItem.bookingBatchId present in this checkout — NOT one global id
      // for the whole cart. Items with no bookingBatchId (added standalone,
      // or marked "Schedule Separately" in MultiBookingSheet) are never
      // grouped, regardless of how many other items share their provider. A
      // batch of size 1 in this checkout (e.g. its siblings were removed
      // from cart before checkout) also does not count as a group — matches
      // the "a group of 1 isn't a group" convention used when the batch id
      // was first minted in MultiBookingSheet.
      const batchIdToGroupUuid = new Map<string, string>();
      const batchIdToCount = new Map<string, number>();
      for (const item of cartItems) {
        if (!item.bookingBatchId) continue;
        batchIdToCount.set(item.bookingBatchId, (batchIdToCount.get(item.bookingBatchId) ?? 0) + 1);
      }
      for (const batchId of batchIdToCount.keys()) {
        if ((batchIdToCount.get(batchId) ?? 0) > 1) {
          batchIdToGroupUuid.set(batchId, generateUuid());
        }
      }
      const groupInfoForItem = (item: CartItem): { groupBookingId: string | undefined; isGroupBooking: boolean; groupBookingCount: number } => {
        const uuid = item.bookingBatchId ? batchIdToGroupUuid.get(item.bookingBatchId) : undefined;
        if (!uuid) return { groupBookingId: undefined, isGroupBooking: false, groupBookingCount: 1 };
        return { groupBookingId: uuid, isGroupBooking: true, groupBookingCount: batchIdToCount.get(item.bookingBatchId!) ?? 1 };
      };

      const newBookings: ConfirmedBooking[] = cartItems.map((item) => {
        const appointment = appointmentData.find(a => a.cartItemId === item.id);

        if (!appointment) {
          throw new Error(`Missing appointment data for ${item.serviceName}`);
        }

        const fullProviderName = item.providerDisplayName ?? item.providerName;
        // providerLocations is keyed by provider id (display names aren't unique)
        const itemProviderId = providerIdCache[item.providerName];
        const groupInfo = groupInfoForItem(item);
        const endTime = calculateEndTime(appointment.time, item.duration);
        const initialStatus = providerCapCache[item.providerName]?.auto_accept
          ? BookingStatus.UPCOMING
          : BookingStatus.PENDING;

        // Calculate payment breakdown for receipt
        const baseServicePrice = item.price;
        const addOnsTotal = item.addOns?.reduce((sum, addon) => sum + (addon.price || 0), 0) || 0;
        const subtotal = baseServicePrice + addOnsTotal;
        // Derive the REAL rates from what was actually charged — providers set
        // their own deposit policies, so no hardcoded 5%/20% on the receipt
        const serviceChargeAmount = appointment.serviceCharge;
        const serviceChargeRate = subtotal > 0 ? serviceChargeAmount / subtotal : 0;
        const totalBeforePayment = subtotal + serviceChargeAmount;
        const depositPercentage =
          appointment.paymentType === 'deposit' && subtotal > 0 && appointment.depositAmount > 0
            ? appointment.depositAmount / subtotal
            : undefined;

        const paymentBreakdown: PaymentBreakdown = {
          baseServicePrice,
          addOnsTotal,
          subtotal,
          serviceChargeRate,
          serviceChargeAmount,
          totalBeforePayment,
          depositPercentage,
          depositAmount: appointment.depositAmount || undefined,
          amountCharged: appointment.amountPaid,
          remainingBalance: appointment.remainingBalance,
          addOnItems: item.addOns?.map(addon => ({
            name: addon.name,
            price: addon.price,
          })),
        };

        // Determine payment status based on payment type and amount
        const paymentStatus = appointment.paymentType === 'full'
          ? PaymentStatus.PAID_IN_FULL
          : PaymentStatus.DEPOSIT_PAID;

        return {
          id: `booking_${item.id}_${Date.now()}_${Math.random()}`,
          cartItemId: item.id,
          providerName: fullProviderName,
          providerImage: item.providerImage,
          providerService: item.providerService,
          serviceName: item.serviceName,
          serviceDescription: item.serviceDescription,
          price: item.price,
          duration: item.duration,
          quantity: item.quantity,
          bookingDate: appointment.date,
          bookingTime: appointment.time,
          endTime,
          status: initialStatus,
          // Mirrors the DB row built below: a mobile provider's own location
          // is not this appointment's venue, so the optimistic local copy
          // doesn't claim it is either — otherwise the booking flips address
          // the moment the real row loads back.
          address: mobileProviderNames.has(fullProviderName)
            ? ''
            : providerLocations[itemProviderId ?? '']?.address ?? appointment.address,
          coordinates: (mobileProviderNames.has(fullProviderName)
            ? null
            : providerLocations[itemProviderId ?? '']?.coordinates ?? appointment.coordinates) as unknown as BookingCoordinates,
          phone: providerLocations[itemProviderId ?? '']?.phone ?? appointment.phone,
          ...(mobileProviderNames.has(fullProviderName) && clientAddressText
            ? { clientAddress: clientAddressText, providerBusinessType: 'mobile' as const }
            : {}),
          // Customer information
          customerName: appointment.customerName,
          customerEmail: appointment.customerEmail,
          customerPhone: appointment.customerPhone,
          notes: appointment.notes,
          addOns: item.addOns,
          // Legacy payment fields
          paymentType: appointment.paymentType,
          amountPaid: appointment.amountPaid,
          depositAmount: appointment.depositAmount,
          remainingBalance: appointment.remainingBalance,
          serviceCharge: appointment.serviceCharge,
          // NEW: Enhanced payment tracking
          paymentStatus,
          paymentBreakdown,
          paymentMethod: appointment.paymentMethod,
          paymentConfirmedAt: new Date().toISOString(),
          transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          // Group booking
          groupBookingId: groupInfo.groupBookingId,
          isGroupBooking: groupInfo.isGroupBooking,
          groupBookingCount: groupInfo.isGroupBooking ? groupInfo.groupBookingCount : undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          confirmedAt: new Date().toISOString(),
          // No fabricated instructions — only show instructions the provider
          // actually wrote (booking_instructions is null in the DB row too)
          bookingInstructions: undefined,
        };
      });

      const updatedBookings = [...bookings, ...newBookings];
      await saveBookings(updatedBookings);

      // Persist to Supabase. A booking that never reaches the DB is invisible
      // to the provider, so persistence failures are booking failures: the
      // local copy is removed and the user sees the real reason.
      const persistFailures: { cartItemId: string; message: string }[] = [];
      // cartItemId → Supabase bookings.id, so local bookings can adopt the DB
      // id after a successful save (reschedules/cancellations reference it)
      const dbIdByCartItemId: Record<string, string> = {};
      try {
        const userId = await getCurrentAuthUserId();
        if (userId) {
          // If this checkout reserved a hold batch (CartScreen calls
          // holdCartCheckoutSlots when the user commits to payment), claim
          // it now: every item with a still-live held row gets converted in
          // place (UPDATE, not a fresh INSERT) and is looked up below by
          // (provider, date, time) to skip the per-item insert entirely. Items
          // with no live hold (expired, or the hold call never happened —
          // e.g. an old client build) simply fall through to the normal
          // insert path unchanged, same as if no hold existed at all.
          const claimedByKey = new Map<string, string>();
          const claimServiceIdByCartItem = holdBatchId
            ? await resolveCartServiceIds(cartItems, providerIdCache)
            : {};
          if (holdBatchId) {
            try {
              const claimItems = cartItems
                .map(item => {
                  const apt = appointmentData.find(a => a.cartItemId === item.id);
                  const providerId = providerIdCache[item.providerName];
                  if (!apt || !providerId) return null;
                  const pgTime = timeTo24(apt.time);
                  if (!pgTime) return null;
                  const endTimeStr = calculateEndTime(apt.time, item.duration);
                  const pgEndTime = timeTo24(endTimeStr);
                  const groupInfo = groupInfoForItem(item);
                  const addOnsTotal = item.addOns?.reduce((s, a) => s + (a.price || 0), 0) ?? 0;
                  const logoUrl = typeof item.providerImage === 'string'
                    ? item.providerImage
                    : (item.providerImage && typeof item.providerImage === 'object' && 'uri' in item.providerImage
                        ? (item.providerImage as { uri?: string }).uri ?? null
                        : null);
                  const dbPayStatus = apt.paymentType === 'full' ? 'fully_paid' : 'deposit_paid';
                  // Only a mobile provider travels to the client, so only a
                  // mobile provider's booking carries the client's address —
                  // and conversely, a mobile provider's own location is their
                  // private base, not this appointment's venue, so it isn't
                  // snapshotted as one. Getting this wrong in either direction
                  // is what made a salon booking render the client's own home
                  // address as its location.
                  const isMobile = mobileProviderNames.has(
                    item.providerDisplayName ?? item.providerName,
                  );
                  return {
                    provider_id: providerId,
                    service_id: claimServiceIdByCartItem[item.id] ?? null,
                    booking_date: apt.date,
                    booking_time: pgTime,
                    end_time: pgEndTime,
                    notes: apt.notes ?? null,
                    payment_type: apt.paymentType,
                    base_price: item.price,
                    add_ons_total: addOnsTotal,
                    service_charge: apt.serviceCharge,
                    deposit_amount: apt.depositAmount,
                    amount_paid: apt.amountPaid,
                    remaining_balance: apt.remainingBalance,
                    payment_status: dbPayStatus,
                    payment_method: apt.paymentMethod ?? null,
                    payment_intent_id: apt.paymentIntentId ?? null,
                    is_group_booking: groupInfo.isGroupBooking,
                    group_booking_id: groupInfo.groupBookingId ?? null,
                    group_booking_count: groupInfo.isGroupBooking ? groupInfo.groupBookingCount : 1,
                    provider_name_snapshot: item.providerName,
                    service_name_snapshot: item.serviceName,
                    service_category_snapshot: item.providerService || null,
                    provider_logo_snapshot: logoUrl,
                    provider_address_snapshot: isMobile
                      ? null
                      : providerLocations[providerId]?.address ?? apt.address ?? null,
                    provider_phone_snapshot: providerLocations[providerId]?.phone ?? apt.phone ?? null,
                    provider_coordinates: isMobile
                      ? null
                      : (() => {
                          const c = providerLocations[providerId]?.coordinates;
                          return c ? { lat: c.latitude, lng: c.longitude } : null;
                        })(),
                    customer_name: apt.customerName,
                    customer_email: apt.customerEmail,
                    customer_phone: apt.customerPhone,
                    client_address: isMobile ? clientAddressText : null,
                    // Same gate as the address — only a mobile provider
                    // travels, so only their booking carries either half.
                    // relocate_booking_client_address() COALESCEs this over
                    // its postcode derivation, so a chosen area wins and a
                    // missing one still falls back.
                    client_area: isMobile ? clientAreaText : null,
                    // policy_accepted_at is deliberately absent:
                    // hold_cart_booking_slots() stamps it from the DB clock
                    // before payment, and the claim no longer overwrites it.
                    // policy_snapshot is the policy's CONTENT rather than
                    // evidence of consent, and is only assembled by here.
                    policy_snapshot: item.policySnapshot ?? null,
                  };
                })
                .filter((x): x is NonNullable<typeof x> => x !== null);

              const claimed = await claimCartBookingSlots(holdBatchId, claimItems as any);
              for (const row of claimed) {
                claimedByKey.set(`${row.provider_id}|${row.booking_date}|${row.booking_time}`, row.booking_id);
              }
            } catch (claimError) {
              // Claim failing entirely (network, batch id never existed) is
              // not fatal — every item just falls through to a normal
              // dbCreateBooking insert below, same as if no hold was ever
              // taken out. Only log; never surface as a checkout failure.
              logger.warn('[BookingContext] Cart hold claim failed, falling back to direct insert:', claimError);
            }
          }

          for (const item of cartItems) {
            const apt = appointmentData.find(a => a.cartItemId === item.id);
            if (!apt) continue;

            const providerId = providerIdCache[item.providerName];
            if (!providerId) continue; // unreachable — resolution guaranteed above
            try {

            const pgTime = timeTo24(apt.time);
            if (!pgTime) continue;

            // Already converted from an on_hold row above — skip the fresh
            // INSERT entirely, just adopt the id the claim already gave us.
            const claimedId = claimedByKey.get(`${providerId}|${apt.date}|${pgTime}`);
            if (claimedId) {
              dbIdByCartItemId[item.id] = claimedId;
              // The confirmation email is no longer sent from here. The
              // queue_booking_confirmation_email trigger on `bookings` owns
              // it, so it no longer depends on this app staying open long
              // enough to finish the request — and the wording follows the
              // booking row rather than whatever this screen had in memory.
              continue;
            }

            // The hold batch is the ONLY way a client can create a booking.
            // public.bookings has no client INSERT policy — only
            // bookings_provider_insert — so the direct createBooking() insert
            // that used to live here could do nothing but fail RLS and surface
            // Postgres' policy text to the client. If the slot wasn't claimed
            // from the hold, the booking genuinely did not happen; say so
            // plainly instead of attempting a doomed write.
            //
            // The policy is deliberately NOT being restored — a blanket
            // authenticated INSERT would let a client forge rows with arbitrary
            // price/status/snapshot fields, bypassing every validation the claim
            // RPC performs. See supabase/migrations/20260810180952_restore_
            // legacy_booking_writes_pending_stripe.sql.
            throw new Error(
              `That time slot with ${item.providerDisplayName ?? item.providerName} is no longer available. Please choose a different time.`
            );

            } catch (itemError: any) {
              const name = item.providerDisplayName ?? item.providerName;
              let message: string;
              if (itemError?.code === '23505' || itemError?.code === '23P01') {
                // 23505 = exact same (provider, date, time) triple lost the
                // race; 23P01 = the buffer/overlap exclusion constraint
                // caught a different-start-time overlap the app-side
                // pre-check missed under concurrent requests. Same
                // user-facing story either way: someone else got there first.
                message = `That time slot with ${name} is no longer available. Please choose a different time.`;
              } else if (
                typeof itemError?.message === 'string'
                && itemError.message.length > 0
                && !itemError.message.includes('Network')
                // itemError.message is safe to show verbatim for the claim
                // RPC's own `new Error(...)` validations (closed day,
                // blocked date, overlap — no .code at all) and for a
                // deliberate DB guard (RAISE EXCEPTION, which Postgres
                // defaults to SQLSTATE P0001) — both are written for people.
                // Supabase's PostgrestError DOES extend Error and carries a
                // real .code for a genuine technical failure (RLS,
                // constraint violation, anything else Postgres raised)
                // that's unsafe to surface raw — those fall through to the
                // generic message below instead.
                && !(itemError?.code && itemError.code !== 'P0001')
              ) {
                message = itemError.message;
              } else {
                message = `Your booking with ${name} couldn't be placed. Please check your connection and try again.`;
              }
              logger.error('[BookingContext] ❌ Booking not persisted for', name, itemError);
              persistFailures.push({ cartItemId: item.id, message });
            }
          }
        }
      } catch (outerError) {
        // Auth lookup failed — none of the bookings reached the DB. Remove the
        // local copies and fail the checkout with a clear message.
        logger.error('[BookingContext] ❌ Could not persist bookings to Supabase:', outerError);
        const newIds = new Set(newBookings.map(nb => nb.id));
        await saveBookings(updatedBookings.filter(b => !newIds.has(b.id)));
        throw new BookingError(
          "We couldn't place your booking just now. Please check your connection and try again."
        );
      }

      // Adopt the Supabase booking ids locally so later operations (reschedule
      // requests, cancellations, status updates) reference the same row the
      // provider sees. Without this, reschedule requests carry a local-only id
      // the provider side can never match.
      const localIdToDbId: Record<string, string> = {};
      for (const nb of newBookings) {
        const dbId = dbIdByCartItemId[nb.cartItemId];
        if (dbId) localIdToDbId[nb.id] = dbId;
      }
      const failedCartItemIds = new Set(persistFailures.map(f => f.cartItemId));
      const failedLocalIds = new Set(
        newBookings.filter(nb => failedCartItemIds.has(nb.cartItemId)).map(nb => nb.id)
      );
      if (Object.keys(localIdToDbId).length > 0 || failedLocalIds.size > 0) {
        const reconciled = updatedBookings
          // Drop local bookings that never reached the DB — the provider
          // can't see them, so keeping them would show a phantom booking
          .filter(b => !failedLocalIds.has(b.id))
          .map(b => (localIdToDbId[b.id] ? { ...b, id: localIdToDbId[b.id]! } : b));
        await saveBookings(reconciled);
        for (const nb of newBookings) {
          const dbId = localIdToDbId[nb.id];
          if (dbId) nb.id = dbId;
        }
      }

      // Client-facing notifications live in the same Supabase table
      // NotificationsScreen reads. The booking-status notices ("Booking Request
      // Sent" for manual, "Booking Confirmed" for auto-accept) are owned by the DB
      // trigger handle_new_booking — inserting "Booking Request Sent" here as well
      // double-notified the client on manual bookings, so it's been removed. The
      // app keeps only the payment receipt below, which no trigger sends. Sent for
      // every booking that persisted, even if a sibling item in a multi-service
      // checkout failed.
      const succeededBookings = newBookings.filter(nb => !failedCartItemIds.has(nb.cartItemId));
      const succeededAmountPaid = succeededBookings.reduce((sum, b) => sum + b.amountPaid, 0);

      // A partial failure leaves a batch's surviving bookings' group_booking_count
      // stamped with that BATCH's original size (set before any item's outcome
      // was known) — e.g. 2 of 3 grouped services book, but those rows still
      // claim "3" and carry a group_booking_id shared with a booking that
      // doesn't exist. Patch each affected batch to reality once the real
      // outcome is known — reconciled per batch, not once for the whole
      // checkout, since a partial failure in one provider's batch must not
      // touch another provider's (or another batch's) group info.
      if (persistFailures.length > 0 && succeededBookings.length > 0) {
        for (const batchId of batchIdToGroupUuid.keys()) {
          const batchSucceededBookings = succeededBookings.filter(b => {
            const item = cartItems.find(i => i.id === b.cartItemId);
            return item?.bookingBatchId === batchId;
          });
          if (batchSucceededBookings.length === 0) continue;
          const dbIds = batchSucceededBookings.map(b => b.id);
          try {
            if (batchSucceededBookings.length > 1) {
              await updateBookingGroupInfo(dbIds, {
                is_group_booking: true,
                group_booking_id: batchIdToGroupUuid.get(batchId)!,
                group_booking_count: dbIds.length,
              });
            } else {
              await updateBookingGroupInfo(dbIds, {
                is_group_booking: false,
                group_booking_id: null,
                group_booking_count: 1,
              });
            }
          } catch (groupInfoError) {
            // Cosmetic (a stale count badge on a surviving booking) — never
            // let this block the checkout outcome itself.
            logger.error('[BookingContext] Failed to reconcile group_booking_count for batch', batchId, groupInfoError);
          }
        }
      }

      if (succeededBookings.length > 0) {
        insertBookingUserNotification({
          booking_id: succeededBookings[0]!.id,
          type: 'payment_success',
          title: 'Payment Received',
          message: succeededBookings.length > 1
            ? `We received your payment of £${succeededAmountPaid.toFixed(2)} for ${succeededBookings.length} services.`
            : `We received your payment of £${succeededAmountPaid.toFixed(2)} for ${succeededBookings[0]!.serviceName}.`,
          priority: 'medium',
          is_actionable: false,
        }).catch(() => {});
      }

      // Fail the checkout with the real reason(s) — but make clear when it
      // was only PART of a multi-service checkout, and carry the cart item
      // ids (and amount) that DID book so the caller can clear just those
      // from the cart and capture only what was actually booked.
      if (persistFailures.length > 0) {
        const reasons = [...new Set(persistFailures.map(f => f.message))].join('\n');
        const message = succeededBookings.length > 0
          ? `${succeededBookings.length} of ${newBookings.length} services were booked successfully. The rest couldn't be placed:\n${reasons}`
          : reasons;
        throw new BookingError(message, succeededBookings.map(b => b.cartItemId), succeededAmountPaid);
      }

      logger.log('All bookings created successfully');
    } catch (error) {
      logger.error('❌ Failed to create bookings:', error);
      throw error;
    }
  }, [bookings, saveBookings, validateBookingsBeforeCheckout]);

  // Reserves every cart item's slot as an on_hold booking, all-or-nothing,
  // right when the user commits to payment — closes the gap between
  // "committed to paying" and "booking actually inserted" that
  // the claim RPC's insert-time-only conflict check leaves open for the
  // whole review + payment-sheet interaction. Takes only date/time per item
  // (not full AppointmentData) since customer/payment details aren't known
  // yet at "Confirm & Pay" time — CartScreen's checkoutSnapshot.bookings
  // (keyed by cart item id) is exactly this shape already. See
  // supabase/fix_cart_checkout_slot_hold.sql and the on-hold reasoning
  // memory this ships with. Throws on any conflict with the same
  // conflict-message shape validateBookingsBeforeCheckout already produces
  // — CartScreen's existing "Scheduling Conflict" alert handles both.
  const holdCartCheckoutSlots = useCallback(async (
    cartItems: CartItem[],
    scheduleByItemId: Record<string, { selectedDate: string; selectedTime: string }>,
    consent: { policyAccepted: boolean; safetyAcknowledged: boolean }
  ): Promise<string> => {
    const { providerIdCache, unresolvedNames } = await resolveCartProviderIds(cartItems);
    if (unresolvedNames.length > 0) {
      throw new BookingError(
        `We couldn't link ${unresolvedNames.join(', ')} to a registered provider, so we couldn't reserve that time. ` +
        `Please re-add the service from the provider's profile and try again.`
      );
    }

    // Recover a real services.id for any item whose cart copy doesn't carry
    // one, so the held (and then claimed) row is linked to the service it is
    // actually for. See resolveCartServiceIds.
    const serviceIdByCartItem = await resolveCartServiceIds(cartItems, providerIdCache);

    const holdItems: CartHoldItem[] = cartItems.map(item => {
      const schedule = scheduleByItemId[item.id];
      const providerId = providerIdCache[item.providerName];
      if (!schedule || !providerId) {
        throw new BookingError("Missing appointment details — please pick your time again.");
      }
      const pgTime = timeTo24(schedule.selectedTime);
      const endTimeStr = calculateEndTime(schedule.selectedTime, item.duration);
      const pgEndTime = timeTo24(endTimeStr);
      if (!pgTime || !pgEndTime) {
        throw new BookingError("Couldn't confirm this time is still available — please try again.");
      }
      return {
        provider_id: providerId,
        service_id: serviceIdByCartItem[item.id] ?? null,
        booking_date: schedule.selectedDate,
        booking_time: pgTime,
        end_time: pgEndTime,
        // Carried from the cart item, not re-derived: the reasons were fixed
        // when the client accepted the confirmation for THIS time.
        ...(item.emergencyRequest ? { is_emergency_request: true } : {}),
        // One checkbox covers the whole checkout, so every item carries the
        // same answer. The server decides per item whether the safety half
        // was needed at all — it reads that off the service, not off this.
        policy_accepted: consent.policyAccepted,
        safety_ack: consent.safetyAcknowledged,
      };
    });

    const batchId = generateUuid();
    try {
      await holdCartBookingSlots(batchId, holdItems);
    } catch (error: any) {
      if (error?.code === '23505' || error?.code === '23P01') {
        throw new BookingError("That time slot is no longer available. Please choose a different time.");
      }
      // bookings_service_id_fkey: a cart item outlived the service it was
      // added from. validateCartBookings normally catches this first and
      // flags the offending item by name; this is the backstop for the gap
      // between that check and the hold (or for a lookup that failed open).
      // It must NOT fall through to the generic "please try again" — the
      // batch will fail identically every time until the item is removed.
      if (error?.code === '23503' && /service_id/.test(error?.details ?? error?.message ?? '')) {
        throw new BookingError(
          "One of your services isn't offered any more. Pull down to refresh your cart, then remove the one that's flagged."
        );
      }
      throw error;
    }
    return batchId;
  }, []);

  // Best-effort release when the user backs out of payment before claiming
  // a hold batch. Never throws — the 10-minute TTL cron sweep
  // (expire_cart_holds) is the real backstop, since no reliable
  // client-side "abandoned checkout" signal exists (see design notes in
  // fix_cart_checkout_slot_hold.sql). This just frees the slot sooner.
  const releaseCartCheckoutSlots = useCallback(async (holdBatchId: string): Promise<void> => {
    try {
      await releaseCartBookingSlots(holdBatchId);
    } catch (error) {
      logger.warn('[BookingContext] Failed to release cart hold batch (TTL will clean it up):', error);
    }
  }, []);

  const refreshBookingStatuses = useCallback(() => {
    if (bookings.length === 0) return;

    const updated = bookings.map(booking => {
      const newStatus = determineBookingStatus(
        booking.bookingDate,
        booking.bookingTime,
        booking.endTime,
        booking.status
      );

      if (newStatus !== booking.status) {
        return { ...booking, status: newStatus, updatedAt: new Date().toISOString() };
      }
      return booking;
    });

    const hasChanges = updated.some((b, i) => b.status !== bookings[i]?.status);

    if (hasChanges) {
      saveBookings(updated);
    }
  }, [bookings, saveBookings]);

  useEffect(() => {
    const interval = setInterval(refreshBookingStatuses, 60000);
    return () => clearInterval(interval);
  }, [refreshBookingStatuses]);

  const getBookingsByProvider = useCallback((providerName: string) => {
    return bookings.filter(b => b.providerName === providerName);
  }, [bookings]);

  const getBookingsByDate = useCallback((date: string) => {
    return bookings.filter(b => b.bookingDate === date);
  }, [bookings]);

  const getBookingById = useCallback((bookingId: string) => {
    return bookings.find(b => b.id === bookingId);
  }, [bookings]);

  const getBookingsByGroupId = useCallback((groupId: string) => {
    return bookings.filter(b => b.groupBookingId === groupId);
  }, [bookings]);

  const reloadBookings = useCallback(async () => {
    await loadBookings();
  }, [loadBookings]);

  // Pages further back than getMyBookings()'s default recent window, using
  // the oldest currently-loaded booking_date as the cursor.
  const loadOlderBookings = useCallback(async () => {
    if (loadingMoreHistory || !hasMoreHistory) return;
    setLoadingMoreHistory(true);
    try {
      const oldest = bookings.reduce(
        (min: string, b) => (!min || b.bookingDate < min ? b.bookingDate : min),
        ''
      );
      if (!oldest) {
        setHasMoreHistory(false);
        return;
      }

      const PAGE_SIZE = 30;
      const older = await getOlderBookings(oldest, PAGE_SIZE);
      if (older.length === 0) {
        setHasMoreHistory(false);
        return;
      }

      const existingIds = new Set(bookings.map(b => b.id));
      const mapped = older.map(mapDbBookingToConfirmed).filter(b => !existingIds.has(b.id));
      const updated = [...bookings, ...mapped];
      setBookings(updated);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      if (older.length < PAGE_SIZE) setHasMoreHistory(false);
    } catch (error) {
      console.error('Failed to load older bookings:', error);
    } finally {
      setLoadingMoreHistory(false);
    }
  }, [bookings, hasMoreHistory, loadingMoreHistory]);

  const upcomingBookings = useMemo(() => {
    if (isLoading) return [];

    const now = new Date();
    const upcoming = bookings.filter(b => {
      if (b.status === BookingStatus.CANCELLED || b.status === BookingStatus.NO_SHOW) {
        return false;
      }

      // Always show pending-confirmation bookings in upcoming list
      if (b.status === BookingStatus.PENDING) return true;

      try {
        const bookingDateTime = createBookingDateTime(b.bookingDate, b.bookingTime);
        return bookingDateTime > now;
      } catch {
        return b.status === BookingStatus.UPCOMING;
      }
    });

    return sortBookingsByDateTime(upcoming);
  }, [bookings, isLoading]);

  const pastBookings = useMemo(() => {
    if (isLoading) return [];

    const now = new Date();
    return sortBookingsByDateTime(
      bookings.filter(b => {
        if (
          b.status === BookingStatus.CANCELLED ||
          b.status === BookingStatus.NO_SHOW ||
          b.status === BookingStatus.COMPLETED
        ) {
          return true;
        }

        try {
          const bookingDateTime = createBookingDateTime(b.bookingDate, b.bookingTime);
          return bookingDateTime <= now;
        } catch {
          return false;
        }
      })
    ).reverse();
  }, [bookings, isLoading]);

  const todayBookings = useMemo(() => {
    if (isLoading) return [];

    const today = new Date().toISOString().split('T')[0];
    return sortBookingsByDateTime(
      bookings.filter(b => {
        return b.bookingDate === today &&
          b.status !== BookingStatus.CANCELLED &&
          b.status !== BookingStatus.NO_SHOW;
      })
    );
  }, [bookings, isLoading]);

  // Folded into one useMemo (rather than plain consts) so they don't become
  // fresh references on every render — otherwise memoizing `value` below
  // would be pointless, since these three would still force it to change
  // every time regardless of what actually changed.
  const { currentBooking, nextBookings, allTodayBookingsCompleted } = useMemo(() => {
    const currentBooking = todayBookings.find(b => b.status === BookingStatus.IN_PROGRESS) ||
      todayBookings[0] ||
      null;

    const nextBookings = todayBookings
      .filter(b => b.id !== currentBooking?.id && b.status === BookingStatus.UPCOMING)
      .slice(0, 3);

    const allTodayBookingsCompleted = todayBookings.length > 0 &&
      todayBookings.every(b =>
        b.status === BookingStatus.COMPLETED
      ) &&
      todayBookings.every(b =>
        b.status !== BookingStatus.PENDING &&
        b.status !== BookingStatus.UPCOMING &&
        b.status !== BookingStatus.IN_PROGRESS
      );

    return { currentBooking, nextBookings, allTodayBookingsCompleted };
  }, [todayBookings]);

  // Memoized so consumers of useBooking() (HomeScreen, BookingsScreen, etc.)
  // only re-render when something they actually read changes, instead of on
  // every render of this provider — every function above is already
  // useCallback-wrapped, so the only genuinely-changing inputs are the data
  // and loading-flag values listed below.
  const value: BookingContextType = useMemo(() => ({
    bookings,
    confirmedBookings: bookings,
    upcomingBookings,
    pastBookings,
    todayBookings,
    currentBooking,
    nextBookings,
    allTodayBookingsCompleted,
    createBookingsFromCart,
    holdCartCheckoutSlots,
    releaseCartCheckoutSlots,
    validateBookingsBeforeCheckout,
    updateBookingStatus,
    cancelBooking,
    markProviderNoShow,
    getBookingsByProvider,
    getBookingsByDate,
    getBookingById,
    getBookingsByGroupId,
    canReschedule,
    refreshBookingStatuses,
    reloadBookings,
    requestReschedule,
    providerRespondToReschedule,
    confirmReschedule,
    declineReschedule,
    confirmGroupReschedule,
    declineGroupReschedule,
    hasMoreHistory,
    loadingMoreHistory,
    loadOlderBookings,
  }), [
    bookings,
    upcomingBookings,
    pastBookings,
    todayBookings,
    currentBooking,
    nextBookings,
    allTodayBookingsCompleted,
    createBookingsFromCart,
    holdCartCheckoutSlots,
    releaseCartCheckoutSlots,
    validateBookingsBeforeCheckout,
    updateBookingStatus,
    cancelBooking,
    markProviderNoShow,
    getBookingsByProvider,
    getBookingsByDate,
    getBookingById,
    getBookingsByGroupId,
    canReschedule,
    refreshBookingStatuses,
    reloadBookings,
    requestReschedule,
    providerRespondToReschedule,
    confirmReschedule,
    declineReschedule,
    confirmGroupReschedule,
    declineGroupReschedule,
    hasMoreHistory,
    loadingMoreHistory,
    loadOlderBookings,
  ]);

  return (
    <BookingContext.Provider value={value}>
      {children}
    </BookingContext.Provider>
  );
};

export const useBooking = (): BookingContextType & {
  addBooking: (booking: ConfirmedBooking) => void;
} => {
  const context = useContext(BookingContext);
  if (!context) {
    throw new Error('useBooking must be used within a BookingProvider');
  }
  // Pull addBooking from the store (not in the original context API).
  // Context values always take precedence — store is a supplemental layer.
  const storeAddBooking = useBookingStore(s => s.addBooking);
  return {
    addBooking: storeAddBooking,
    ...context,
  };
};
