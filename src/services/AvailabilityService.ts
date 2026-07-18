// src/services/AvailabilityService.ts
// Manages provider availability and prevents double-booking

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';

const BOOKINGS_STORAGE_KEY = '@bookings';

// Cache provider UUID lookups for the session so we don't query on every slot
const _providerIdCache = new Map<string, string | null>();

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

// Parse "HH:MM" or "HH:MM:SS" 24-hour time to minutes
const parse24HTimeToMinutes = (timeStr: string): number => {
  const parts = timeStr.split(':');
  const h = parseInt(parts[0] ?? '0', 10);
  const m = parseInt(parts[1] ?? '0', 10);
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
};

// Generate time slots between open_time and close_time at a configurable interval
const generateSlotsFromRange = (openTime: string, closeTime: string, intervalMins = 60): string[] => {
  const openMins = parse24HTimeToMinutes(openTime);
  const closeMins = parse24HTimeToMinutes(closeTime);
  const step = [15, 30, 60].includes(intervalMins) ? intervalMins : 60;
  const slots: string[] = [];
  for (let mins = openMins; mins < closeMins; mins += step) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const period = h < 12 ? 'AM' : 'PM';
    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const displayM = m === 0 ? '00' : String(m).padStart(2, '0');
    slots.push(`${displayH}:${displayM} ${period}`);
  }
  return slots;
};

// Look up provider UUID by display name with session-level caching
const resolveProviderId = async (providerName: string): Promise<string | null> => {
  if (_providerIdCache.has(providerName)) return _providerIdCache.get(providerName) ?? null;
  const { data } = await supabase
    .from('providers')
    .select('id')
    .ilike('display_name', providerName)
    .eq('is_active', true)
    .maybeSingle();
  const id = (data as any)?.id ?? null;
  _providerIdCache.set(providerName, id);
  return id;
};

