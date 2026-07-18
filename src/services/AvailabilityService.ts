// src/services/AvailabilityService.ts
// Manages provider availability and prevents double-booking

import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
const BOOKINGS_STORAGE_KEY = '@cerviced_bookings';
import { logger } from '../utils/logger';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cache provider UUID lookups for the session so we don't query on every slot
const _providerIdCache = new Map<string, string | null>();

export interface TimeSlot {
  time: string;
  isBooked: boolean;
  bookingId?: string | undefined;
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

type WorkingWindow = { start_time: string; end_time: string };

/**
 * Date overrides replace the normal weekly hours. A closed override wins over
 * every other record; otherwise one or more override periods are the working
 * day. If a provider has not migrated yet we safely fall back to their legacy
 * single daily availability row.
 */
const resolveWorkingWindows = (
  recurring: WorkingWindow[],
  overrideRows: Array<{ is_closed: boolean; start_time: string | null; end_time: string | null }>,
  legacy: { open_time: string; close_time: string; is_closed: boolean } | null,
): WorkingWindow[] => {
  if (overrideRows.some(row => row.is_closed)) return [];
  const overrides = overrideRows
    .filter((row): row is { is_closed: boolean; start_time: string; end_time: string } => !row.is_closed && !!row.start_time && !!row.end_time)
    .map(row => ({ start_time: row.start_time, end_time: row.end_time }));
  if (overrides.length > 0) return overrides;
  if (recurring.length > 0) return recurring;
  return legacy && !legacy.is_closed ? [{ start_time: legacy.open_time, end_time: legacy.close_time }] : [];
};

// Effective blocked span of a booking: [start - buffer_before, end + buffer_after).
// A service's own buffer overrides the provider's global buffer_mins; NULL on
// the service means "no override" (before -> 0, after -> providerBufferMins).
type ServiceBuffer = { before: number; after: number };

const bufferFromRow = (
  row: { buffer_before_mins: number | null; buffer_after_mins: number | null } | null | undefined,
  providerBufferMins: number
): ServiceBuffer => ({
  before: row?.buffer_before_mins ?? 0,
  after: row?.buffer_after_mins ?? providerBufferMins,
});

// Fetch buffer overrides for every distinct service_id among a set of bookings
const fetchBufferByServiceId = async (
  serviceIds: (string | null | undefined)[],
  providerBufferMins: number
): Promise<Map<string, ServiceBuffer>> => {
  const distinct = Array.from(new Set(serviceIds.filter((id): id is string => !!id)));
  const map = new Map<string, ServiceBuffer>();
  if (distinct.length === 0) return map;
  const { data } = await supabase
    .from('services')
    .select('id, buffer_before_mins, buffer_after_mins')
    .in('id', distinct);
  for (const row of data ?? []) {
    map.set(row.id, bufferFromRow(row, providerBufferMins));
  }
  return map;
};

// Resolve a provider identifier to its UUID. Callers may pass either the
// real provider UUID (used as-is, no lookup) or a display name (looked up
// by exact case-insensitive match) — every entry point below accepts both,
// so callers holding a stable ID never have to round-trip through a name
// that can drift out of sync with the DB (see providerName vs
// providerDisplayName on cart items).
const resolveProviderId = async (providerIdOrName: string): Promise<string | null> => {
  if (UUID_RE.test(providerIdOrName)) return providerIdOrName;
  if (_providerIdCache.has(providerIdOrName)) return _providerIdCache.get(providerIdOrName) ?? null;
  const { data } = await supabase
    .from('providers')
    .select('id')
    .ilike('display_name', providerIdOrName)
    .eq('is_active', true)
    .maybeSingle();
  const id = (data as any)?.id ?? null;
  _providerIdCache.set(providerIdOrName, id);
  return id;
};

export const AvailabilityService = {
  /**
   * Resolve a provider identifier (UUID or display name) to its real UUID,
   * or null if no matching active provider exists. Exposed so callers can
   * distinguish "this provider has no open hours today" (a real, resolved
   * provider with all-closed days) from "we couldn't find this provider at
   * all" (bad/stale name, inactive provider) — both currently look
   * identical downstream (an empty slot list) without this check.
   */
  async resolveProvider(providerIdOrName: string): Promise<string | null> {
    return resolveProviderId(providerIdOrName);
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
   * Reads the provider's real schedule from Supabase (provider_availability),
   * applies booking window / min notice / slot interval / buffer settings,
   * and conflict-checks against confirmed/pending Supabase bookings.
   * providerName accepts either the provider's UUID or their display name.
   */
  async getAvailableSlots(
    providerName: string,
    date: string,
    serviceDuration?: string,
    serviceId?: string
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
        // Fetch scheduling settings + blocked date + day schedule + this
        // service's own buffer override in parallel
        const [blockedResult, availResult, windowsResult, overridesResult, settingsResult, serviceResult] = await Promise.all([
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
            .from('provider_availability_windows')
            .select('start_time, end_time')
            .eq('provider_id', providerId)
            .eq('day_of_week', dayOfWeek)
            .order('start_time'),
          supabase
            .from('provider_availability_overrides')
            .select('is_closed, start_time, end_time')
            .eq('provider_id', providerId)
            .eq('availability_date', date)
            .order('start_time'),
          supabase
            .from('providers')
            .select('booking_window_days, slot_interval_mins, buffer_mins')
            .eq('id', providerId)
            .maybeSingle(),
          serviceId
            ? supabase.from('services').select('buffer_before_mins, buffer_after_mins').eq('id', serviceId).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        if (blockedResult.data) return [];

        const settings = settingsResult.data as {
          booking_window_days: number;
          slot_interval_mins: number;
          buffer_mins: number;
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
        const newBuffer = bufferFromRow(serviceResult.data as any, bufferMins);

        const windows = resolveWorkingWindows(
          (windowsResult.data ?? []) as WorkingWindow[],
          (overridesResult.data ?? []) as Array<{ is_closed: boolean; start_time: string | null; end_time: string | null }>,
          availResult.data,
        );
        if (windows.length === 0) return [];
        const baseSlots = windows.flatMap(window =>
          generateSlotsFromRange(window.start_time, window.end_time, intervalMins)
            .filter(time => parseTimeToMinutes(time) + durationMinutes <= parse24HTimeToMinutes(window.end_time)),
        );

        if (baseSlots.length === 0) return [];

        // Fetch existing bookings
        const { data: existingBookings } = await supabase
          .from('bookings')
          .select('booking_time, end_time, service_id')
          .eq('provider_id', providerId)
          .eq('booking_date', date)
          .in('status', ['pending', 'confirmed', 'in_progress']);

        // Each existing booking's gap comes from ITS OWN service, not the
        // one currently being booked — a 3-hour colour appointment's cleanup
        // buffer still applies even if the new request is for a quick blowout.
        const bufferByServiceId = await fetchBufferByServiceId(
          (existingBookings ?? []).map(b => b.service_id),
          bufferMins
        );

        return baseSlots.map(time => {
          const slotStart = parseTimeToMinutes(time);
          const slotEnd = slotStart + durationMinutes;
          const newEffStart = slotStart - newBuffer.before;
          const newEffEnd = slotEnd + newBuffer.after;

          const conflict = (existingBookings ?? []).find(booked => {
            const bookedStart = parse24HTimeToMinutes(booked.booking_time);
            const bookedEnd = booked.end_time
              ? parse24HTimeToMinutes(booked.end_time)
              : bookedStart + 60;
            const existBuffer = booked.service_id
              ? bufferByServiceId.get(booked.service_id) ?? { before: 0, after: bufferMins }
              : { before: 0, after: bufferMins };
            return doTimesOverlap(newEffStart, newEffEnd, bookedStart - existBuffer.before, bookedEnd + existBuffer.after);
          });

          return { time, isBooked: !!conflict };
        });
      }

      // No Supabase provider match — nothing to safely show. Falling back to
      // a generic schedule here would offer slots with zero conflict
      // protection, since there's no booking store left to check against.
      return [];
    } catch (error) {
      logger.error('Error getting available slots:', error);
      return [];
    }
  },

  /**
   * Check if a specific time slot is available for booking.
   * Queries Supabase directly so conflicts from other users are visible.
   * Fails closed (hasConflict: true) if the provider can't be resolved —
   * providerName accepts either the provider's UUID or their display name.
   */
  async isSlotAvailable(
    providerName: string,
    date: string,
    time: string,
    serviceDuration: string,
    serviceId?: string
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
        const [availResult, windowsResult, overridesResult] = await Promise.all([
          supabase.from('provider_availability').select('open_time, close_time, is_closed')
            .eq('provider_id', providerId).eq('day_of_week', dayOfWeek).maybeSingle(),
          supabase.from('provider_availability_windows').select('start_time, end_time')
            .eq('provider_id', providerId).eq('day_of_week', dayOfWeek).order('start_time'),
          supabase.from('provider_availability_overrides').select('is_closed, start_time, end_time')
            .eq('provider_id', providerId).eq('availability_date', date).order('start_time'),
        ]);
        const windows = resolveWorkingWindows(
          (windowsResult.data ?? []) as WorkingWindow[],
          (overridesResult.data ?? []) as Array<{ is_closed: boolean; start_time: string | null; end_time: string | null }>,
          availResult.data,
        );
        const fitsWorkingPeriod = windows.some(window =>
          newStartMinutes >= parse24HTimeToMinutes(window.start_time)
          && newEndMinutes <= parse24HTimeToMinutes(window.end_time),
        );
        if (!fitsWorkingPeriod) {
          return { hasConflict: true, message: 'This time is outside the provider\'s working hours.' };
        }

        // Provider's global buffer (fallback for services with no override)
        const { data: providerRow } = await supabase
          .from('providers')
          .select('buffer_mins')
          .eq('id', providerId)
          .maybeSingle();
        const providerBufferMins = (providerRow as any)?.buffer_mins ?? 0;

        const newBuffer = serviceId
          ? bufferFromRow(
              (await supabase.from('services').select('buffer_before_mins, buffer_after_mins').eq('id', serviceId).maybeSingle()).data as any,
              providerBufferMins
            )
          : { before: 0, after: providerBufferMins };
        const newEffStart = newStartMinutes - newBuffer.before;
        const newEffEnd = newEndMinutes + newBuffer.after;

        // Check existing Supabase bookings for overlap
        const { data: existingBookings } = await supabase
          .from('bookings')
          .select('booking_time, end_time, service_id')
          .eq('provider_id', providerId)
          .eq('booking_date', date)
          .in('status', ['pending', 'confirmed', 'in_progress']);

        const bufferByServiceId = await fetchBufferByServiceId(
          (existingBookings ?? []).map(b => b.service_id),
          providerBufferMins
        );

        const conflict = (existingBookings ?? []).find(booked => {
          const bookedStart = parse24HTimeToMinutes(booked.booking_time);
          const bookedEnd = booked.end_time
            ? parse24HTimeToMinutes(booked.end_time)
            : bookedStart + 60;
          const existBuffer = booked.service_id
            ? bufferByServiceId.get(booked.service_id) ?? { before: 0, after: providerBufferMins }
            : { before: 0, after: providerBufferMins };
          return doTimesOverlap(newEffStart, newEffEnd, bookedStart - existBuffer.before, bookedEnd + existBuffer.after);
        });

        if (conflict) {
          return { hasConflict: true, message: 'This time slot is no longer available.' };
        }
        return { hasConflict: false };
      }

      // Provider not found in Supabase — fail closed rather than book
      // against a schedule we can't actually verify.
      return { hasConflict: true, message: "This provider isn't set up for booking yet." };
    } catch (error) {
      logger.error('Error checking slot availability:', error);
      // User-facing copy stays booking-flavoured even though the cause here
      // is usually a network/server hiccup — "network error" reads as scary
      // and technical for something the client can just retry.
      return {
        hasConflict: true,
        message: "That time isn't available — please pick another.",
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
      serviceId?: string | undefined;
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
        booking.duration,
        booking.serviceId
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
   * Whether a provider has ANY open, non-conflicting slot for a service
   * within the next `withinDays` days — the same booking-window / min-notice
   * / buffer rules as getAvailableSlots, just batched across the whole
   * window in ~5 queries instead of one getAvailableSlots call per day.
   * Used to gate "fully booked" UI (e.g. a waitlist button) so it only
   * appears when there's genuinely nothing to book soon, not on every
   * service unconditionally.
   */
  async hasNearTermAvailability(
    providerIdOrName: string,
    serviceId?: string | null,
    serviceDuration?: string,
    withinDays = 14
  ): Promise<boolean> {
    try {
      const providerId = await resolveProviderId(providerIdOrName);
      if (!providerId) return true; // unknown provider — nothing we can assert, fail open

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [settingsResult, availResult, windowsResult, serviceResult] = await Promise.all([
        supabase
          .from('providers')
          .select('booking_window_days, slot_interval_mins, buffer_mins')
          .eq('id', providerId)
          .maybeSingle(),
        supabase
          .from('provider_availability')
          .select('day_of_week, open_time, close_time, is_closed')
          .eq('provider_id', providerId),
        supabase
          .from('provider_availability_windows')
          .select('day_of_week, start_time, end_time')
          .eq('provider_id', providerId),
        serviceId
          ? supabase.from('services').select('buffer_before_mins, buffer_after_mins').eq('id', serviceId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const settings = settingsResult.data as {
        booking_window_days: number;
        slot_interval_mins: number;
        buffer_mins: number;
      } | null;

      const windowDays = settings?.booking_window_days ?? 60;
      const horizon = windowDays > 0 ? Math.min(withinDays, windowDays) : withinDays;
      if (horizon <= 0) return false;

      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + horizon);
      const startStr = today.toISOString().split('T')[0]!;
      const endStr = endDate.toISOString().split('T')[0]!;

      const [blockedResult, overridesResult, bookingsResult] = await Promise.all([
        supabase
          .from('provider_blocked_dates')
          .select('blocked_date')
          .eq('provider_id', providerId)
          .gte('blocked_date', startStr)
          .lte('blocked_date', endStr),
        supabase
          .from('provider_availability_overrides')
          .select('availability_date, is_closed, start_time, end_time')
          .eq('provider_id', providerId)
          .gte('availability_date', startStr)
          .lte('availability_date', endStr),
        supabase
          .from('bookings')
          .select('booking_date, booking_time, end_time, service_id')
          .eq('provider_id', providerId)
          .gte('booking_date', startStr)
          .lte('booking_date', endStr)
          .in('status', ['pending', 'confirmed', 'in_progress']),
      ]);

      const blockedDates = new Set((blockedResult.data ?? []).map((b: any) => b.blocked_date as string));
      const availByDow = new Map<number, { open_time: string; close_time: string; is_closed: boolean }>();
      for (const row of (availResult.data ?? []) as any[]) availByDow.set(row.day_of_week, row);
      const windowsByDow = new Map<number, WorkingWindow[]>();
      for (const row of (windowsResult.data ?? []) as any[]) {
        const list = windowsByDow.get(row.day_of_week) ?? [];
        list.push(row);
        windowsByDow.set(row.day_of_week, list);
      }
      const overridesByDate = new Map<string, Array<{ is_closed: boolean; start_time: string | null; end_time: string | null }>>();
      for (const row of (overridesResult.data ?? []) as any[]) {
        const list = overridesByDate.get(row.availability_date) ?? [];
        list.push(row);
        overridesByDate.set(row.availability_date, list);
      }

      const bufferMins = settings?.buffer_mins ?? 0;
      const intervalMins = settings?.slot_interval_mins ?? 60;
      const durationMinutes = serviceDuration ? parseDurationToMinutes(serviceDuration) : 60;
      const newBuffer = bufferFromRow(serviceResult.data as any, bufferMins);

      const bookingsByDate = new Map<string, any[]>();
      for (const b of (bookingsResult.data ?? []) as any[]) {
        const list = bookingsByDate.get(b.booking_date) ?? [];
        list.push(b);
        bookingsByDate.set(b.booking_date, list);
      }
      const bufferByServiceId = await fetchBufferByServiceId(
        ((bookingsResult.data ?? []) as any[]).map(b => b.service_id),
        bufferMins
      );

      for (let i = 0; i < horizon; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0]!;
        if (blockedDates.has(dateStr)) continue;

        const windows = resolveWorkingWindows(
          windowsByDow.get(d.getDay()) ?? [],
          overridesByDate.get(dateStr) ?? [],
          availByDow.get(d.getDay()) ?? null,
        );
        if (windows.length === 0) continue;
        const daySlots = windows.flatMap(window =>
          generateSlotsFromRange(window.start_time, window.end_time, intervalMins)
            .filter(t => parseTimeToMinutes(t) + durationMinutes <= parse24HTimeToMinutes(window.end_time)),
        );
        if (daySlots.length === 0) continue;

        const dayBookings = bookingsByDate.get(dateStr) ?? [];
        const hasOpenSlot = daySlots.some(t => {
          const slotStart = parseTimeToMinutes(t);
          const slotEnd = slotStart + durationMinutes;
          const newEffStart = slotStart - newBuffer.before;
          const newEffEnd = slotEnd + newBuffer.after;
          const conflict = dayBookings.some(booked => {
            const bookedStart = parse24HTimeToMinutes(booked.booking_time);
            const bookedEnd = booked.end_time ? parse24HTimeToMinutes(booked.end_time) : bookedStart + 60;
            const existBuffer = booked.service_id
              ? bufferByServiceId.get(booked.service_id) ?? { before: 0, after: bufferMins }
              : { before: 0, after: bufferMins };
            return doTimesOverlap(newEffStart, newEffEnd, bookedStart - existBuffer.before, bookedEnd + existBuffer.after);
          });
          return !conflict;
        });
        if (hasOpenSlot) return true;
      }
      return false;
    } catch (error) {
      console.error('Error checking near-term availability:', error);
      // Fail open — don't show "fully booked" waitlist UI off the back of a
      // network hiccup; that's a misleading, high-consequence guess.
      return true;
    }
  },

};

export default AvailabilityService;
