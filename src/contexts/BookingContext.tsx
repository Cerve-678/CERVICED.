// src/contexts/BookingContext.tsx - COMPLETE FIXED VERSION
import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CartItem } from './CartContext';
import { NotificationService } from '../services/notificationService';
import { AvailabilityService } from '../services/AvailabilityService';

export enum BookingStatus {
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

interface AvailableDate {
  date: string;
  times: string[];
}

// Payment status for tracking payment state
export enum PaymentStatus {
  PENDING = 'pending',           // Payment not yet processed
  DEPOSIT_PAID = 'deposit_paid', // Only deposit paid, balance due
  PAID_IN_FULL = 'paid_in_full', // Full payment received
  REFUND_PENDING = 'refund_pending',
  REFUNDED = 'refunded',
  FAILED = 'failed',
}

// Detailed payment breakdown for receipts
export interface PaymentBreakdown {
  baseServicePrice: number;      // Original service price
  addOnsTotal: number;           // Total of all add-ons
  subtotal: number;              // baseServicePrice + addOnsTotal
  serviceChargeRate: number;     // The rate used (e.g., 0.05 for 5%)
  serviceChargeAmount: number;   // Calculated service charge
  totalBeforePayment: number;    // subtotal + serviceChargeAmount
  depositPercentage?: number | undefined;    // If deposit, the % used (e.g., 0.20 for 20%)
  depositAmount?: number | undefined;        // If deposit, the calculated amount
  amountCharged: number;         // What was actually charged at checkout
  remainingBalance: number;      // What's still owed
  // Add-on itemization for receipt
  addOnItems?: Array<{
    name: string;
    price: number;
  }> | undefined;
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
  amountPaid: number; // EXACT amount charged at checkout
  depositAmount: number; // Isolated deposit on subtotal
  remainingBalance: number;
  serviceCharge: number;

  // NEW: Enhanced payment tracking
  paymentStatus: PaymentStatus;
  paymentBreakdown?: PaymentBreakdown | undefined; // Detailed breakdown for receipts
  paymentMethod?: string | undefined; // 'card', 'apple_pay', 'google_pay', etc.
  paymentConfirmedAt?: string | undefined; // ISO timestamp when payment was confirmed
  transactionId?: string | undefined; // External payment processor transaction ID

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
    requestedAt?: string | undefined;
    providerAvailableDates?: AvailableDate[] | undefined;
    providerRespondedAt?: string | undefined;
    rescheduleCount?: number | undefined;
    lastRescheduledAt?: string | undefined;
  } | undefined;

  // Metadata
  notes?: string | undefined;
  addOns?: Array<{
    id: number;
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
  createBookingsFromCart: (cartItems: CartItem[], appointmentData: AppointmentData[]) => Promise<void>;
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

  // Reschedule functions
  requestReschedule: (bookingId: string, preferredDates: string[]) => Promise<void>;
  providerRespondToReschedule: (bookingId: string, availableDates: AvailableDate[]) => Promise<void>;
  confirmReschedule: (bookingId: string, newDate: string, newTime: string) => Promise<void>;
}

export interface AppointmentData {
  cartItemId: string;
  date: string;
  time: string;
  address: string;
  coordinates: BookingCoordinates;
  phone: string;
  notes?: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  paymentType: 'full' | 'deposit';
  amountPaid: number; // EXACT amount paid at checkout
  depositAmount: number; // Isolated deposit (NO service charge)
  remainingBalance: number;
  serviceCharge: number;
}

const STORAGE_KEY = '@bookings';

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
    console.error('❌ Error parsing time:', error);
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
    console.error('❌ Error calculating end time:', error);
    return startTime;
  }
};

