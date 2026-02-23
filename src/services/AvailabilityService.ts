// src/services/AvailabilityService.ts
// Manages provider availability and prevents double-booking

import AsyncStorage from '@react-native-async-storage/async-storage';

const BOOKINGS_STORAGE_KEY = '@bookings';

export interface TimeSlot {
  time: string;
  isBooked: boolean;
  bookingId?: string | undefined;
}

export interface ProviderAvailability {
  providerId: string;
  providerName: string;
  // Provider's base schedule (what times they offer)
  baseSchedule: {
    [dayOfWeek: number]: string[]; // 0 = Sunday, 6 = Saturday
  };
  // Blocked dates (days off, holidays, etc.)
  blockedDates: string[]; // YYYY-MM-DD format
  // Custom hours for specific dates
  customHours?: {
    [date: string]: string[]; // Date-specific available times
  };
}

export interface BookingConflict {
  hasConflict: boolean;
  conflictingBookingId?: string;
  message?: string;
}

// Parse time string to minutes for comparison
const parseTimeToMinutes = (timeStr: string): number => {
  const cleanTime = timeStr.trim().toUpperCase();
  const isPM = cleanTime.includes('PM');
  const isAM = cleanTime.includes('AM');

  const timeOnly = cleanTime.replace(/\s*(AM|PM)/gi, '').trim();
  const parts = timeOnly.split(':');

  if (parts.length !== 2) return 0;

  let hours = parseInt(parts[0] || '0');
  const minutes = parseInt(parts[1] || '0');

  if (isNaN(hours) || isNaN(minutes)) return 0;

  if (isPM && hours !== 12) hours += 12;
  else if (isAM && hours === 12) hours = 0;

  return hours * 60 + minutes;
};

// Parse duration string to minutes
const parseDurationToMinutes = (duration: string): number => {
  const match = duration.match(/(\d+(?:\.\d+)?)\s*(hour|hr|h|minute|min|m)/i);
  if (!match) return 60; // Default 1 hour

  const amount = parseFloat(match[1] || '1');
  const unit = (match[2] || 'h').toLowerCase();

  if (unit.startsWith('h')) {
    return Math.round(amount * 60);
  }
  return Math.round(amount);
};

// Check if two time ranges overlap
const doTimesOverlap = (
  start1: number,
  end1: number,
  start2: number,
  end2: number
): boolean => {
  return start1 < end2 && start2 < end1;
};

// Default provider schedules based on existing hardcoded rules
const getDefaultProviderSchedule = (providerName: string): ProviderAvailability['baseSchedule'] => {
  const standardHours = [
    '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
    '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM'
  ];

  const weekdaySchedule: { [key: number]: string[] } = {};
  const weekendSchedule: { [key: number]: string[] } = {};

  // Build schedule based on provider-specific rules
  const normalizedName = providerName.toUpperCase();

  for (let day = 0; day < 7; day++) {
    const isWeekend = day === 0 || day === 6;
    let availableHours = [...standardHours];

    // Apply provider-specific restrictions
    if (normalizedName.includes('KATHRINE') || normalizedName.includes('STYLED BY KATHRINE')) {
      availableHours = availableHours.filter(time => time !== '12:00 PM');
      if (isWeekend) {
        availableHours = availableHours.filter(time => !['9:00 AM', '6:00 PM'].includes(time));
      }
    } else if (normalizedName.includes('DIVA') || normalizedName.includes('DIVA NAILS')) {
      availableHours = availableHours.filter(time => !['12:00 PM', '1:00 PM'].includes(time));
    } else if (normalizedName.includes('LASHED') || normalizedName.includes('YOUR LASHED')) {
      if (isWeekend) {
        availableHours = availableHours.filter(time => time !== '9:00 AM');
      }
    } else if (normalizedName.includes('VIKKI')) {
      availableHours = ['10:00 AM', '11:00 AM', '2:00 PM', '3:00 PM', '4:00 PM'];
    } else if (normalizedName.includes('MYA') || normalizedName.includes('MAKEUP BY MYA')) {
      availableHours = availableHours.filter(time => time !== '1:00 PM');
    } else if (normalizedName.includes('JENNIFER') || normalizedName.includes('HAIR BY JENNIFER')) {
      availableHours = availableHours.filter(time => time !== '12:00 PM');
    } else if (normalizedName.includes('JANA')) {
      availableHours = availableHours.filter(time => !['12:00 PM', '1:00 PM'].includes(time));
    } else if (normalizedName.includes('HER BROWS')) {
      if (isWeekend) {
        availableHours = availableHours.filter(time => time !== '6:00 PM');
      }
    } else if (normalizedName.includes('KIKI')) {
      availableHours = availableHours.filter(time => time !== '1:00 PM');
    } else if (normalizedName.includes('ROSEMAY')) {
      availableHours = availableHours.filter(time => !['12:00 PM', '1:00 PM'].includes(time));
    } else if (normalizedName.includes('FILLER BY JESS')) {
      availableHours = availableHours.filter(time => !['12:00 PM', '1:00 PM'].includes(time));
    } else if (normalizedName.includes('EYEBROW DELUXE')) {
      if (isWeekend) {
        availableHours = availableHours.filter(time => time !== '6:00 PM');
      }
    } else if (normalizedName.includes('LASHES GALORE')) {
      if (isWeekend) {
        availableHours = availableHours.filter(time => time !== '9:00 AM');
      }
    } else if (normalizedName.includes('ZEE NAIL')) {
      availableHours = availableHours.filter(time => time !== '1:00 PM');
    } else if (normalizedName.includes('PAINTED BY ZOE')) {
      availableHours = availableHours.filter(time => time !== '12:00 PM');
    } else if (normalizedName.includes('BRAIDED SLICK')) {
      availableHours = availableHours.filter(time => time !== '12:00 PM');
      if (isWeekend) {
        availableHours = availableHours.filter(time => time !== '9:00 AM');
      }
    }

    weekdaySchedule[day] = availableHours;
  }

  return weekdaySchedule;
};

