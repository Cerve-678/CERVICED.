// src/services/AvailabilityService.ts
// Manages provider availability and prevents double-booking

import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';
import { formatTime12, formatShortDate } from '../utils/dateUtils';
import { getProviderBusySpans } from './databaseService';

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

/** Per-day state for the 7-day availability strip. */
export type AvailabilityDayState = 'open' | 'closed' | 'blocked' | 'full';

/**
 * Today's headline state. Mirrors AvailabilityDayState plus `unpublished`,
 * which has no per-day equivalent: it describes the provider as a whole
 * having no schedule at all rather than any one day being shut.
 */
export type AvailabilityState = AvailabilityDayState | 'unpublished';

export interface AvailabilityDay {
  date: string;      // 'YYYY-MM-DD'
  dayOfWeek: number; // 0=Sun
  label: string;     // single-letter strip label
  state: AvailabilityDayState;
  /** Last closing time that day, already 12h-formatted; null when not open. */
  closesAt: string | null;
}

export interface AvailabilitySummary {
  state: AvailabilityState;
  /** Primary line, e.g. "Open today until 6pm". */
  headline: string;
  /** Secondary line, e.g. "Next free Thu 2pm"; null when nothing to add. */
  detail: string | null;
  /** Seven days starting today; empty when the provider has no schedule. */
  days: AvailabilityDay[];
  nextFree: { date: string; time: string } | null;
}

/** One row of a provider's recurring weekly opening-hours listing. */
export interface WeeklyOpeningHoursDay {
  dayOfWeek: number; // 0=Sun..6=Sat
  label: string;      // full day name, e.g. "Monday"
  isOpen: boolean;
  /** 12h-formatted overall span, e.g. "9:00am - 6:00pm"; null when closed.
   *  A day with a split shift (e.g. a lunch break) collapses to its earliest
   *  start and latest end — this is an opening-hours listing, not a booking
   *  picker, so the gap in between isn't shown as a "break". */
  hours: string | null;
}

interface LegacyAvailabilityRow {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
}