const createBookingDateTime = (dateStr: string, timeStr: string): Date => {
  try {
    if (!dateStr || typeof dateStr !== 'string' || dateStr.length < 10) {
      console.error('❌ Invalid date:', dateStr);
      return new Date();
    }
    
    if (!timeStr || typeof timeStr !== 'string') {
      console.error('❌ Invalid time:', timeStr);
      return new Date();
    }
    
    const dateParts = dateStr.split('-');
    if (dateParts.length !== 3) {
      console.error('❌ Invalid date format:', dateStr);
      return new Date();
    }
    
    const year = parseInt(dateParts[0] || '0');
    const month = parseInt(dateParts[1] || '0');
    const day = parseInt(dateParts[2] || '0');
    
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      console.error('❌ Invalid date parts:', { year, month, day });
      return new Date();
    }
    
    const minutes = parseTimeToMinutes(timeStr);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    return new Date(year, month - 1, day, hours, mins, 0, 0);
  } catch (error) {
    console.error('❌ Error creating booking datetime:', error);
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
    currentStatus === BookingStatus.COMPLETED
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
    console.error('❌ Error determining status:', error);
    return BookingStatus.UPCOMING;
  }
};

const sortBookingsByDateTime = (bookings: ConfirmedBooking[]): ConfirmedBooking[] => {
  return [...bookings].sort((a, b) => {
    const dateA = createBookingDateTime(a.bookingDate, a.bookingTime);
    const dateB = createBookingDateTime(b.bookingDate, b.bookingTime);
    return dateA.getTime() - dateB.getTime();
  });
};

const getFullProviderName = (shortName: string): string => {
  const nameMap: Record<string, string> = {
    JENNIFER: 'Hair by Jennifer',
    'Hair by Jennifer': 'Hair by Jennifer',
    KATHRINE: 'Styled by Kathrine',
    'Styled by Kathrine': 'Styled by Kathrine',
    DIVANA: 'Diva Nails',
    'Diva Nails': 'Diva Nails',
    JANA: 'Jana Aesthetics',
    'Jana Aesthetics': 'Jana Aesthetics',
    'HER BROWS': 'Her Brows',
    'Her Brows': 'Her Brows',
    KIKI: "Kiki's Nails",
    "Kiki's Nails": "Kiki's Nails",
    MYA: 'Makeup by Mya',
    'Makeup by Mya': 'Makeup by Mya',
    VIKKI: 'Vikki Laid',
    'Vikki Laid': 'Vikki Laid',
    LASHED: 'Your Lashed',
    'Your Lashed': 'Your Lashed',
  };
  return nameMap[shortName] || shortName;
};

// ==================== PROVIDER COMPONENT ====================