// Standard schedule for all providers — real schedules come from Supabase provider settings
const getDefaultProviderSchedule = (_providerName: string): ProviderAvailability['baseSchedule'] => {
  const standardHours = [
    '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
    '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM'
  ];
  const schedule: { [key: number]: string[] } = {};
  for (let day = 0; day < 7; day++) {
    schedule[day] = [...standardHours];
  }
  return schedule;
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
      logger.error('Error fetching booked slots:', error);
      return [];
    }
  },

  /**
   * Get available time slots for a provider on a specific date.
   * Reads the provider's real schedule from Supabase (provider_availability) when
   * the provider UUID can be resolved; falls back to the default 9-6 schedule.
   * Conflict-checks against confirmed/pending Supabase bookings.
   */
  async getAvailableSlots(
    providerName: string,
    date: string,
    serviceDuration?: string
  ): Promise<TimeSlot[]> {
    try {
      // T12:00:00 keeps the weekday stable across timezones (bare YYYY-MM-DD
      // parses as UTC midnight — the previous day west of Greenwich)
      const dateObj = new Date(date + 'T12:00:00');
      const dayOfWeek = dateObj.getDay();

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (dateObj < today) return [];

      const durationMinutes = serviceDuration ? parseDurationToMinutes(serviceDuration) : 60;

      // ── Supabase path ──────────────────────────────────────────
      const providerId = providerName ? await resolveProviderId(providerName) : null;

      if (providerId) {
        // Fetch scheduling settings + blocked date + day schedule in parallel
        const [blockedResult, availResult, settingsResult] = await Promise.all([
          supabase
            .from('provider_blocked_dates')
            .select('id')
            .eq('provider_id', providerId)
            .eq('blocked_date', date)
            .maybeSingle(),
          supabase
            .from('provider_availability')
            .select('open_time, close_time, is_closed')
            .eq('provider_id', providerId)
            .eq('day_of_week', dayOfWeek)
            .maybeSingle(),
          supabase
            .from('providers')
            .select('booking_window_days, slot_interval_mins, buffer_mins, min_booking_notice_hrs')
            .eq('id', providerId)
            .maybeSingle(),
        ]);

        if (blockedResult.data) return [];

        const settings = settingsResult.data as {
          booking_window_days: number;
          slot_interval_mins: number;
          buffer_mins: number;
          min_booking_notice_hrs: number;
        } | null;

        // Enforce booking window — reject dates too far ahead
        const windowDays = settings?.booking_window_days ?? 60;
        if (windowDays > 0) {
          const maxDate = new Date();
          maxDate.setDate(maxDate.getDate() + windowDays);
          maxDate.setHours(23, 59, 59, 999);
          if (dateObj > maxDate) return [];
        }

        const intervalMins = settings?.slot_interval_mins ?? 60;
        const bufferMins = settings?.buffer_mins ?? 0;
        const minNoticeHrs = settings?.min_booking_notice_hrs ?? 0;

        const avail = availResult.data;
        let baseSlots: string[];
        let closeTimeMins: number | null = null;
        if (!avail) {
          // Real provider with NO published hours for this day — not bookable.
          // No silent default schedule: a provider must set their schedule
          // before clients can see any slots.
          return [];
        } else if (avail.is_closed) {
          return [];
        } else {
          baseSlots = generateSlotsFromRange(avail.open_time, avail.close_time, intervalMins);
          closeTimeMins = parse24HTimeToMinutes(avail.close_time);
        }

        if (baseSlots.length === 0) return [];

        // Drop slots where the service can't finish before close time
        if (closeTimeMins !== null) {
          baseSlots = baseSlots.filter(time => {
            return parseTimeToMinutes(time) + durationMinutes <= closeTimeMins!;
          });
        }

        // Drop slots within minimum booking notice window — applied to EVERY
        // date, not just today: a 48h notice policy must also hide tomorrow
        // morning's slots.
        if (minNoticeHrs > 0) {
          const earliestAllowedMs = Date.now() + minNoticeHrs * 60 * 60 * 1000;
          baseSlots = baseSlots.filter(time => {
            const slotDate = new Date(`${date}T00:00:00`);
            slotDate.setMinutes(parseTimeToMinutes(time));
            return slotDate.getTime() >= earliestAllowedMs;
          });
        }

        if (baseSlots.length === 0) return [];

        // Fetch existing bookings
        const { data: existingBookings } = await supabase
          .from('bookings')
          .select('booking_time, end_time')
          .eq('provider_id', providerId)
          .eq('booking_date', date)
          .in('status', ['pending', 'confirmed', 'in_progress']);

        return baseSlots.map(time => {
          const slotStart = parseTimeToMinutes(time);
          const slotEnd = slotStart + durationMinutes;

          const conflict = (existingBookings ?? []).find(booked => {
            const bookedStart = parse24HTimeToMinutes(booked.booking_time);
            const bookedEnd = booked.end_time
              ? parse24HTimeToMinutes(booked.end_time)
              : bookedStart + 60;
            // Extend booked end by buffer so the gap is enforced
            return doTimesOverlap(slotStart, slotEnd, bookedStart, bookedEnd + bufferMins);
          });

          return { time, isBooked: !!conflict };
        });
      }

      // ── AsyncStorage fallback (no Supabase provider match) ────────
      const baseSchedule = getDefaultProviderSchedule(providerName);
      const baseSlots = baseSchedule[dayOfWeek] ?? [];
      if (baseSlots.length === 0) return [];

      const bookedSlots = await this.getBookedSlots(providerName, date);

      return baseSlots.map(time => {
        const slotStartMinutes = parseTimeToMinutes(time);
        const slotEndMinutes = slotStartMinutes + durationMinutes;

        const conflict = bookedSlots.find(booked => {
          const bookedStartMinutes = parseTimeToMinutes(booked.time);
          const bookedDurationMinutes = parseDurationToMinutes(booked.duration);
          const bookedEndMinutes = bookedStartMinutes + bookedDurationMinutes;
          return doTimesOverlap(slotStartMinutes, slotEndMinutes, bookedStartMinutes, bookedEndMinutes);
        });

        return {
          time,
          isBooked: !!conflict,
          bookingId: conflict?.bookingId,
        };
      });
    } catch (error) {
      logger.error('Error getting available slots:', error);
      return [];
    }
  },

  /**
   * Check if a specific time slot is available for booking.
   * Queries Supabase directly so conflicts from other users are visible.
   * Falls back to AsyncStorage only when the provider has no Supabase record.
   */
  async isSlotAvailable(
    providerName: string,
    date: string,
    time: string,
    serviceDuration: string
  ): Promise<BookingConflict> {
    try {
      const newStartMinutes = parseTimeToMinutes(time);
      const newDurationMinutes = parseDurationToMinutes(serviceDuration);
      const newEndMinutes = newStartMinutes + newDurationMinutes;

      const providerId = await resolveProviderId(providerName);

      if (providerId) {
        // Check blocked dates
        const { data: blocked } = await supabase
          .from('provider_blocked_dates')
          .select('id')
          .eq('provider_id', providerId)
          .eq('blocked_date', date)
          .maybeSingle();
        if (blocked) {
          return { hasConflict: true, message: 'Provider is not available on this date.' };
        }

        // Check the slot falls within the provider's working hours
        const dayOfWeek = new Date(date + 'T12:00:00').getDay();
        const { data: avail } = await supabase
          .from('provider_availability')
          .select('open_time, close_time, is_closed')
          .eq('provider_id', providerId)
          .eq('day_of_week', dayOfWeek)
          .maybeSingle();

        if (!avail) {
          // No published hours for this day — provider isn't bookable on it
          return { hasConflict: true, message: "The provider hasn't published their schedule for this day." };
        }
        if (avail.is_closed) {
          return { hasConflict: true, message: 'Provider is closed on this day.' };
        }

        const openMins = parse24HTimeToMinutes(avail.open_time);
        const closeMins = parse24HTimeToMinutes(avail.close_time);
        if (newStartMinutes < openMins || newEndMinutes > closeMins) {
          return { hasConflict: true, message: 'This time is outside the provider\'s working hours.' };
        }

        // Check existing Supabase bookings for overlap
        const { data: existingBookings } = await supabase
          .from('bookings')
          .select('booking_time, end_time')
          .eq('provider_id', providerId)
          .eq('booking_date', date)
          .in('status', ['pending', 'confirmed', 'in_progress']);

        const conflict = (existingBookings ?? []).find(booked => {
          const bookedStart = parse24HTimeToMinutes(booked.booking_time);
          const bookedEnd = booked.end_time
            ? parse24HTimeToMinutes(booked.end_time)
            : bookedStart + 60;
          return doTimesOverlap(newStartMinutes, newEndMinutes, bookedStart, bookedEnd);
        });

        if (conflict) {
          return { hasConflict: true, message: 'This time slot is no longer available.' };
        }
        return { hasConflict: false };
      }

      // Fallback: provider not in Supabase — use AsyncStorage
      const bookedSlots = await this.getBookedSlots(providerName, date);
      for (const booked of bookedSlots) {
        const bookedStartMinutes = parseTimeToMinutes(booked.time);
        const bookedEndMinutes = bookedStartMinutes + parseDurationToMinutes(booked.duration);
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
      logger.error('Error checking slot availability:', error);
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