interface AvailabilityWindowRow {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface WeeklyScheduleRows {
  legacyRows: LegacyAvailabilityRow[];
  windowRows: AvailabilityWindowRow[];
}

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
// Sun-indexed full names + Mon→Sun reading order — same convention as
// ProviderScheduleScreen's DAY_FULL/DISPLAY_ORDER, kept in sync deliberately
// so the client-facing weekly listing and the provider's own editor agree.
const DAY_FULL_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const weeklyScheduleRequests = new Map<string, Promise<WeeklyScheduleRows>>();

const fetchWeeklyScheduleRows = async (
  providerId: string,
): Promise<WeeklyScheduleRows> => {
  const inFlight = weeklyScheduleRequests.get(providerId);
  if (inFlight) return inFlight;

  const request = (async (): Promise<WeeklyScheduleRows> => {
    const [windowsResult, legacyResult] = await Promise.all([
      supabase
        .from('provider_availability_windows')
        .select('day_of_week, start_time, end_time')
        .eq('provider_id', providerId)
        .order('start_time'),
      supabase
        .from('provider_availability')
        .select('day_of_week, open_time, close_time, is_closed')
        .eq('provider_id', providerId),
    ]);
    if (windowsResult.error) throw windowsResult.error;
    if (legacyResult.error) throw legacyResult.error;

    const rows: WeeklyScheduleRows = {
      windowRows: (windowsResult.data ?? []) as AvailabilityWindowRow[],
      legacyRows: (legacyResult.data ?? []) as LegacyAvailabilityRow[],
    };
    return rows;
  })();

  weeklyScheduleRequests.set(providerId, request);
  try {
    return await request;
  } finally {
    if (weeklyScheduleRequests.get(providerId) === request) {
      weeklyScheduleRequests.delete(providerId);
    }
  }
};

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
// Sums EVERY component, not just the first: formatDuration() emits "1h 30min"
// for 90 minutes, and a first-match-only parse read that as 60 — silently
// dropping the minutes off every compound duration, so chained services were
// scheduled a flat hour apart regardless of how long they actually take.
export const parseDurationToMinutes = (duration: string): number => {
  const matches = [...duration.matchAll(/(\d+(?:\.\d+)?)\s*(hours|hour|hrs|hr|h|minutes|minute|mins|min|m)/gi)];
  if (matches.length === 0) return 60; // Default 1 hour

  const total = matches.reduce((sum, match) => {
    const amount = parseFloat(match[1] || '1');
    if (Number.isNaN(amount)) return sum;
    const unit = (match[2] || 'h').toLowerCase();
    return sum + (unit.startsWith('h') ? amount * 60 : amount);
  }, 0);

  return total > 0 ? Math.round(total) : 60;
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

const buildWeeklyOpeningHours = ({
  windowRows,
  legacyRows,
}: WeeklyScheduleRows): WeeklyOpeningHoursDay[] | null => {
  if (windowRows.length === 0 && legacyRows.length === 0) return null;

  const windowsByDow = new Map<number, AvailabilityWindowRow[]>();
  for (const row of windowRows) {
    const list = windowsByDow.get(row.day_of_week) ?? [];
    list.push(row);
    windowsByDow.set(row.day_of_week, list);
  }
  const legacyByDow = new Map<number, LegacyAvailabilityRow>();
  for (const row of legacyRows) legacyByDow.set(row.day_of_week, row);

  return WEEK_DISPLAY_ORDER.map((dow) => {
    const windows = windowsByDow.get(dow);
    if (windows && windows.length > 0) {
      const earliest = windows.reduce((left, right) =>
        parse24HTimeToMinutes(left.start_time) <= parse24HTimeToMinutes(right.start_time)
          ? left
          : right,
      );
      const latest = windows.reduce((left, right) =>
        parse24HTimeToMinutes(left.end_time) >= parse24HTimeToMinutes(right.end_time)
          ? left
          : right,
      );
      return {
        dayOfWeek: dow,
        label: DAY_FULL_NAMES[dow] ?? '',
        isOpen: true,
        hours: `${formatTime12(earliest.start_time)} - ${formatTime12(latest.end_time)}`,
      };
    }
    const legacy = legacyByDow.get(dow);
    if (legacy && !legacy.is_closed) {
      return {
        dayOfWeek: dow,
        label: DAY_FULL_NAMES[dow] ?? '',
        isOpen: true,
        hours: `${formatTime12(legacy.open_time)} - ${formatTime12(legacy.close_time)}`,
      };
    }
    return {
      dayOfWeek: dow,
      label: DAY_FULL_NAMES[dow] ?? '',
      isOpen: false,
      hours: null,
    };
  });
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

/** A taken interval, in minutes since midnight, already buffer-padded. */
type BusySpan = { date: string; start: number; end: number };

/**
 * Every taken interval for a provider across a date range, buffer-padding
 * included.
 *
 * Goes through the get_provider_busy_spans RPC rather than reading `bookings`
 * directly. RLS grants SELECT on `bookings` only to the booking's own client
 * and to the owning provider, so a direct read from a client session browsing
 * someone else's provider returns ZERO rows — silently identical to "nothing
 * is booked". That is what made the slot picker offer already-taken slots as
 * free until checkout rejected them. The RPC is SECURITY DEFINER and returns
 * only date/start/end — no booking id, client or service.
 *
 * The spans are pre-padded from each booking's own stored
 * effective_start/effective_end, so callers must NOT re-apply a per-service
 * buffer on top; doing so would double-count the gap.
 *
 * Throws if the RPC is missing (i.e. provider_busy_spans_rpc.sql hasn't been
 * deployed) — callers decide whether to degrade. Failing loudly is deliberate:
 * silently treating an error as "no bookings" is exactly the bug being fixed.
 */
const fetchBusySpans = async (
  providerId: string,
  fromDate: string,
  toDate: string,
): Promise<BusySpan[]> => {
  const rows = await getProviderBusySpans(providerId, fromDate, toDate);
  return rows.map(r => ({
    date: r.booking_date,
    start: parse24HTimeToMinutes(r.busy_start),
    end: parse24HTimeToMinutes(r.busy_end),
  }));
};

/** Group busy spans by their date, for the multi-day callers. */
const groupBusyByDate = (spans: BusySpan[]): Map<string, BusySpan[]> => {
  const map = new Map<string, BusySpan[]>();
  for (const s of spans) {
    const list = map.get(s.date) ?? [];
    list.push(s);
    map.set(s.date, list);
  }
  return map;
};

/**
 * Date overrides replace the normal weekly hours. A closed override wins over
 * every other record; otherwise one or more override periods are the working
 * day. If a provider has not migrated yet we safely fall back to their legacy
 * single daily availability row.
 */
const resolveWorkingWindows = (
  recurring: WorkingWindow[],
  overrideRows: { is_closed: boolean; start_time: string | null; end_time: string | null }[],
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
  services: { serviceId: string; duration?: string }[],
  date: string,
  collectAll?: false,
): Promise<BackToBackSlot[] | null>;
async function findBackToBackSlotsForDate(
  providerId: string,
  services: { serviceId: string; duration?: string }[],
  date: string,
  collectAll: true,
): Promise<BackToBackSlot[][] | null>;
async function findBackToBackSlotsForDate(
  providerId: string,
  services: { serviceId: string; duration?: string }[],
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
    (overridesResult.data ?? []) as { is_closed: boolean; start_time: string | null; end_time: string | null }[],
    availResult.data,
  );
  if (windows.length === 0) return null;

  // Taken intervals via the RPC (already buffer-padded per booking). The
  // buffer lookup below is still needed, but only for the NEW chain's own
  // services — the existing bookings' padding is baked into their spans.
  const busySpans = await fetchBusySpans(providerId, date, date);

  const bufferByServiceId = await fetchBufferByServiceId(
    services.map(s => s.serviceId),
    bufferMins
  );

  const chainDurations = services.map(s => (s.duration ? parseDurationToMinutes(s.duration) : 60));
  const chainBuffers = services.map(s => bufferByServiceId.get(s.serviceId) ?? { before: 0, after: bufferMins });

  for (const window of windows) {
    const windowEnd = parse24HTimeToMinutes(window.end_time);
    const candidateStarts = generateSlotsFromRange(window.start_time, window.end_time, intervalMins)
      .map(t => parseTimeToMinutes(t));

    for (const start0 of candidateStarts) {
      const chain: { start: number; end: number }[] = [];
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

      const conflict = busySpans.some(span =>
        doTimesOverlap(envelopeStart, envelopeEnd, span.start, span.end),
      );
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
  services: { serviceId: string; duration?: string }[],
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
          (overridesResult.data ?? []) as { is_closed: boolean; start_time: string | null; end_time: string | null }[],
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

        // Taken intervals via the RPC — each already padded by ITS OWN
        // service's buffer (a 3-hour colour's cleanup gap still applies even
        // if the new request is a quick blowout), so no per-service buffer
        // lookup is needed here and none must be re-applied.
        const busySpans = await fetchBusySpans(providerId, date, date);

        return baseSlots.map(time => {
          const slotStart = parseTimeToMinutes(time);
          const slotEnd = slotStart + durationMinutes;
          const newEffStart = slotStart - newBuffer.before;
          const newEffEnd = slotEnd + newBuffer.after;

          const conflict = busySpans.find(span =>
            doTimesOverlap(newEffStart, newEffEnd, span.start, span.end),
          );

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
          (overridesResult.data ?? []) as { is_closed: boolean; start_time: string | null; end_time: string | null }[],
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

        // Taken intervals via the RPC — already buffer-padded per booking.
        const busySpans = await fetchBusySpans(providerId, date, date);
        const conflict = busySpans.find(span =>
          doTimesOverlap(newEffStart, newEffEnd, span.start, span.end),
        );

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
    bookings: {
      providerName: string;
      date: string;
      time: string;
      duration: string;
      cartItemId: string;
      serviceId?: string | undefined;
    }[]
  ): Promise<{
    isValid: boolean;
    conflicts: {
      cartItemId: string;
      message: string;
    }[];
  }> {
    const conflicts: { cartItemId: string; message: string }[] = [];

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
    services: { serviceId: string; duration?: string }[],
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

      const [blockedResult, overridesResult, busySpans] = await Promise.all([
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
        fetchBusySpans(providerId, startStr, endStr),
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
      const overridesByDate = new Map<string, { is_closed: boolean; start_time: string | null; end_time: string | null }[]>();
      for (const row of (overridesResult.data ?? []) as any[]) {
        const list = overridesByDate.get(row.availability_date) ?? [];
        list.push(row);
        overridesByDate.set(row.availability_date, list);
      }

      const bufferMins = settings?.buffer_mins ?? 0;
      const intervalMins = settings?.slot_interval_mins ?? 60;

      const busyByDate = groupBusyByDate(busySpans);

      // One batched lookup for the requested services' own buffers. Existing
      // bookings need no lookup — their spans arrive already padded.
      const bufferByServiceId = await fetchBufferByServiceId(
        services.map(s => s.serviceId),
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

          const dayBusy = busyByDate.get(dateStr) ?? [];
          const hasOpenSlot = daySlots.some(t => {
            const slotStart = parseTimeToMinutes(t);
            const slotEnd = slotStart + durationMinutes;
            const newEffStart = slotStart - newBuffer.before;
            const newEffEnd = slotEnd + newBuffer.after;
            return !dayBusy.some(span => doTimesOverlap(newEffStart, newEffEnd, span.start, span.end));
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

      const [blockedResult, overridesResult, busySpans] = await Promise.all([
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
        fetchBusySpans(providerId, startStr, endStr),
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
      const overridesByDate = new Map<string, { is_closed: boolean; start_time: string | null; end_time: string | null }[]>();
      for (const row of (overridesResult.data ?? []) as any[]) {
        const list = overridesByDate.get(row.availability_date) ?? [];
        list.push(row);
        overridesByDate.set(row.availability_date, list);
      }
      const busyByDate = groupBusyByDate(busySpans);

      const bufferMins = settings?.buffer_mins ?? 0;
      const intervalMins = settings?.slot_interval_mins ?? 60;
      const durationMinutes = serviceDuration ? parseDurationToMinutes(serviceDuration) : 60;

      // Only the new service's own buffer — existing spans arrive padded.
      const bufferByServiceId = await fetchBufferByServiceId(
        serviceId ? [serviceId] : [],
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

        const dayBusy = busyByDate.get(dateStr) ?? [];
        const hasOpenSlot = daySlots.some(t => {
          const slotStart = parseTimeToMinutes(t);
          const slotEnd = slotStart + durationMinutes;
          const newEffStart = slotStart - newBuffer.before;
          const newEffEnd = slotEnd + newBuffer.after;
          return !dayBusy.some(span => doTimesOverlap(newEffStart, newEffEnd, span.start, span.end));
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
    services: { serviceId: string; duration?: string }[],
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
    services: { serviceId: string; duration?: string }[],
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
    services: { serviceId: string; duration?: string }[],
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

  /**
   * The live availability summary shown on both profile screens, replacing the
   * hand-typed `slots_text` free-text field that never reflected reality.
   *
   * Everything here is derived from the same records that actually govern
   * booking (weekly windows, date overrides, blocked dates, existing
   * bookings), resolved through the same `resolveWorkingWindows` precedence
   * the booking RPC enforces — so the line can't claim a provider is open on a
   * day they'd be rejected for.
   *
   * `unpublished` is deliberately distinct from `closed`: a provider who has
   * never set hours is not bookable at all (the booking RPC rejects them
   * outright), which is a different message from one who is simply shut
   * today. Callers must render the two differently.
   *
   * Booking density comes from the get_provider_busy_spans RPC, not a direct
   * `bookings` read — RLS would hand a browsing client zero rows, which is
   * indistinguishable from "nobody is booked" and would render a confidently
   * wrong "open all week" strip. See fetchBusySpans.
   *
   * No has_gone_live/is_active gate here — both call sites are pre-gated
   * (getProviderBySlug for clients, the provider's own id for their own
   * profile). A new caller must do its own gating; this is not self-gating.
   *
   * One batched fetch for the whole 7-day strip, not a query per day.
   * Returns null only on unexpected failure — a provider with no
   * availability is a valid `unpublished` result, not an error.
   */
  async getAvailabilitySummary(
    providerIdOrName: string,
    options: { searchDays?: number; includeExtendedSearch?: boolean } = {},
  ): Promise<AvailabilitySummary | null> {
    const { searchDays = 60, includeExtendedSearch = true } = options;
    try {
      const providerId = await resolveProviderId(providerIdOrName);
      if (!providerId) return null;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = toLocalDateStr(today);

      const stripEnd = new Date(today);
      stripEnd.setDate(stripEnd.getDate() + 6);
      const stripEndStr = toLocalDateStr(stripEnd);

      const [weeklyRows, blockedResult, overridesResult, busySpans] = await Promise.all([
        fetchWeeklyScheduleRows(providerId),
        supabase
          .from('provider_blocked_dates')
          .select('blocked_date')
          .eq('provider_id', providerId)
          .gte('blocked_date', todayStr)
          .lte('blocked_date', stripEndStr),
        supabase
          .from('provider_availability_overrides')
          .select('availability_date, is_closed, start_time, end_time')
          .eq('provider_id', providerId)
          .gte('availability_date', todayStr)
          .lte('availability_date', stripEndStr),
        fetchBusySpans(providerId, todayStr, stripEndStr),
      ]);
      if (blockedResult.error) throw blockedResult.error;
      if (overridesResult.error) throw overridesResult.error;

      const availRows = weeklyRows.legacyRows;
      const windowRows = weeklyRows.windowRows;

      // No schedule of any kind published — the booking RPC would reject every
      // booking, so this is "not bookable yet", not "closed today".
      if (availRows.length === 0 && windowRows.length === 0) {
        return {
          state: 'unpublished',
          headline: 'No schedule published',
          detail: null,
          days: [],
          nextFree: null,
        };
      }

      const availByDow = new Map<number, { open_time: string; close_time: string; is_closed: boolean }>();
      for (const row of availRows) availByDow.set(row.day_of_week, row);
      const windowsByDow = new Map<number, WorkingWindow[]>();
      for (const row of windowRows) {
        const list = windowsByDow.get(row.day_of_week) ?? [];
        list.push({ start_time: row.start_time, end_time: row.end_time });
        windowsByDow.set(row.day_of_week, list);
      }
      const overridesByDate = new Map<string, { is_closed: boolean; start_time: string | null; end_time: string | null }[]>();
      for (const row of (overridesResult.data ?? []) as any[]) {
        const list = overridesByDate.get(row.availability_date) ?? [];
        list.push(row);
        overridesByDate.set(row.availability_date, list);
      }
      const blockedDates = new Set((blockedResult.data ?? []).map((b: any) => b.blocked_date as string));
      const bookedSpansByDate = groupBusyByDate(busySpans);
      const bookedMinutesByDate = new Map<string, number>();
      for (const [date, spans] of bookedSpansByDate) {
        bookedMinutesByDate.set(
          date,
          spans.reduce((sum, s) => sum + Math.max(0, s.end - s.start), 0),
        );
      }

      // Seven days starting today. A day counts as `full` only when its
      // booked minutes cover its whole working span — an approximation used
      // for the strip's at-a-glance dot, never to gate an actual booking.
      const days: AvailabilityDay[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        const dateStr = toLocalDateStr(d);
        const windows = resolveWorkingWindows(
          windowsByDow.get(d.getDay()) ?? [],
          overridesByDate.get(dateStr) ?? [],
          availByDow.get(d.getDay()) ?? null,
        );

        let state: AvailabilityDayState;
        if (blockedDates.has(dateStr)) state = 'blocked';
        else if (windows.length === 0) state = 'closed';
        else {
          const openMinutes = windows.reduce(
            (sum, w) => sum + Math.max(0, parse24HTimeToMinutes(w.end_time) - parse24HTimeToMinutes(w.start_time)),
            0,
          );
          state = (bookedMinutesByDate.get(dateStr) ?? 0) >= openMinutes ? 'full' : 'open';
        }

        days.push({
          date: dateStr,
          dayOfWeek: d.getDay(),
          label: DAY_INITIALS[d.getDay()] ?? '',
          state,
          closesAt: windows.length > 0 ? formatTime12(windows[windows.length - 1]!.end_time) : null,
        });
      }

      // "Next free" from the data already in hand — no extra queries. The
      // authoritative resolver (resolveNextAvailableSlot) costs its own
      // batched fetch plus a per-candidate-day slot check, which is far too
      // much for one line of text on the client's hottest screen. It is used
      // only as a fallback when nothing opens up inside the 7-day strip.
      //
      // Deliberately coarse: the earliest working-window start that isn't
      // already covered by a known booking, in whole slot-interval steps.
      // It can therefore differ slightly from the booking picker's own
      // answer, so it is presented as guidance ("Next free …"), never used
      // to gate a booking — the server-side enforce_booking_bookability
      // trigger remains the only authority.
      const SLOT_STEP = 30;
      let nextFree: { date: string; time: string } | null = null;
      for (const day of days) {
        if (day.state !== 'open') continue;
        const windows = resolveWorkingWindows(
          windowsByDow.get(day.dayOfWeek) ?? [],
          overridesByDate.get(day.date) ?? [],
          availByDow.get(day.dayOfWeek) ?? null,
        );
        const spans = bookedSpansByDate.get(day.date) ?? [];
        const isToday = day.date === todayStr;
        const nowMins = isToday ? new Date().getHours() * 60 + new Date().getMinutes() : -1;

        for (const w of windows) {
          const openM = parse24HTimeToMinutes(w.start_time);
          const closeM = parse24HTimeToMinutes(w.end_time);
          for (let m = openM; m < closeM; m += SLOT_STEP) {
            if (isToday && m <= nowMins) continue;
            const taken = spans.some(s => m < s.end && s.start < m + SLOT_STEP);
            if (!taken) {
              nextFree = { date: day.date, time: formatMinutesTo12h(m) };
              break;
            }
          }
          if (nextFree) break;
        }
        if (nextFree) break;
      }

      // Nothing inside the strip — only now pay for the wider search.
      if (!nextFree && includeExtendedSearch) {
        nextFree = await this.resolveNextAvailableSlot(providerId, undefined, undefined, searchDays);
      }

      const todayDay = days[0]!;
      let state: AvailabilityState;
      let headline: string;
      if (todayDay.state === 'open') {
        state = 'open';
        headline = todayDay.closesAt ? `Open today until ${todayDay.closesAt}` : 'Open today';
      } else if (todayDay.state === 'full') {
        state = 'full';
        headline = 'Open today';
      } else if (todayDay.state === 'blocked') {
        state = 'blocked';
        headline = 'Away today';
      } else {
        state = 'closed';
        headline = 'Closed today';
      }

      let detail: string | null;
      if (nextFree) {
        detail = nextFree.date === todayStr
          ? `Next free ${nextFree.time}`
          : `Next free ${formatShortDate(nextFree.date)} ${nextFree.time}`;
      } else if (includeExtendedSearch) {
        detail = 'No availability in the next few weeks';
      } else {
        detail = null;
      }

      return { state, headline, detail, days, nextFree };
    } catch (error) {
      logger.error('Error building availability summary:', error);
      return null;
    }
  },

  /**
   * The provider's recurring weekly schedule, Monday → Sunday, for a plain
   * "Opening Hours" listing — distinct from getAvailabilitySummary's rolling
   * 7-day booking-status strip, which mixes in blocked/fully-booked state and
   * isn't fixed to calendar weekdays. Not gated by has_gone_live here (see
   * getAvailabilitySummary's doc comment) — callers query on an id already
   * resolved through a gated path.
   *
   * Same source-of-truth precedence as ProviderScheduleScreen's own editor:
   * provider_availability_windows (current schema, supports multiple periods
   * per day) wins when present; provider_availability (legacy single
   * open/close row) is the fallback for providers who haven't migrated.
   * Date-specific overrides/blocked-dates are deliberately NOT applied here —
   * those describe a single date, not the recurring week this listing shows.
   */
  async getWeeklyOpeningHours(providerIdOrName: string): Promise<WeeklyOpeningHoursDay[] | null> {
    try {
      const providerId = await resolveProviderId(providerIdOrName);
      if (!providerId) return null;
      return buildWeeklyOpeningHours(await fetchWeeklyScheduleRows(providerId));
    } catch (error) {
      logger.error('Error building weekly opening hours:', error);
      return null;
    }
  },

};

export default AvailabilityService;