export const BookingProvider = ({ children }: { children: ReactNode }) => {
  const [bookings, setBookings] = useState<ConfirmedBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadBookings = useCallback(async () => {
    try {
      if (__DEV__) console.log('Loading bookings from storage...');
      setIsLoading(true);
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      
      if (stored) {
        const parsed = JSON.parse(stored);
        if (__DEV__) console.log('Loaded', parsed.length, 'bookings from storage');
        
        const cleanedBookings = parsed.map((booking: any) => {
          if (!booking.bookingDate || typeof booking.bookingDate !== 'string' || booking.bookingDate.length < 10) {
            if (__DEV__) console.warn('Fixing corrupted date for booking:', booking.id);
            booking.bookingDate = new Date().toISOString().split('T')[0];
          }
          
          if (!booking.bookingTime || typeof booking.bookingTime !== 'string') {
            if (__DEV__) console.warn('Fixing missing time for booking:', booking.id);
            booking.bookingTime = '10:00 AM';
          }
          
          if (booking.rescheduleRequest?.originalDate && booking.rescheduleRequest.originalDate.length < 10) {
            if (__DEV__) console.warn('Fixing corrupted originalDate');
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
        
        const updatedBookings = migratedBookings.map((booking: ConfirmedBooking) => ({
          ...booking,
          status: determineBookingStatus(
            booking.bookingDate,
            booking.bookingTime,
            booking.endTime,
            booking.status
          )
        }));
        
        setBookings(updatedBookings);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedBookings));
        
      } else {
        if (__DEV__) console.log('No bookings in storage');
        setBookings([]);
      }
    } catch (error) {
      console.error('❌ Failed to load bookings:', error);
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

  const saveBookings = useCallback(async (bookingsToSave: ConfirmedBooking[]) => {
    try {
      if (__DEV__) console.log('Saving', bookingsToSave.length, 'bookings...');
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(bookingsToSave));
      setBookings(bookingsToSave);
      if (__DEV__) console.log('Bookings saved successfully');
    } catch (error) {
      console.error('❌ Failed to save bookings:', error);
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

      if (__DEV__) console.log('Step 1: User requesting reschedule for:', bookingId);

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

      await NotificationService.addRescheduleRequest(
        booking.providerName,
        booking.serviceName,
        booking.providerImage,
        bookingId,
        'reschedule_pending'
      );

      if (__DEV__) console.log('Step 1 Complete: Status=PENDING, waiting for provider response');
    } catch (error) {
      console.error('❌ Failed to request reschedule:', error);
      throw error;
    }
  }, [saveBookings]);

  const providerRespondToReschedule = useCallback(async (
    bookingId: string,
    availableDates: AvailableDate[]
  ) => {
    try {
      if (__DEV__) console.log('Step 2: Provider responding with available dates for:', bookingId);

      // ✅ FIX: Read fresh from AsyncStorage to avoid stale closure issues with concurrent reschedules
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (!stored) throw new Error('No bookings found in storage');

      const currentBookings: ConfirmedBooking[] = JSON.parse(stored);
      const targetBooking = currentBookings.find(b => b.id === bookingId);

      if (!targetBooking) throw new Error('Booking not found');

      // ✅ FIX: Skip if booking is no longer pending (was cancelled or already confirmed)
      if (!targetBooking.isPendingReschedule) {
        if (__DEV__) console.log(`[${targetBooking.providerName}] Skipping - booking ${bookingId} is no longer pending reschedule`);
        return;
      }

      // ✅ FIX: Skip if provider already responded (prevent duplicate responses)
      if (targetBooking.rescheduleRequest?.providerAvailableDates) {
        if (__DEV__) console.log(`[${targetBooking.providerName}] Skipping - provider already responded for booking ${bookingId}`);
        return;
      }

      if (__DEV__) console.log(`[${targetBooking.providerName}] Before update:`, {
        isPending: targetBooking.isPendingReschedule,
        hasDates: !!targetBooking.rescheduleRequest?.providerAvailableDates,
        datesCount: targetBooking.rescheduleRequest?.providerAvailableDates?.length || 0
      });

      // ✅ Update only the specific booking
      const updatedBooking: ConfirmedBooking = {
        ...targetBooking,
        isPendingReschedule: true, // ✅ Still true, but now has dates (AVAILABLE state)
        rescheduleRequest: {
          ...targetBooking.rescheduleRequest,
          originalDate: targetBooking.rescheduleRequest?.originalDate,
          originalTime: targetBooking.rescheduleRequest?.originalTime,
          requestedDates: targetBooking.rescheduleRequest?.requestedDates,
          requestedAt: targetBooking.rescheduleRequest?.requestedAt,
          rescheduleCount: targetBooking.rescheduleRequest?.rescheduleCount,
          lastRescheduledAt: targetBooking.rescheduleRequest?.lastRescheduledAt,
          providerAvailableDates: availableDates, // ✅ Explicitly set
          providerRespondedAt: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      };

      if (__DEV__) console.log(`[${targetBooking.providerName}] After update:`, {
        isPending: updatedBooking.isPendingReschedule,
        hasDates: !!updatedBooking.rescheduleRequest?.providerAvailableDates,
        datesCount: updatedBooking.rescheduleRequest?.providerAvailableDates?.length || 0
      });

      // ✅ FIX: Map over fresh bookings from storage, not stale state
      const updatedBookings = currentBookings.map(b => b.id === bookingId ? updatedBooking : b);

      await saveBookings(updatedBookings);

      await NotificationService.addRescheduleProviderResponse(
          targetBooking.providerName,
          targetBooking.serviceName,
          targetBooking.providerImage,
          bookingId,
          'reschedule_pending'
        );

      if (__DEV__) console.log('Step 2 Complete: Status=AVAILABLE, user can now select date');
    } catch (error) {
      console.error('❌ Failed to process provider response:', error);
      throw error;
    }
  }, [saveBookings]);

  const confirmReschedule = useCallback(async (bookingId: string, newDate: string, newTime: string) => {
    try {
      if (__DEV__) console.log('Step 3: User confirming reschedule:', bookingId, newDate, newTime);

      // ✅ FIX: Read fresh from AsyncStorage to avoid stale closure issues with concurrent reschedules
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (!stored) throw new Error('No bookings found in storage');

      const currentBookings: ConfirmedBooking[] = JSON.parse(stored);
      const booking = currentBookings.find(b => b.id === bookingId);

      if (!booking) throw new Error('Booking not found');

      // ✅ FIX: Skip if booking is no longer pending (was cancelled or already confirmed)
      if (!booking.isPendingReschedule) {
        if (__DEV__) console.log(`[${booking.providerName}] Skipping confirm - booking ${bookingId} is no longer pending reschedule`);
        return;
      }

      const newEndTime = calculateEndTime(newTime, booking.duration);

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

      await NotificationService.addRescheduleConfirmed(
        booking.providerName,
        booking.serviceName,
        booking.providerImage,
        bookingId,
        newDate,
        newTime,
        'upcoming'
      );

      if (__DEV__) console.log('Step 3 Complete: Status=UPCOMING, 24hr cooldown active, total reschedules:', rescheduleCount);
    } catch (error) {
      console.error('❌ Failed to confirm reschedule:', error);
      throw error;
    }
  }, [saveBookings]);

  const cancelBooking = useCallback(async (bookingId: string) => {
    try {
      if (__DEV__) console.log('Cancelling booking:', bookingId);

      // ✅ FIX: Read fresh from AsyncStorage to avoid stale closure issues
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (!stored) throw new Error('No bookings found in storage');

      const currentBookings: ConfirmedBooking[] = JSON.parse(stored);
      const booking = currentBookings.find(b => b.id === bookingId);

      if (!booking) throw new Error('Booking not found');

      // ✅ FIX: Map over fresh bookings from storage
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

      // Create cancellation notification
      await NotificationService.addBookingCancelled(
        booking.id,
        booking.providerName,
        booking.serviceName,
        booking.bookingDate,
        booking.bookingTime,
        booking.providerImage
      );

      if (__DEV__) console.log('Booking cancelled successfully');
    } catch (error) {
      console.error('❌ Failed to cancel booking:', error);
      throw error;
    }
  }, [saveBookings]);

  const updateBookingStatus = useCallback(async (bookingId: string, status: BookingStatus) => {
    try {
      const updatedBookings = bookings.map(b =>
        b.id === bookingId ? { ...b, status, updatedAt: new Date().toISOString() } : b
      );
      await saveBookings(updatedBookings);
    } catch (error) {
      console.error('❌ Failed to update booking status:', error);
      throw error;
    }
  }, [bookings, saveBookings]);

  const validateBookingsBeforeCheckout = useCallback(async (
    cartItems: CartItem[],
    appointmentData: AppointmentData[]
  ): Promise<BookingConflictResult> => {
    try {
      if (__DEV__) console.log('Validating bookings before checkout...');

      // Build list of bookings to validate
      const bookingsToValidate = cartItems.map(item => {
        const appointment = appointmentData.find(a => a.cartItemId === item.id);
        return {
          providerName: getFullProviderName(item.providerName),
          date: appointment?.date || '',
          time: appointment?.time || '',
          duration: item.duration,
          cartItemId: item.id,
        };
      }).filter(b => b.date && b.time);

      // Use AvailabilityService to check for conflicts
      const result = await AvailabilityService.validateCartBookings(bookingsToValidate);

      if (!result.isValid) {
        if (__DEV__) console.log('Booking conflicts found:', result.conflicts);
      } else {
        if (__DEV__) console.log('All bookings validated - no conflicts');
      }

      return result;
    } catch (error) {
      console.error('❌ Error validating bookings:', error);
      return {
        isValid: false,
        conflicts: [{
          cartItemId: 'unknown',
          message: 'Unable to validate bookings. Please try again.',
        }],
      };
    }
  }, []);

  const createBookingsFromCart = useCallback(async (
    cartItems: CartItem[],
    appointmentData: AppointmentData[]
  ) => {
    try {
      if (__DEV__) console.log('Creating bookings from cart...');

      // Validate bookings before creating to prevent double-booking
      const validation = await validateBookingsBeforeCheckout(cartItems, appointmentData);
      if (!validation.isValid) {
        const conflictMessages = validation.conflicts.map(c => c.message).join('; ');
        throw new Error(`Booking conflict detected: ${conflictMessages}`);
      }

      const groupBookingId = `group_${Date.now()}`;
      const isGroupBooking = cartItems.length > 1;

      const newBookings: ConfirmedBooking[] = cartItems.map((item) => {
        const appointment = appointmentData.find(a => a.cartItemId === item.id);

        if (!appointment) {
          throw new Error(`Missing appointment data for ${item.serviceName}`);
        }

        const fullProviderName = getFullProviderName(item.providerName);
        const endTime = calculateEndTime(appointment.time, item.duration);
        const bookingDateTime = createBookingDateTime(appointment.date, appointment.time);
        const now = new Date();
        const initialStatus = bookingDateTime > now ? BookingStatus.UPCOMING : BookingStatus.COMPLETED;

        // Calculate payment breakdown for receipt
        const baseServicePrice = item.price;
        const addOnsTotal = item.addOns?.reduce((sum, addon) => sum + (addon.price || 0), 0) || 0;
        const subtotal = baseServicePrice + addOnsTotal;
        const serviceChargeRate = 0.05; // 5% service charge
        const serviceChargeAmount = appointment.serviceCharge;
        const totalBeforePayment = subtotal + serviceChargeAmount;
        const depositPercentage = appointment.paymentType === 'deposit' ? 0.20 : undefined;

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
          address: appointment.address,
          coordinates: appointment.coordinates,
          phone: appointment.phone,
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
          paymentConfirmedAt: new Date().toISOString(),
          transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          // Group booking
          groupBookingId: isGroupBooking ? groupBookingId : undefined,
          isGroupBooking,
          groupBookingCount: isGroupBooking ? cartItems.length : undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          confirmedAt: new Date().toISOString(),
          bookingInstructions: 'Please arrive 10 minutes early. Bring your booking confirmation.',
        };
      });

      const updatedBookings = [...bookings, ...newBookings];
      await saveBookings(updatedBookings);

      // ✅ NEW - Create notifications for each booking
      for (const booking of newBookings) {
        await NotificationService.addBookingConfirmation(
          booking.id,
          booking.providerName,
          booking.serviceName,
          booking.bookingDate,
          booking.bookingTime,
          booking.providerImage
        );
      }

      if (__DEV__) console.log('All bookings created successfully');
    } catch (error) {
      console.error('❌ Failed to create bookings:', error);
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

  const upcomingBookings = useMemo(() => {
    if (isLoading) return [];

    const now = new Date();
    const upcoming = bookings.filter(b => {
      if (b.status === BookingStatus.CANCELLED || b.status === BookingStatus.NO_SHOW) {
        return false;
      }

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
    todayBookings.every(b => b.status === BookingStatus.COMPLETED);

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
  };

  return (
    <BookingContext.Provider value={value}>
      {children}
    </BookingContext.Provider>
  );
};

export const useBooking = (): BookingContextType => {
  const context = useContext(BookingContext);
  if (!context) {
    throw new Error('useBooking must be used within a BookingProvider');
  }
  return context;
};