export const AvailabilityService = {
  /**
   * Get all booked slots for a provider on a specific date
   */
  async getBookedSlots(providerName: string, date: string): Promise<Array<{
    time: string;
    endTime: string;
    bookingId: string;
    serviceName: string;
    duration: string;
  }>> {
    try {
      const stored = await AsyncStorage.getItem(BOOKINGS_STORAGE_KEY);
      if (!stored) return [];

      const bookings = JSON.parse(stored);

      // Filter bookings for this provider on this date that are not cancelled
      const providerBookings = bookings.filter((booking: any) => {
        const nameMatch =
          booking.providerName?.toLowerCase() === providerName.toLowerCase() ||
          booking.providerName?.toLowerCase().includes(providerName.toLowerCase()) ||
          providerName.toLowerCase().includes(booking.providerName?.toLowerCase() || '');

        const dateMatch = booking.bookingDate === date;
        const notCancelled = booking.status !== 'cancelled' && booking.status !== 'no_show';

        return nameMatch && dateMatch && notCancelled;
      });

      return providerBookings.map((booking: any) => ({
        time: booking.bookingTime,
        endTime: booking.endTime,
        bookingId: booking.id,
        serviceName: booking.serviceName,
        duration: booking.duration,
      }));
    } catch (error) {
      console.error('Error fetching booked slots:', error);
      return [];
    }
  },

  /**
   * Get available time slots for a provider on a specific date
   * Filters out already-booked slots and considers service duration
   */
  async getAvailableSlots(
    providerName: string,
    date: string,
    serviceDuration?: string
  ): Promise<TimeSlot[]> {
    try {
      // Get the day of week for base schedule
      const dateObj = new Date(date);
      const dayOfWeek = dateObj.getDay();

      // Check if date is in the past
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (dateObj < today) {
        return [];
      }

      // Get provider's base schedule
      const baseSchedule = getDefaultProviderSchedule(providerName);
      const baseSlots = baseSchedule[dayOfWeek] || [];

      if (baseSlots.length === 0) {
        return [];
      }

      // Get already booked slots
      const bookedSlots = await this.getBookedSlots(providerName, date);

      // Service duration in minutes (default 60 if not specified)
      const durationMinutes = serviceDuration ? parseDurationToMinutes(serviceDuration) : 60;

      // Filter available slots
      const availableSlots: TimeSlot[] = baseSlots.map(time => {
        const slotStartMinutes = parseTimeToMinutes(time);
        const slotEndMinutes = slotStartMinutes + durationMinutes;

        // Check if this slot conflicts with any booked appointment
        const conflict = bookedSlots.find(booked => {
          const bookedStartMinutes = parseTimeToMinutes(booked.time);
          const bookedDurationMinutes = parseDurationToMinutes(booked.duration);
          const bookedEndMinutes = bookedStartMinutes + bookedDurationMinutes;

          // Check overlap in both directions:
          // 1. New booking overlaps existing booking
          // 2. Existing booking overlaps new booking time
          return doTimesOverlap(
            slotStartMinutes,
            slotEndMinutes,
            bookedStartMinutes,
            bookedEndMinutes
          );
        });

        return {
          time,
          isBooked: !!conflict,
          bookingId: conflict?.bookingId,
        };
      });

      return availableSlots;
    } catch (error) {
      console.error('Error getting available slots:', error);
      return [];
    }
  },

  /**
   * Check if a specific time slot is available for booking
   */
  async isSlotAvailable(
    providerName: string,
    date: string,
    time: string,
    serviceDuration: string
  ): Promise<BookingConflict> {
    try {
      const bookedSlots = await this.getBookedSlots(providerName, date);

      const newStartMinutes = parseTimeToMinutes(time);
      const newDurationMinutes = parseDurationToMinutes(serviceDuration);
      const newEndMinutes = newStartMinutes + newDurationMinutes;

      // Check for conflicts with existing bookings
      for (const booked of bookedSlots) {
        const bookedStartMinutes = parseTimeToMinutes(booked.time);
        const bookedDurationMinutes = parseDurationToMinutes(booked.duration);
        const bookedEndMinutes = bookedStartMinutes + bookedDurationMinutes;

        if (doTimesOverlap(newStartMinutes, newEndMinutes, bookedStartMinutes, bookedEndMinutes)) {
          return {
            hasConflict: true,
            conflictingBookingId: booked.bookingId,
            message: `This time slot conflicts with an existing ${booked.serviceName} appointment (${booked.time} - ${booked.endTime})`,
          };
        }
      }

      return { hasConflict: false };
    } catch (error) {
      console.error('Error checking slot availability:', error);
      return {
        hasConflict: true,
        message: 'Unable to verify availability. Please try again.',
      };
    }
  },

  /**
   * Validate multiple bookings don't conflict with each other or existing bookings
   * Used when checking out a cart with multiple items
   */
  async validateCartBookings(
    bookings: Array<{
      providerName: string;
      date: string;
      time: string;
      duration: string;
      cartItemId: string;
    }>
  ): Promise<{
    isValid: boolean;
    conflicts: Array<{
      cartItemId: string;
      message: string;
    }>;
  }> {
    const conflicts: Array<{ cartItemId: string; message: string }> = [];

    for (const booking of bookings) {
      // Check against existing bookings in storage
      const existingConflict = await this.isSlotAvailable(
        booking.providerName,
        booking.date,
        booking.time,
        booking.duration
      );

      if (existingConflict.hasConflict) {
        conflicts.push({
          cartItemId: booking.cartItemId,
          message: existingConflict.message || 'Time slot is no longer available',
        });
        continue;
      }

      // Check against other items in the same cart (same provider, same date)
      const cartConflicts = bookings.filter(other => {
        if (other.cartItemId === booking.cartItemId) return false;
        if (other.providerName !== booking.providerName) return false;
        if (other.date !== booking.date) return false;

        const thisStart = parseTimeToMinutes(booking.time);
        const thisEnd = thisStart + parseDurationToMinutes(booking.duration);
        const otherStart = parseTimeToMinutes(other.time);
        const otherEnd = otherStart + parseDurationToMinutes(other.duration);

        return doTimesOverlap(thisStart, thisEnd, otherStart, otherEnd);
      });

      if (cartConflicts.length > 0) {
        conflicts.push({
          cartItemId: booking.cartItemId,
          message: `This time slot conflicts with another service in your cart`,
        });
      }
    }

    return {
      isValid: conflicts.length === 0,
      conflicts,
    };
  },

  /**
   * Get provider's base availability schedule
   */
  getProviderSchedule(providerName: string): ProviderAvailability['baseSchedule'] {
    return getDefaultProviderSchedule(providerName);
  },

  /**
   * Format time slots for display, marking booked ones
   */
  formatSlotsForCalendar(slots: TimeSlot[]): string[] {
    return slots
      .filter(slot => !slot.isBooked)
      .map(slot => slot.time);
  },
};

export default AvailabilityService;
