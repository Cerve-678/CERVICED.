// src/contexts/BookingContext.tsx
import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CartItem } from './CartContext';
import { AvailabilityService } from '../services/AvailabilityService';
import { supabase } from '../lib/supabase';
import { createBooking as dbCreateBooking, getMyBookings, getOlderBookings, getProviderIdByDisplayName, getProviderBySlug, updateBookingStatus as dbUpdateBookingStatus, insertProviderNotification, insertBookingUserNotification, upsertRescheduleRequest, closeRescheduleRequest, updateBookingDateTime, getProviderLocationsByDisplayNames, getProviderBookingCapSettings, countProviderBookingsOnDate, getActiveRescheduleRequest, isSlotTaken } from '../services/databaseService';
import { mapDbBookingToConfirmed } from '../services/bookingService';
import { useBookingStore } from '../stores/useBookingStore';

export class BookingError extends Error {
  succeededCartItemIds: string[];
  constructor(message: string, succeededCartItemIds: string[] = []) {
    super(message);
    this.name = 'BookingError';
    this.succeededCartItemIds = succeededCartItemIds;
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

// Import types locally (for use within this file)
import type {
  BookingCoordinates,
  ConfirmedBooking,
  BookingsByDate,
  BookingConflictResult,
  AppointmentData,
  AvailableDate,
} from '../types/booking';
import { BookingStatus, PaymentStatus, type PaymentBreakdown } from '../types/booking';
import { sendEmail, bookingConfirmationEmail } from '../services/emailService';
import { logger } from '../utils/logger';

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
  createBookingsFromCart: (cartItems: CartItem[], appointmentData: AppointmentData[], clientAddress?: string) => Promise<void>;
  validateBookingsBeforeCheckout: (cartItems: CartItem[], appointmentData: AppointmentData[]) => Promise<BookingConflictResult>;
  updateBookingStatus: (bookingId: string, status: BookingStatus) => Promise<void>;
  cancelBooking: (bookingId: string) => Promise<void>;
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
}

const STORAGE_KEY = '@bookings';

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
    const durationMatch = duration.match(/(\d+(?:\.\d+)?)\s*(hour|hr|h|minute|min|m)/i);
    
    if (!durationMatch) return startTime;
    
    const amountStr = durationMatch[1];
    const unitStr = durationMatch[2];
    
    if (!amountStr || !unitStr) return startTime;
    
    const amount = parseFloat(amountStr);
    const unit = unitStr.toLowerCase();
    
    let durationMinutes = 0;
    if (unit.startsWith('h')) {
      durationMinutes = Math.round(amount * 60);
    } else {
      durationMinutes = Math.round(amount);
    }
    
    const totalMinutes = startMinutes + durationMinutes;
    const endHours = Math.floor(totalMinutes / 60) % 24;
    const endMinutes = totalMinutes % 60;
    
    const period = endHours >= 12 ? 'PM' : 'AM';
    const displayHours = endHours > 12 ? endHours - 12 : endHours === 0 ? 12 : endHours;
    
