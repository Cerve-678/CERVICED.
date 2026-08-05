// src/services/AvailabilityService.ts
// Manages provider availability and prevents double-booking

import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../utils/storageKeys';
const BOOKINGS_STORAGE_KEY = STORAGE_KEYS.BOOKINGS_STORE_LEGACY;
import { logger } from '../utils/logger';
import { formatTime12 } from '../utils/dateUtils';

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

// Minutes-since-midnight -> "09:00am", the display format every slot/time
// string in this file already uses (see parseTimeToMinutes for the inverse).
const formatMinutesTo12h = (mins: number): string => {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return formatTime12(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
};

// Generate time slots between open_time and close_time at a configurable interval
const generateSlotsFromRange = (openTime: string, closeTime: string, intervalMins = 60): string[] => {
  const openMins = parse24HTimeToMinutes(openTime);
  const closeMins = parse24HTimeToMinutes(closeTime);
  const step = [15, 30, 60].includes(intervalMins) ? intervalMins : 60;
  const slots: string[] = [];
  for (let mins = openMins; mins < closeMins; mins += step) {
    slots.push(formatMinutesTo12h(mins));
  }
  return slots;
};

// Local YYYY-MM-DD — date.toISOString() converts to UTC first, which shifts
// the calendar date by one for any non-zero UTC offset near midnight (e.g.
// UK BST is UTC+1, so local midnight is still "yesterday" in UTC). That
// wrong date then misses the actual day's bookings/overrides/blocked-date
// rows, which are keyed by local calendar date.
const toLocalDateStr = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

/**
 * Re-checks the two time-relative rules a slot can fail purely because the
 * clock moved: it's now in the past, or it has fallen inside the provider's
 * minimum-notice window.
 *
 * getAvailableSlots() applies both when generating the picker, but only at
 * selection time — a cart item sat on overnight can name a slot that was
 * valid when picked. Without re-checking at checkout it sails through and is
 * only rejected by the enforce_booking_bookability trigger mid-hold, with no
 * way for the client to tell which appointment was at fault.
 *
 * Returns a BookingConflict to surface, or null when the slot is still fine.
 */
const checkNoticeWindow = async (
  providerId: string,
  date: string,
  time: string,
): Promise<BookingConflict | null> => {
  // Same construction as the slot generators above: midnight on the date,
  // then offset by the slot's minutes-from-midnight. Parsing "HH:MM AM/PM"
  // into a Date directly isn't reliable across platforms.
  const slotStart = new Date(date + 'T00:00:00');
  if (Number.isNaN(slotStart.getTime())) return null;
  slotStart.setMinutes(parseTimeToMinutes(time));

  if (slotStart.getTime() < Date.now()) {
    return {
      hasConflict: true,
      message: 'That time has already passed — please pick a new slot.',
    };
  }

  const { data, error } = await supabase
    .from('providers')
    .select('min_booking_notice_hrs')
    .eq('id', providerId)
    .maybeSingle();

  // Fails open by design — the server-side enforce_booking_bookability
  // trigger is the real gate, and blocking checkout on a transient read
  // would be worse than letting the trigger reject it. But log it: a
  // persistent failure here silently disables every provider's notice window
  // at the point where the client could still be given a clear message.
  if (error) {
    logger.error('checkNoticeWindow: provider lookup failed', error);
    return null;
  }

  const noticeHrs =
    (data as { min_booking_notice_hrs: number } | null)?.min_booking_notice_hrs ?? 0;
  if (noticeHrs <= 0) return null;

  if (slotStart.getTime() < Date.now() + noticeHrs * 60 * 60 * 1000) {
    return {
      hasConflict: true,
      message: `This provider needs at least ${noticeHrs}h notice — please pick a later slot.`,
    };
  }
  return null;
};

export type BackToBackSlot = { serviceId: string; time: string; endTime: string };

// Try to fit an ORDERED list of services back-to-back for one provider on
// one day — each service scheduled immediately after the previous one
// (respecting each service's own buffer, same rule as everywhere else in
// this file), so a client booking several services with the same provider
// doesn't have to individually pick non-conflicting times and hope they
// work. Returns null if the whole chain doesn't fit anywhere in the day's
// working hours without clashing with an existing booking.
// When `collectAll` is set it instead returns EVERY start time the chain fits
// at (for a picker), rather than returning at the first one.
async function findBackToBackSlotsForDate(
  providerId: string,
  services: Array<{ serviceId: string; duration?: string }>,
  date: string,
  collectAll?: false,
): Promise<BackToBackSlot[] | null>;
async function findBackToBackSlotsForDate(
  providerId: string,
  services: Array<{ serviceId: string; duration?: string }>,
  date: string,
  collectAll: true,
): Promise<BackToBackSlot[][] | null>;
async function findBackToBackSlotsForDate(
  providerId: string,
  services: Array<{ serviceId: string; duration?: string }>,
  date: string,
  collectAll = false,
): Promise<BackToBackSlot[] | BackToBackSlot[][] | null> {
  const allSchedules: BackToBackSlot[][] = [];
  const dateObj = new Date(date + 'T12:00:00');
  const dayOfWeek = dateObj.getDay();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (dateObj < today) return null;

  const [blockedResult, availResult, windowsResult, overridesResult, settingsResult] = await Promise.all([
    supabase.from('provider_blocked_dates').select('id').eq('provider_id', providerId).eq('blocked_date', date).maybeSingle(),
    supabase.from('provider_availability').select('open_time, close_time, is_closed').eq('provider_id', providerId).eq('day_of_week', dayOfWeek).maybeSingle(),
    supabase.from('provider_availability_windows').select('start_time, end_time').eq('provider_id', providerId).eq('day_of_week', dayOfWeek).order('start_time'),
    supabase.from('provider_availability_overrides').select('is_closed, start_time, end_time').eq('provider_id', providerId).eq('availability_date', date).order('start_time'),
    supabase.from('providers').select('booking_window_days, slot_interval_mins, buffer_mins').eq('id', providerId).maybeSingle(),
  ]);
  if (blockedResult.data) return null;

  const settings = settingsResult.data as {
    booking_window_days: number;
    slot_interval_mins: number;
    buffer_mins: number;
  } | null;

  const windowDays = settings?.booking_window_days ?? 60;
  if (windowDays > 0) {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + windowDays);
    maxDate.setHours(23, 59, 59, 999);
    if (dateObj > maxDate) return null;
  }

  const intervalMins = settings?.slot_interval_mins ?? 60;
  const bufferMins = settings?.buffer_mins ?? 0;

  const windows = resolveWorkingWindows(
    (windowsResult.data ?? []) as WorkingWindow[],
    (overridesResult.data ?? []) as Array<{ is_closed: boolean; start_time: string | null; end_time: string | null }>,
    availResult.data,
  );
  if (windows.length === 0) return null;

  const { data: existingBookings } = await supabase
    .from('bookings')
    .select('booking_time, end_time, service_id')
    .eq('provider_id', providerId)
    .eq('booking_date', date)
    .in('status', ['pending', 'confirmed', 'in_progress', 'on_hold']);

  const bufferByServiceId = await fetchBufferByServiceId(
    [...services.map(s => s.serviceId), ...((existingBookings ?? []).map(b => b.service_id))],
    bufferMins
  );

  const chainDurations = services.map(s => (s.duration ? parseDurationToMinutes(s.duration) : 60));
  const chainBuffers = services.map(s => bufferByServiceId.get(s.serviceId) ?? { before: 0, after: bufferMins });

  for (const window of windows) {
    const windowEnd = parse24HTimeToMinutes(window.end_time);
    const candidateStarts = generateSlotsFromRange(window.start_time, window.end_time, intervalMins)
      .map(t => parseTimeToMinutes(t));

    for (const start0 of candidateStarts) {
      const chain: Array<{ start: number; end: number }> = [];
      let cursor = start0;
      let fits = true;
      for (let i = 0; i < services.length; i++) {
        const start = i === 0 ? cursor : cursor + chainBuffers[i - 1]!.after + chainBuffers[i]!.before;
        const end = start + chainDurations[i]!;
        if (end > windowEnd) { fits = false; break; }
        chain.push({ start, end });
        cursor = end;
      }
      if (!fits) continue;

      // The whole chain (buffer-padded at both ends) is treated as one solid
      // busy block — the provider is occupied for the gaps between chained
      // services too (cleanup/travel), so another client's booking can't
      // land in those gaps any more than it could inside a single service.
      const envelopeStart = chain[0]!.start - chainBuffers[0]!.before;
      const envelopeEnd = chain[chain.length - 1]!.end + chainBuffers[chainBuffers.length - 1]!.after;

      const conflict = (existingBookings ?? []).some(booked => {
        const bookedStart = parse24HTimeToMinutes(booked.booking_time);
        const bookedEnd = booked.end_time ? parse24HTimeToMinutes(booked.end_time) : bookedStart + 60;
        const existBuffer = booked.service_id
          ? bufferByServiceId.get(booked.service_id) ?? { before: 0, after: bufferMins }
          : { before: 0, after: bufferMins };
        return doTimesOverlap(envelopeStart, envelopeEnd, bookedStart - existBuffer.before, bookedEnd + existBuffer.after);
      });
      if (conflict) continue;

      const schedule = services.map((s, i) => ({
        serviceId: s.serviceId,
        time: formatMinutesTo12h(chain[i]!.start),
        endTime: formatMinutesTo12h(chain[i]!.end),
      }));
      if (!collectAll) return schedule;
      allSchedules.push(schedule);
    }
  }
  return collectAll ? (allSchedules.length > 0 ? allSchedules : null) : null;
}