    return `${displayHours}:${endMinutes.toString().padStart(2, '0')} ${period}`;
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
    const appointmentEnd = createBookingDateTime(bookingDate, endTime);
    
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


// Map a raw DB bookings.status string → app BookingStatus enum. Single source
// of truth — screens must never cast a raw DB status string directly, since
// 'confirmed' (DB) has no identically-named BookingStatus member (it maps to
// UPCOMING) and a raw cast silently produces an unmatched status.
export const mapDbBookingStatus = (s: string): BookingStatus => {
  switch (s) {
    case 'pending': return BookingStatus.PENDING;
    case 'completed': return BookingStatus.COMPLETED;
    case 'cancelled': return BookingStatus.CANCELLED;
    case 'in_progress': return BookingStatus.IN_PROGRESS;
    case 'no_show': return BookingStatus.NO_SHOW;
    default: return BookingStatus.UPCOMING;
  }
};


// ==================== PROVIDER COMPONENT ====================

export const BookingProvider = ({ children }: { children: ReactNode }) => {
  const [bookings, setBookings] = useState<ConfirmedBooking[]>([]);
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
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
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
                  remainingBalance: fromDb.remainingBalance,
                  paymentStatus: fromDb.paymentStatus,
                };
              });
              const localIds = new Set(migratedBookings.map((b: ConfirmedBooking) => b.id));
              const missingLocally = dbBookings
                .filter(d => !localIds.has(d.id))
                .map(mapDbBookingToConfirmed);
              mergedBookings = [...mergedBookings, ...missingLocally];
            }
          }
        } catch (_) {
          // Offline or fetch failed — local copy stands
        }

        const updatedBookings = mergedBookings.map((booking: ConfirmedBooking) => {
          // A booking mid-reschedule should not be auto-expired based on the
          // original appointment date — the date is being replaced, so treat
          // it as still upcoming until the reschedule is resolved.
          if (booking.isPendingReschedule &&
              booking.status !== BookingStatus.CANCELLED &&
              booking.status !== BookingStatus.NO_SHOW) {
            return { ...booking, status: BookingStatus.UPCOMING };
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
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
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
        } catch (_) {
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
    let channel: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;

      channel = supabase
        .channel('booking-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'bookings',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            // A booking was inserted/updated — reload to reflect latest status.
            // Also update the Zustand store so non-context consumers stay fresh.
            loadBookings().catch(() => {});
            useBookingStore.getState().refreshBookings(user.id).catch(() => {});
          }
        )
        .subscribe();
    });

    return () => {
      if (channel) supabase.removeChannel(channel);
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

      // ✅ Preserve original date/time from FIRST reschedule request
      const originalDate = booking.rescheduleRequest?.originalDate || booking.bookingDate;
      const originalTime = booking.rescheduleRequest?.originalTime || booking.bookingTime;
      const rescheduleCount = (booking.rescheduleRequest?.rescheduleCount || 0);

      // ✅ Update only the specific booking
      const updatedBooking = {
        ...booking,
        isPendingReschedule: true, // ✅ PENDING state
        rescheduleRequest: {
          originalDate,
          originalTime,
          requestedDates: preferredDates,
          requestedAt: new Date().toISOString(),
          rescheduleCount, // Don't increment yet, only on confirm
          ...(booking.rescheduleRequest?.lastRescheduledAt && { lastRescheduledAt: booking.rescheduleRequest.lastRescheduledAt }),
        },
        updatedAt: new Date().toISOString(),
      } as ConfirmedBooking;

      // ✅ FIX: Map over fresh bookings from storage, not stale state
      const updatedBookings = currentBookings.map(b => b.id === bookingId ? updatedBooking : b);

      await saveBookings(updatedBookings);

      // Persist to Supabase so provider can see the request
      upsertRescheduleRequest({
        booking_id: bookingId,
        original_date: originalDate,
        original_time: originalTime,
        requested_dates: preferredDates,
      }).catch(() => {});

      // Notify provider in Supabase — prefer the stored UUID, fall back to name lookup
      const rescheduleProviderId = booking.providerId
        ?? await getProviderIdByDisplayName(booking.providerName).catch(() => null);
      if (rescheduleProviderId) {
        const dateList = preferredDates.slice(0, 3).join(', ');
        insertProviderNotification({
          provider_id: rescheduleProviderId,
          type: 'reschedule_request',
          title: 'Reschedule Request',
          message: `${booking.customerName || 'A client'} wants to reschedule their ${booking.serviceName} appointment. Preferred dates: ${dateList}.`,
          priority: 'high',
          is_actionable: true,
          booking_id: bookingId,
        }).catch(() => {});
      }

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
      } catch (_) {
        // Booking not on this device or already applied — safe to ignore
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
        for (const b of waiting) {
          if (cancelled) break;
          const req = await getActiveRescheduleRequest(b.id).catch(() => null);
          if (req?.status === 'provider_responded') {
            await applyProviderResponse(
              b.id,
              req.provider_available_slots as AvailableDate[] | null
            );
          }
        }
      } catch (_) {
        // Offline — realtime subscription below still covers the live case
      }
    })();

    const channel = supabase
      .channel('reschedule-responses')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'booking_reschedule_requests' },
        (payload) => {
          const row = payload.new as {
            booking_id?: string;
            status?: string;
            provider_available_slots?: AvailableDate[] | null;
          } | null;
          if (row?.status === 'provider_responded' && row.booking_id) {
            applyProviderResponse(row.booking_id, row.provider_available_slots);
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [providerRespondToReschedule]);

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

      await saveBookings(updatedBookings);

      // Persist new date/time and close the reschedule request in Supabase
      updateBookingDateTime(bookingId, newDate, newTime, newEndTime).catch(() => {});
      closeRescheduleRequest(bookingId, 'confirmed').catch(() => {});

      // Notify provider in Supabase — prefer the stored UUID, fall back to name lookup
      const confirmedProviderId = booking.providerId
        ?? await getProviderIdByDisplayName(booking.providerName).catch(() => null);
      if (confirmedProviderId) {
        insertProviderNotification({
          provider_id: confirmedProviderId,
          type: 'reschedule_confirmed',
          title: 'Reschedule Confirmed',
          message: `${booking.customerName || 'A client'} confirmed their ${booking.serviceName} for ${newDate.split('-').reverse().join('/')} at ${newTime}.`,
          priority: 'medium',
          is_actionable: true,
          booking_id: bookingId,
        }).catch(() => {});
      }

      logger.log('Step 3 Complete: Status=UPCOMING, 24hr cooldown active, total reschedules:', rescheduleCount);
    } catch (error) {
      logger.error('❌ Failed to confirm reschedule:', error);
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
      if (isDbBookingId(bookingId)) {
        try {
          await dbUpdateBookingStatus(bookingId, 'cancelled');
        } catch (dbError) {
          logger.error('❌ Cancellation did not reach Supabase:', dbError);
          throw new Error('Could not cancel the booking. Please check your connection and try again.');
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
    clientAddress?: string
  ) => {
    try {
      logger.log('Creating bookings from cart...');

      // Validate bookings before creating to prevent double-booking
      const validation = await validateBookingsBeforeCheckout(cartItems, appointmentData);
      if (!validation.isValid) {
        const conflictMessages = validation.conflicts.map(c => c.message).join(' ');
        throw new BookingError(conflictMessages || "We couldn't book that time. Please pick another.");
      }

      // ── Resolve every cart item to a real provider UUID up front ─────────────
      // Chain: providerId carried on the cart item (canonical) → slug lookup →
      // display-name lookup (legacy fallback). If any item can't be resolved we
      // abort BEFORE saving anything, so the user never sees a phantom booking
      // that the provider will never receive.
      const providerCapCache: Record<string, { auto_accept: boolean; max_per_day: number }> = {};
      const providerIdCache: Record<string, string | null> = {};

      const resolveProviderId = async (item: CartItem): Promise<string | null> => {
        if (item.providerId) return item.providerId;
        if (item.providerSlug) {
          const bySlug = await getProviderBySlug(item.providerSlug).catch(() => null);
          if (bySlug?.id) return bySlug.id;
        }
        return getProviderIdByDisplayName(item.providerName).catch(() => null);
      };

      for (const item of cartItems) {
        const name = item.providerName;
        if (providerIdCache[name] === undefined) {
          providerIdCache[name] = await resolveProviderId(item);
        }
        const pid = providerIdCache[name];
        if (pid && !providerCapCache[name]) {
          providerCapCache[name] = await getProviderBookingCapSettings(pid).catch(
            () => ({ auto_accept: false, max_per_day: 0 })
          );
        }
        if (!providerCapCache[name]) {
          providerCapCache[name] = { auto_accept: false, max_per_day: 0 };
        }
      }

      const unresolved = cartItems.filter(item => !providerIdCache[item.providerName]);
      if (unresolved.length > 0) {
        const names = [...new Set(unresolved.map(i => i.providerDisplayName ?? i.providerName))].join(', ');
        throw new BookingError(
          `We couldn't link ${names} to a registered provider, so the booking wasn't placed. ` +
          `Please re-add the service from the provider's profile and try again.`
        );
      }

      for (const item of cartItems) {
        const apt = appointmentData.find(a => a.cartItemId === item.id);
        const pid = providerIdCache[item.providerName];
        const caps = providerCapCache[item.providerName];
        if (apt && pid && caps && caps.max_per_day > 0) {
          const existingCount = await countProviderBookingsOnDate(pid, apt.date);
          if (existingCount >= caps.max_per_day) {
            const displayName = item.providerDisplayName ?? item.providerName;
            throw new BookingError(`${displayName} is fully booked on that date. Please choose a different day.`);
          }
        }
      }

      // ── Slot conflict pre-check against ALL users' bookings ──────────────────
      // validateBookingsBeforeCheckout only checks the current user's own
      // bookings; another client may have taken the slot since the calendar
      // loaded. The DB unique index is the hard guarantee — this check turns a
      // cryptic insert failure into a clear message before anything is saved.
      for (const item of cartItems) {
        const apt = appointmentData.find(a => a.cartItemId === item.id);
        const pid = providerIdCache[item.providerName];
        if (!apt || !pid) continue;
        const pgTime = timeTo24(apt.time);
        if (pgTime && await isSlotTaken(pid, apt.date, pgTime)) {
          const displayName = item.providerDisplayName ?? item.providerName;
          throw new BookingError(
            `${displayName} already has a booking at ${apt.time} on ${apt.date}. Please pick another time.`
          );
        }
      }

      // Fetch real provider locations from DB before building appointment records
      const uniqueProviderNames = [...new Set(cartItems.map(i => i.providerDisplayName ?? i.providerName))];
      const providerLocations: Record<string, import('../services/databaseService').ProviderLocationData> = await getProviderLocationsByDisplayNames(uniqueProviderNames).catch(() => ({}));

      // Real UUID so it can be persisted to bookings.group_booking_id (UUID
      // column) — the provider side can then group multi-service checkouts
      const groupBookingId = generateUuid();
      const isGroupBooking = cartItems.length > 1;

      const newBookings: ConfirmedBooking[] = cartItems.map((item) => {
        const appointment = appointmentData.find(a => a.cartItemId === item.id);

        if (!appointment) {
          throw new Error(`Missing appointment data for ${item.serviceName}`);
        }

        const fullProviderName = item.providerDisplayName ?? item.providerName;
        const endTime = calculateEndTime(appointment.time, item.duration);
        const bookingDateTime = createBookingDateTime(appointment.date, appointment.time);
        const now = new Date();
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
          address: providerLocations[fullProviderName]?.address ?? appointment.address,
          coordinates: (providerLocations[fullProviderName]?.coordinates ?? appointment.coordinates) as unknown as BookingCoordinates,
          phone: providerLocations[fullProviderName]?.phone ?? appointment.phone,
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
          groupBookingId: isGroupBooking ? groupBookingId : undefined,
          isGroupBooking,
          groupBookingCount: isGroupBooking ? cartItems.length : undefined,
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
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          for (const item of cartItems) {
            const apt = appointmentData.find(a => a.cartItemId === item.id);
            if (!apt) continue;

            const providerId = providerIdCache[item.providerName];
            if (!providerId) continue; // unreachable — resolution guaranteed above

            try {

            const pgTime = timeTo24(apt.time);
            if (!pgTime) continue;
            const endTimeStr = calculateEndTime(apt.time, item.duration);
            const pgEndTime = timeTo24(endTimeStr);

            const addOnsTotal = item.addOns?.reduce((s, a) => s + (a.price || 0), 0) ?? 0;
            const logoUrl = typeof item.providerImage === 'string'
              ? item.providerImage
              : (item.providerImage && typeof item.providerImage === 'object' && 'uri' in item.providerImage
                  ? (item.providerImage as { uri?: string }).uri ?? null
                  : null);
            const dbPayStatus = apt.paymentType === 'full' ? 'fully_paid' : 'deposit_paid';

            const newDbBooking = await dbCreateBooking(
              {
                user_id: user.id,
                provider_id: providerId,
                // Link the real service row when the cart item carries the DB
                // UUID (static/demo services have numeric ids — store null).
                // This powers waitlist service-matching, duration lookups and
                // review linkage downstream.
                service_id: item.serviceId && UUID_RE.test(item.serviceId) ? item.serviceId : null,
                status: 'pending',
                booking_date: apt.date,
                booking_time: pgTime,
                end_time: pgEndTime,
                notes: apt.notes ?? null,
                booking_instructions: null,
                payment_type: apt.paymentType,
                base_price: item.price,
                add_ons_total: addOnsTotal,
                service_charge: apt.serviceCharge,
                deposit_amount: apt.depositAmount,
                amount_paid: apt.amountPaid,
                remaining_balance: apt.remainingBalance,
                payment_status: dbPayStatus as 'fully_paid' | 'deposit_paid',
                payment_method: apt.paymentMethod ?? null,
                payment_intent_id: null,
                is_group_booking: cartItems.length > 1,
                group_booking_id: cartItems.length > 1 ? groupBookingId : null,
                group_booking_count: cartItems.length,
                provider_name_snapshot: item.providerName,
                service_name_snapshot: item.serviceName,
                service_category_snapshot: item.providerService || null,
                provider_logo_snapshot: logoUrl,
                provider_address_snapshot: providerLocations[item.providerDisplayName ?? item.providerName]?.address ?? apt.address ?? null,
                provider_phone_snapshot: providerLocations[item.providerDisplayName ?? item.providerName]?.phone ?? apt.phone ?? null,
                provider_coordinates: (() => {
                  const c = (providerLocations as Record<string, { coordinates?: { latitude: number; longitude: number } }>)[item.providerDisplayName ?? item.providerName]?.coordinates;
                  return c ? { lat: c.latitude, lng: c.longitude } : null;
                })(),
                customer_name: apt.customerName,
                customer_email: apt.customerEmail,
                customer_phone: apt.customerPhone,
                address_released_at: null,
                client_address: clientAddress ?? null,
                occasion_type: null,
                style_request: null,
                reference_image_url: null,
              },
              (item.addOns ?? []).map(a => ({
                add_on_id: String(a.id),
                name_snapshot: a.name,
                price_snapshot: a.price,
              }))
            );

            if (newDbBooking?.id) {
              dbIdByCartItemId[item.id] = newDbBooking.id;
            }

            // Auto-confirm if provider has auto_accept_bookings enabled
            if (providerCapCache[item.providerName]?.auto_accept && newDbBooking?.id) {
              await dbUpdateBookingStatus(newDbBooking.id, 'confirmed');
            }
            // Confirmation email — fire and forget, never blocks booking
            if (apt.customerEmail) {
              const { subject, html } = bookingConfirmationEmail({
                clientName: apt.customerName || 'there',
                providerName: item.providerName,
                service: item.serviceName,
                date: new Date(apt.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
                time: apt.time,
                location: apt.address || 'Address shared on confirmation',
              });
              sendEmail(apt.customerEmail, subject, html).catch(() => {});
            }

            } catch (itemError: any) {
              const name = item.providerDisplayName ?? item.providerName;
              let message: string;
              if (itemError?.code === '23505') {
                // Lost the race for this slot — another booking landed first
                message = `That time slot with ${name} was just taken by another client. Please choose a different time.`;
              } else if (itemError instanceof Error && !itemError.message.includes('Network') && !('code' in itemError)) {
                // createBooking validation: closed day, blocked date, overlap…
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
          "We couldn't reach the server, so your booking wasn't placed. Please check your connection and try again."
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

      // Real notification per booking — client-facing, in the same Supabase
      // table NotificationsScreen actually reads (previously this wrote to a
      // local-only AsyncStorage store nothing in the app ever displayed, so
      // clients never saw a "booking request sent" / "payment received"
      // entry in their inbox at all). Sent for every booking that actually
      // persisted, even if a sibling item in the same multi-service checkout
      // failed — a client who successfully booked 2 of 3 services should
      // still be told about those 2, not left with silence because item 3
      // blew up. Auto-accept providers get their own booking_confirmed
      // notification a moment later from the status-change trigger (see the
      // auto-confirm step above); a still-pending booking has no such
      // trigger to rely on, so it needs its own "request sent" notification.
      const succeededBookings = newBookings.filter(nb => !failedCartItemIds.has(nb.cartItemId));
      for (const booking of succeededBookings) {
        if (booking.status !== BookingStatus.PENDING) continue;
        insertBookingUserNotification({
          booking_id: booking.id,
          type: 'booking_pending',
          title: 'Booking Request Sent',
          message: `Your request for ${booking.serviceName} with ${booking.providerName} on ${booking.bookingDate} at ${booking.bookingTime} has been sent — awaiting confirmation.`,
          priority: 'medium',
          is_actionable: true,
        }).catch(() => {});
      }
      if (succeededBookings.length > 0) {
        const totalPaid = succeededBookings.reduce((sum, b) => sum + b.amountPaid, 0);
        insertBookingUserNotification({
          booking_id: succeededBookings[0]!.id,
          type: 'payment_success',
          title: 'Payment Received',
          message: succeededBookings.length > 1
            ? `We received your payment of £${totalPaid.toFixed(2)} for ${succeededBookings.length} services.`
            : `We received your payment of £${totalPaid.toFixed(2)} for ${succeededBookings[0]!.serviceName}.`,
          priority: 'medium',
          is_actionable: false,
        }).catch(() => {});
      }

      // Fail the checkout with the real reason(s) — but make clear when it
      // was only PART of a multi-service checkout, and carry the cart item
      // ids that DID book so the caller can clear just those from the cart.
      if (persistFailures.length > 0) {
        const reasons = [...new Set(persistFailures.map(f => f.message))].join('\n');
        const message = succeededBookings.length > 0
          ? `${succeededBookings.length} of ${newBookings.length} services were booked successfully. The rest couldn't be placed:\n${reasons}`
          : reasons;
        throw new BookingError(message, succeededBookings.map(b => b.cartItemId));
      }

      logger.log('All bookings created successfully');
    } catch (error) {
      logger.error('❌ Failed to create bookings:', error);
      throw error;
    }
  }, [bookings, saveBookings]);

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
      } catch (error) {
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
        } catch (error) {
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

  const value: BookingContextType = {
    bookings,
    confirmedBookings: bookings,
    upcomingBookings,
    pastBookings,
    todayBookings,
    currentBooking,
    nextBookings,
    allTodayBookingsCompleted,
    createBookingsFromCart,
    validateBookingsBeforeCheckout,
    updateBookingStatus,
    cancelBooking,
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
    hasMoreHistory,
    loadingMoreHistory,
    loadOlderBookings,
  };

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