/**
 * Every start time on `date` where the whole ordered chain fits, not just the
 * earliest one. Powers the cart's "reschedule this group to a new day" picker,
 * where the client chooses the start time rather than being handed the first
 * slot that happens to work. Returns null if nothing fits that day.
 */
const findAllBackToBackSlotsForDate = async (
  providerId: string,
  services: Array<{ serviceId: string; duration?: string }>,
  date: string,
): Promise<BackToBackSlot[][] | null> =>
  findBackToBackSlotsForDate(providerId, services, date, true) as Promise<BackToBackSlot[][] | null>;

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
  },

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
            .select('booking_window_days, slot_interval_mins, buffer_mins, min_booking_notice_hrs')
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
        const newBuffer = bufferFromRow(serviceResult.data as any, bufferMins);

        // Enforce minimum notice — a slot starting sooner than this from now
        // isn't offered at all (matches the server-side enforce_booking_bookability
        // trigger, so the calendar never shows a time the DB will then reject).
        const noticeHrs = settings?.min_booking_notice_hrs ?? 0;
        const noticeCutoff = noticeHrs > 0 ? Date.now() + noticeHrs * 60 * 60 * 1000 : null;

        const windows = resolveWorkingWindows(
          (windowsResult.data ?? []) as WorkingWindow[],
          (overridesResult.data ?? []) as Array<{ is_closed: boolean; start_time: string | null; end_time: string | null }>,
          availResult.data,
        );
        if (windows.length === 0) return [];
        const baseSlots = windows.flatMap(window =>
          generateSlotsFromRange(window.start_time, window.end_time, intervalMins)
            .filter(time => parseTimeToMinutes(time) + durationMinutes <= parse24HTimeToMinutes(window.end_time))
            .filter(time => {
              if (noticeCutoff === null) return true;
              const slotStart = new Date(date + 'T00:00:00');
              slotStart.setMinutes(parseTimeToMinutes(time));
              return slotStart.getTime() >= noticeCutoff;
            }),
        );

        if (baseSlots.length === 0) return [];

        // Fetch existing bookings
        const { data: existingBookings } = await supabase
          .from('bookings')
          .select('booking_time, end_time, service_id')
          .eq('provider_id', providerId)
          .eq('booking_date', date)
          .in('status', ['pending', 'confirmed', 'in_progress', 'on_hold']);

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

        // A slot that was valid when it was picked goes stale as the clock
        // moves — a cart item sat on overnight can name a time that's since
        // passed, or fallen inside the provider's minimum-notice window.
        // getAvailableSlots() applies these same two rules when generating
        // the picker, but only at selection time; without re-checking here a
        // stale item sails through checkout and is only rejected by the
        // enforce_booking_bookability trigger, mid-hold, with no way for the
        // client to tell which appointment was at fault.
        const noticeConflict = await checkNoticeWindow(providerId, date, time);
        if (noticeConflict) return noticeConflict;

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
          .in('status', ['pending', 'confirmed', 'in_progress', 'on_hold']);

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
   * Whether a provider has ANY open, non-conflicting slot within the next
   * `withinDays` days, for each of several services at once — the same
   * booking-window / min-notice / buffer rules as getAvailableSlots. The
   * provider-level settings/availability/windows/blocked-dates/overrides/
   * bookings are each fetched once regardless of how many services are
   * asked about, instead of once per service, since none of that depends on
   * which service is being checked. Used to gate "fully booked" UI (e.g. a
   * waitlist button) so it only appears when there's genuinely nothing to
   * book soon, not on every service unconditionally.
   *
   * `secondaryWithinDays`, when passed, adds a second (smaller) horizon
   * answered from the SAME provider-data fetch and day-by-day scan as
   * `withinDays` — for a caller (ProviderProfileScreen) that used to call
   * this function twice back-to-back with different horizons, duplicating
   * ~6 Supabase queries and the whole per-service/per-day scan. Returned as
   * `result.secondary`, `undefined` when the param is omitted.
   */
  async hasNearTermAvailabilityForServices(
    providerIdOrName: string,
    services: Array<{ serviceId: string; duration?: string }>,
    withinDays = 14,
    secondaryWithinDays?: number
  ): Promise<Map<string, boolean> & { secondary?: Map<string, boolean> }> {
    // Fail open — don't show "fully booked" waitlist UI off the back of a
    // network hiccup or an unknown provider; that's a misleading,
    // high-consequence guess.
    const failOpen: Map<string, boolean> & { secondary?: Map<string, boolean> } = new Map<string, boolean>();
    for (const s of services) failOpen.set(s.serviceId, true);
    if (secondaryWithinDays !== undefined) failOpen.secondary = new Map(failOpen);
    if (services.length === 0) return failOpen;

    try {
      const providerId = await resolveProviderId(providerIdOrName);
      if (!providerId) return failOpen;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [settingsResult, availResult, windowsResult] = await Promise.all([
        supabase
          .from('providers')
          .select('booking_window_days, slot_interval_mins, buffer_mins, min_booking_notice_hrs')
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
      ]);

      const settings = settingsResult.data as {
        booking_window_days: number;
        slot_interval_mins: number;
        buffer_mins: number;
        min_booking_notice_hrs: number;
      } | null;
      const noticeHrs = settings?.min_booking_notice_hrs ?? 0;
      const noticeCutoff = noticeHrs > 0 ? Date.now() + noticeHrs * 60 * 60 * 1000 : null;

      const windowDays = settings?.booking_window_days ?? 60;
      // Scan out to whichever requested horizon is larger — one fetch/scan
      // covers both answers, since the smaller horizon's answer is just
      // "did an open slot turn up within its own, shorter day range."
      const requestedMax = secondaryWithinDays !== undefined
        ? Math.max(withinDays, secondaryWithinDays)
        : withinDays;
      const horizon = windowDays > 0 ? Math.min(requestedMax, windowDays) : requestedMax;
      const secondaryHorizon = secondaryWithinDays !== undefined
        ? (windowDays > 0 ? Math.min(secondaryWithinDays, windowDays) : secondaryWithinDays)
        : undefined;
      if (horizon <= 0) {
        const map: Map<string, boolean> & { secondary?: Map<string, boolean> } = new Map<string, boolean>();
        for (const s of services) map.set(s.serviceId, false);
        if (secondaryHorizon !== undefined) map.secondary = new Map(map);
        return map;
      }

      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + horizon);
      const startStr = toLocalDateStr(today);
      const endStr = toLocalDateStr(endDate);

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
          .in('status', ['pending', 'confirmed', 'in_progress', 'on_hold']),
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

      const bookingsByDate = new Map<string, any[]>();
      for (const b of (bookingsResult.data ?? []) as any[]) {
        const list = bookingsByDate.get(b.booking_date) ?? [];
        list.push(b);
        bookingsByDate.set(b.booking_date, list);
      }

      // One batched lookup covers buffer overrides for both the requested
      // services and every service referenced by an existing booking in the
      // window — a single query instead of one per service.
      const bufferByServiceId = await fetchBufferByServiceId(
        [
          ...services.map(s => s.serviceId),
          ...((bookingsResult.data ?? []) as any[]).map(b => b.service_id),
        ],
        bufferMins
      );

      const result: Map<string, boolean> & { secondary?: Map<string, boolean> } = new Map<string, boolean>();
      const secondaryResult = secondaryHorizon !== undefined ? new Map<string, boolean>() : undefined;
      for (const service of services) {
        const durationMinutes = service.duration ? parseDurationToMinutes(service.duration) : 60;
        const newBuffer = bufferByServiceId.get(service.serviceId) ?? { before: 0, after: bufferMins };

        let hasAvailability = false;
        let hasSecondaryAvailability = false;
        for (let i = 0; i < horizon; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() + i);
          const dateStr = toLocalDateStr(d);
          if (blockedDates.has(dateStr)) continue;

          const windows = resolveWorkingWindows(
            windowsByDow.get(d.getDay()) ?? [],
            overridesByDate.get(dateStr) ?? [],
            availByDow.get(d.getDay()) ?? null,
          );
          if (windows.length === 0) continue;
          const daySlots = windows.flatMap(window =>
            generateSlotsFromRange(window.start_time, window.end_time, intervalMins)
              .filter(t => parseTimeToMinutes(t) + durationMinutes <= parse24HTimeToMinutes(window.end_time))
              .filter(t => {
                if (noticeCutoff === null) return true;
                const slotStart = new Date(dateStr + 'T00:00:00');
                slotStart.setMinutes(parseTimeToMinutes(t));
                return slotStart.getTime() >= noticeCutoff;
              }),
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
          if (hasOpenSlot) {
            // Days are scanned in ascending order, so the first hit is
            // necessarily the earliest open slot — safe to derive the
            // secondary (smaller-horizon) answer from it and stop here.
            hasAvailability = true;
            if (secondaryHorizon !== undefined && i < secondaryHorizon) hasSecondaryAvailability = true;
            break;
          }
        }
        result.set(service.serviceId, hasAvailability);
        secondaryResult?.set(service.serviceId, hasSecondaryAvailability);
      }
      if (secondaryResult) result.secondary = secondaryResult;
      return result;
    } catch (error) {
      console.error('Error checking near-term availability:', error);
      return failOpen;
    }
  },

  /**
   * Earliest date (YYYY-MM-DD) with at least one open, non-conflicting slot
   * within the provider's booking window (capped at `searchDays`), or null if
   * nothing opens up in that horizon. Same one-batched-fetch shape as
   * hasNearTermAvailabilityForServices, so a calendar that wants to jump
   * straight to the next open day isn't paying for a query per day it has
   * to look through — used to skip a client past a stretch of fully-booked
   * days instead of making them page forward manually.
   */
  async findNextAvailableDate(
    providerIdOrName: string,
    serviceDuration?: string,
    serviceId?: string,
    searchDays = 60
  ): Promise<string | null> {
    try {
      const providerId = await resolveProviderId(providerIdOrName);
      if (!providerId) return null;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [settingsResult, availResult, windowsResult] = await Promise.all([
        supabase
          .from('providers')
          .select('booking_window_days, slot_interval_mins, buffer_mins, min_booking_notice_hrs')
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
      ]);

      const settings = settingsResult.data as {
        booking_window_days: number;
        slot_interval_mins: number;
        buffer_mins: number;
        min_booking_notice_hrs: number;
      } | null;
      const noticeHrs = settings?.min_booking_notice_hrs ?? 0;
      const noticeCutoff = noticeHrs > 0 ? Date.now() + noticeHrs * 60 * 60 * 1000 : null;

      const windowDays = settings?.booking_window_days ?? 60;
      const horizon = windowDays > 0 ? Math.min(searchDays, windowDays) : searchDays;
      if (horizon <= 0) return null;

      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + horizon);
      const startStr = toLocalDateStr(today);
      const endStr = toLocalDateStr(endDate);

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
          .in('status', ['pending', 'confirmed', 'in_progress', 'on_hold']),
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
      const bookingsByDate = new Map<string, any[]>();
      for (const b of (bookingsResult.data ?? []) as any[]) {
        const list = bookingsByDate.get(b.booking_date) ?? [];
        list.push(b);
        bookingsByDate.set(b.booking_date, list);
      }

      const bufferMins = settings?.buffer_mins ?? 0;
      const intervalMins = settings?.slot_interval_mins ?? 60;
      const durationMinutes = serviceDuration ? parseDurationToMinutes(serviceDuration) : 60;

      const bufferByServiceId = await fetchBufferByServiceId(
        [
          ...(serviceId ? [serviceId] : []),
          ...((bookingsResult.data ?? []) as any[]).map(b => b.service_id),
        ],
        bufferMins
      );
      const newBuffer = serviceId
        ? bufferByServiceId.get(serviceId) ?? { before: 0, after: bufferMins }
        : { before: 0, after: bufferMins };

      for (let i = 0; i < horizon; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        const dateStr = toLocalDateStr(d);
        if (blockedDates.has(dateStr)) continue;

        const windows = resolveWorkingWindows(
          windowsByDow.get(d.getDay()) ?? [],
          overridesByDate.get(dateStr) ?? [],
          availByDow.get(d.getDay()) ?? null,
        );
        if (windows.length === 0) continue;

        const daySlots = windows.flatMap(window =>
          generateSlotsFromRange(window.start_time, window.end_time, intervalMins)
            .filter(t => parseTimeToMinutes(t) + durationMinutes <= parse24HTimeToMinutes(window.end_time))
            .filter(t => {
              if (noticeCutoff === null) return true;
              const slotStart = new Date(dateStr + 'T00:00:00');
              slotStart.setMinutes(parseTimeToMinutes(t));
              return slotStart.getTime() >= noticeCutoff;
            }),
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
        if (hasOpenSlot) return dateStr;
      }
      return null;
    } catch (error) {
      logger.error('Error finding next available date:', error);
      return null;
    }
  },

  /**
   * Earliest bookable (date, time) pair — used by the "Next Available"
   * one-tap shortcut on the provider profile. Composes findNextAvailableDate
   * (fast, batched) with getAvailableSlots (the per-day source of truth
   * CartScreen's calendar already trusts) rather than trusting either alone:
   * findNextAvailableDate jumps close to the right day, then getAvailableSlots
   * confirms an actual open time on it. If that exact day turns out empty
   * (rare edge-case drift between the two checks), a few subsequent days are
   * tried directly before giving up. Returns null rather than throwing when
   * nothing opens up — callers should fall back gracefully, not treat "no
   * availability" as an error.
   */
  async resolveNextAvailableSlot(
    providerIdOrName: string,
    serviceDuration?: string,
    serviceId?: string,
    searchDays = 60
  ): Promise<{ date: string; time: string } | null> {
    try {
      const firstDate = await this.findNextAvailableDate(providerIdOrName, serviceDuration, serviceId, searchDays);
      if (!firstDate) return null;

      const candidateDates = [firstDate];
      const cursor = new Date(firstDate + 'T00:00:00');
      for (let i = 0; i < 3; i++) {
        cursor.setDate(cursor.getDate() + 1);
        candidateDates.push(toLocalDateStr(cursor));
      }

      for (const date of candidateDates) {
        const slots = await this.getAvailableSlots(providerIdOrName, date, serviceDuration, serviceId);
        const openSlot = slots.find(s => !s.isBooked);
        if (openSlot) return { date, time: openSlot.time };
      }
      return null;
    } catch (error) {
      logger.error('Error resolving next available slot:', error);
      return null;
    }
  },

  /**
   * Try to schedule multiple services with the SAME provider back-to-back
   * on ONE specific day, instead of the client picking a time for each
   * service individually and hoping they don't clash. Order of `services`
   * is the order they'll be scheduled in. Returns null if the whole chain
   * doesn't fit anywhere in that day's working hours.
   */
  async findBackToBackSlots(
    providerIdOrName: string,
    services: Array<{ serviceId: string; duration?: string }>,
    date: string,
  ): Promise<BackToBackSlot[] | null> {
    if (services.length === 0) return null;
    try {
      const providerId = await resolveProviderId(providerIdOrName);
      if (!providerId) return null;
      return await findBackToBackSlotsForDate(providerId, services, date);
    } catch (error) {
      logger.error('Error finding back-to-back slots:', error);
      return null;
    }
  },

  /**
   * Same as findBackToBackSlots but returns EVERY start time the chain fits
   * at that day, so a picker can offer real choices instead of committing the
   * client to the earliest one. Ordered earliest-first.
   */
  async findAllBackToBackSlots(
    providerIdOrName: string,
    services: Array<{ serviceId: string; duration?: string }>,
    date: string,
  ): Promise<BackToBackSlot[][] | null> {
    if (services.length === 0) return null;
    try {
      const providerId = await resolveProviderId(providerIdOrName);
      if (!providerId) return null;
      return await findAllBackToBackSlotsForDate(providerId, services, date);
    } catch (error) {
      logger.error('Error finding all back-to-back slots:', error);
      return null;
    }
  },

  /**
   * Same as findBackToBackSlots but walks forward from today looking for
   * the FIRST day the whole chain fits, up to `withinDays` (bounded by the
   * provider's own booking_window_days, same horizon rule as
   * hasNearTermAvailabilityForServices). Powers a "schedule these together"
   * action from the cart: a client shouldn't have to guess which day even
   * has room for every service before finding out slot-by-slot that the
   * times they picked don't fit.
   */
  async findNextBackToBackDay(
    providerIdOrName: string,
    services: Array<{ serviceId: string; duration?: string }>,
    withinDays = 14,
  ): Promise<{ date: string; schedule: BackToBackSlot[] } | null> {
    if (services.length === 0) return null;
    try {
      const providerId = await resolveProviderId(providerIdOrName);
      if (!providerId) return null;

      const { data: settingsRow } = await supabase
        .from('providers')
        .select('booking_window_days')
        .eq('id', providerId)
        .maybeSingle();
      const windowDays = (settingsRow as { booking_window_days: number } | null)?.booking_window_days ?? 60;
      const horizon = windowDays > 0 ? Math.min(withinDays, windowDays) : withinDays;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      for (let i = 0; i < horizon; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        const dateStr = toLocalDateStr(d);
        const schedule = await findBackToBackSlotsForDate(providerId, services, dateStr);
        if (schedule) return { date: dateStr, schedule };
      }
      return null;
    } catch (error) {
      logger.error('Error finding next back-to-back day:', error);
      return null;
    }
  },

};

export default AvailabilityService;
