// Database access: Opening hours, availability, calendar sync and scheduling limits.
// Part of the database layer. Screens and other code import from
// ../databaseService, never from this file directly.
import { supabase } from "../../lib/supabase";
import { normalizeOwnSections, type OwnSections } from "../../features/providers/ownSections";
import type { DbProvider, DbProviderAvailability, DbProviderAvailabilityOverride, DbProviderAvailabilityWindow, DbProviderBlockedDate } from "../../types/database";
import { BoundedTtlCache } from "../../utils/boundedTtlCache";
import { type BookingHorizonSettings, toReleaseDay, toReleaseTime } from "../../utils/bookingHorizon";
import { UUID_RE } from "./social";

// ─────────────────────────────────────────────────────────
// AVAILABILITY
// ─────────────────────────────────────────────────────────

export async function resolveActiveProviderIdByDisplayName(
  displayName: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("providers")
    .select("id")
    .ilike("display_name", displayName)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function getAvailabilityWeeklyScheduleRows(providerId: string): Promise<{
  windowRows: { day_of_week: number; start_time: string; end_time: string }[];
  legacyRows: { day_of_week: number; open_time: string; close_time: string; is_closed: boolean }[];
}> {
  const [windows, legacy] = await Promise.all([
    supabase
      .from("provider_availability_windows")
      .select("day_of_week, start_time, end_time")
      .eq("provider_id", providerId)
      .order("start_time"),
    supabase
      .from("provider_availability")
      .select("day_of_week, open_time, close_time, is_closed")
      .eq("provider_id", providerId),
  ]);
  if (windows.error) throw windows.error;
  if (legacy.error) throw legacy.error;
  return { windowRows: windows.data ?? [], legacyRows: legacy.data ?? [] };
}

type ServiceBufferRow = {
  id: string;
  buffer_before_mins: number | null;
  buffer_after_mins: number | null;
  /** The service's latest start ('HH:MM:SS'), or null for none. Read with
   *  the buffers because every slot generator that needs one needs both. */
  latest_start_time: string | null;
};

// Every one of the week's seven day lookups asks for the SAME service's buffer
// row, and paging weeks asks again — one short-lived cache per id list collapses
// that. Buffers are edited on the provider's own service form; 15s of staleness
// there is invisible to a client mid-booking. (Literals, not the
// AVAILABILITY_RANGE_* consts below — those are declared further down the file.)
const serviceBufferRowsCache = new BoundedTtlCache<string, ServiceBufferRow[]>(
  15_000,
  40,
);
const serviceBufferRowsRequests = new Map<string, Promise<ServiceBufferRow[]>>();

export async function getAvailabilityServiceBufferRows(
  serviceIds: string[],
): Promise<ServiceBufferRow[]> {
  if (serviceIds.length === 0) return [];
  const key = [...new Set(serviceIds)].sort().join(",");
  const cached = serviceBufferRowsCache.get(key);
  if (cached) return cached;
  const inFlight = serviceBufferRowsRequests.get(key);
  if (inFlight) return inFlight;

  const request = (async () => {
    const { data, error } = await supabase
      .from("services")
      .select("id, buffer_before_mins, buffer_after_mins, latest_start_time")
      .in("id", serviceIds);
    if (error) throw error;
    return (data ?? []) as ServiceBufferRow[];
  })()
    .then(rows => {
      serviceBufferRowsCache.set(key, rows);
      return rows;
    })
    .finally(() => {
      serviceBufferRowsRequests.delete(key);
    });
  serviceBufferRowsRequests.set(key, request);
  return request;
}

/** Which of these service ids a client can still actually book.
 *
 *  One query answers three different ways a cart item can go stale, because
 *  the `services_public_read` RLS policy already encodes all of them: the row
 *  is returned only when `is_active = true` AND its provider is both
 *  `has_gone_live` and `is_active`. So an id missing from the result has been
 *  deleted, withdrawn by its provider, or belongs to a provider who
 *  unpublished — and none of those are worth telling a client apart.
 *
 *  Ids that were never valid UUIDs are the caller's problem to filter; this
 *  returns exactly what the database confirmed, never a permissive default. */
export async function getBookableServiceIds(serviceIds: string[]): Promise<Set<string>> {
  if (serviceIds.length === 0) return new Set();
  const { data, error } = await supabase
    .from("services")
    .select("id")
    .in("id", serviceIds);
  if (error) throw error;
  return new Set((data ?? []).map((row: { id: string }) => row.id));
}

export async function getAvailabilityNoticeSettings(providerId: string): Promise<{
  min_booking_notice_hrs: number;
  display_name: string | null;
} | null> {
  const { data, error } = await supabase
    .from("providers")
    .select("min_booking_notice_hrs, display_name")
    .eq("id", providerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** The emergency-request opt-ins plus the provider's chosen request window.
 *  Listed once because two call sites read it and they must not drift. */
const EMERGENCY_POLICY_COLUMNS =
  "allow_out_of_hours_requests, allow_blocked_date_requests, allow_short_notice_requests, allow_beyond_window_requests, request_window_before_mins, request_window_after_mins";

/** One provider row, selecting exactly the columns asked for. */
async function selectProviderColumns(
  providerId: string,
  columns: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("providers")
    .select(columns)
    .eq("id", providerId)
    .maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

export async function getAvailabilityEmergencyPolicyRow(providerId: string): Promise<Record<string, unknown> | null> {
  return selectProviderColumns(providerId, EMERGENCY_POLICY_COLUMNS);
}

/** The columns that decide how far ahead a provider can be booked — read
 *  together everywhere, since a release day (at its time) overrides the window. */
const BOOKING_HORIZON_COLUMNS =
  "booking_window_days, schedule_release_day:automation_settings->scheduleReleaseDay, schedule_release_time:automation_settings->>scheduleReleaseTime";

export interface AvailabilityProviderSettingsRow {
  booking_window_days: number;
  /** automation_settings.scheduleReleaseDay — set = monthly release, which
   *  replaces booking_window_days. See utils/bookingHorizon. */
  schedule_release_day: number | null;
  /** automation_settings.scheduleReleaseTime, 'HH:MM' UK time (9am default). */
  schedule_release_time: string;
  slot_interval_mins: number;
  buffer_mins: number;
  min_booking_notice_hrs: number;
  allow_out_of_hours_requests: boolean;
  allow_blocked_date_requests: boolean;
  allow_short_notice_requests: boolean;
  allow_beyond_window_requests: boolean;
  /** NULL = any time. See providers.request_window_before_mins. */
  request_window_before_mins: number | null;
  request_window_after_mins: number | null;
}

/** A provider's scheduling settings + weekly hours, which every single-day
 *  availability lookup needs and none of them change.
 *
 *  Opening the booking sheet asks for one week — seven independent day
 *  lookups — and each one was re-reading this same settings row and the same
 *  seven schedule rows, so a week cost fourteen queries that returned
 *  identical data. Short TTL because a provider editing their own hours in
 *  another session should see it within seconds, and in-flight de-duping so
 *  the seven parallel day lookups that start together share ONE request
 *  rather than all missing an empty cache at once. */
const AVAILABILITY_CORE_CACHE_TTL_MS = 15_000;
const AVAILABILITY_CORE_CACHE_MAX_ENTRIES = 40;

type AvailabilityProviderCore = {
  settings: AvailabilityProviderSettingsRow | null;
  windowRows: { day_of_week: number; start_time: string; end_time: string }[];
  legacyRows: { day_of_week: number; open_time: string; close_time: string; is_closed: boolean }[];
};

const availabilityCoreCache = new BoundedTtlCache<string, AvailabilityProviderCore>(
  AVAILABILITY_CORE_CACHE_TTL_MS,
  AVAILABILITY_CORE_CACHE_MAX_ENTRIES,
);
const availabilityCoreRequests = new Map<string, Promise<AvailabilityProviderCore>>();

export async function getAvailabilityProviderCore(providerId: string): Promise<AvailabilityProviderCore> {
  const cached = availabilityCoreCache.get(providerId);
  if (cached) return cached;
  const inFlight = availabilityCoreRequests.get(providerId);
  if (inFlight) return inFlight;

  const request = fetchAvailabilityProviderCore(providerId)
    .then(core => {
      availabilityCoreCache.set(providerId, core);
      return core;
    })
    .finally(() => {
      availabilityCoreRequests.delete(providerId);
    });
  availabilityCoreRequests.set(providerId, request);
  return request;
}

/** Drop the cached hours for one provider. Call after writing their schedule,
 *  so the picker doesn't keep serving the old week for the rest of the TTL. */
export function invalidateAvailabilityProviderCore(providerId: string): void {
  availabilityCoreCache.delete(providerId);
  availabilityCoreRequests.delete(providerId);
}

async function fetchAvailabilityProviderCore(providerId: string): Promise<{
  settings: AvailabilityProviderSettingsRow | null;
  windowRows: { day_of_week: number; start_time: string; end_time: string }[];
  legacyRows: { day_of_week: number; open_time: string; close_time: string; is_closed: boolean }[];
}> {
  const baseColumns = `${BOOKING_HORIZON_COLUMNS}, slot_interval_mins, buffer_mins, min_booking_notice_hrs`;
  const [settingsRow, weeklyRows] = await Promise.all([
    selectProviderColumns(providerId, `${baseColumns}, ${EMERGENCY_POLICY_COLUMNS}`),
    getAvailabilityWeeklyScheduleRows(providerId),
  ]);
  return {
    // The release day is a JSON value inside automation_settings — normalise it
    // to the number-or-null the row type promises.
    settings: settingsRow
      ? {
          ...(settingsRow as unknown as AvailabilityProviderSettingsRow),
          schedule_release_day: toReleaseDay(settingsRow['schedule_release_day']),
          schedule_release_time: toReleaseTime(settingsRow['schedule_release_time']),
        }
      : null,
    ...weeklyRows,
  };
}

/**
 * Blocked dates, overrides and busy spans, cached per provider across the whole
 * booking horizon in one read and sliced in memory for whatever narrower range
 * a caller asks for.
 *
 * Same rationale as availabilityCoreCache one screen up: opening the booking
 * sheet fans out into a week of per-day slot lookups, plus a ~60-day "find the
 * next available date" scan, plus the parent sheet's own earliest-slot resolve
 * — and paging to the next week does the seven day lookups all over again. Each
 * of those was independently re-hitting provider_blocked_dates,
 * provider_availability_overrides and the get_provider_busy_spans RPC. None of
 * that data varies by the sub-range asked for, and it's small, so one
 * horizon-wide read per provider serves every caller until its TTL lapses.
 * Ranges that fall outside the horizon (history, or dates past the booking
 * window) skip the cache and query directly — uncommon, and correctness wins.
 */
const AVAILABILITY_RANGE_CACHE_TTL_MS = 15_000;
const AVAILABILITY_RANGE_CACHE_MAX_ENTRIES = 40;
// Booking windows cap at 60 days (the default window), and a monthly release
// reaches at most the end of next month (62 days); the slack covers
// resolveNextAvailableSlot's "+1..+3 day" rescue scan past that.
const AVAILABILITY_RANGE_HORIZON_DAYS = 66;

const toIsoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** [today, today + horizon] in local YYYY-MM-DD — the span the caches hold. */
function availabilityHorizonRange(): { from: string; to: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + AVAILABILITY_RANGE_HORIZON_DAYS);
  return { from: toIsoDate(today), to: toIsoDate(end) };
}

function rangeWithinAvailabilityHorizon(fromDate: string, toDate: string): boolean {
  const h = availabilityHorizonRange();
  return fromDate >= h.from && toDate <= h.to && fromDate <= toDate;
}

type AvailabilityExceptionsPayload = {
  blockedDates: string[];
  overrides: {
    availability_date: string;
    is_closed: boolean;
    start_time: string | null;
    end_time: string | null;
  }[];
};

const availabilityExceptionsCache = new BoundedTtlCache<string, AvailabilityExceptionsPayload>(
  AVAILABILITY_RANGE_CACHE_TTL_MS,
  AVAILABILITY_RANGE_CACHE_MAX_ENTRIES,
);
const availabilityExceptionsRequests = new Map<string, Promise<AvailabilityExceptionsPayload>>();

const providerBusySpansCache = new BoundedTtlCache<string, ProviderBusySpan[]>(
  AVAILABILITY_RANGE_CACHE_TTL_MS,
  AVAILABILITY_RANGE_CACHE_MAX_ENTRIES,
);
const providerBusySpansRequests = new Map<string, Promise<ProviderBusySpan[]>>();

/** Drop the per-provider horizon caches — call after the app itself writes a
 *  blocked date, an override, or a booking for this provider, so the picker
 *  doesn't keep serving the pre-write horizon for the rest of the TTL. */
export function invalidateProviderAvailabilityRanges(providerId: string): void {
  availabilityExceptionsCache.delete(providerId);
  availabilityExceptionsRequests.delete(providerId);
  providerBusySpansCache.delete(providerId);
  providerBusySpansRequests.delete(providerId);
}

async function fetchAvailabilityDateExceptionsRange(
  providerId: string,
  fromDate: string,
  toDate: string,
): Promise<AvailabilityExceptionsPayload> {
  const [blocked, overrides] = await Promise.all([
    supabase
      .from("provider_blocked_dates")
      .select("blocked_date")
      .eq("provider_id", providerId)
      .gte("blocked_date", fromDate)
      .lte("blocked_date", toDate),
    supabase
      .from("provider_availability_overrides")
      .select("availability_date, is_closed, start_time, end_time")
      .eq("provider_id", providerId)
      .gte("availability_date", fromDate)
      .lte("availability_date", toDate)
      .order("start_time"),
  ]);
  if (blocked.error) throw blocked.error;
  if (overrides.error) throw overrides.error;
  return {
    blockedDates: (blocked.data ?? []).map(row => row.blocked_date),
    overrides: overrides.data ?? [],
  };
}

/** The whole horizon's exceptions for one provider, cached + in-flight-deduped
 *  so the seven parallel day lookups that open together share one request. */
async function getAvailabilityExceptionsHorizon(
  providerId: string,
): Promise<AvailabilityExceptionsPayload> {
  const cached = availabilityExceptionsCache.get(providerId);
  if (cached) return cached;
  const inFlight = availabilityExceptionsRequests.get(providerId);
  if (inFlight) return inFlight;

  const { from, to } = availabilityHorizonRange();
  const request = fetchAvailabilityDateExceptionsRange(providerId, from, to)
    .then(payload => {
      availabilityExceptionsCache.set(providerId, payload);
      return payload;
    })
    .finally(() => {
      availabilityExceptionsRequests.delete(providerId);
    });
  availabilityExceptionsRequests.set(providerId, request);
  return request;
}

export async function getAvailabilityDateExceptions(
  providerId: string,
  fromDate: string,
  toDate: string,
): Promise<AvailabilityExceptionsPayload> {
  if (rangeWithinAvailabilityHorizon(fromDate, toDate)) {
    const all = await getAvailabilityExceptionsHorizon(providerId);
    return {
      blockedDates: all.blockedDates.filter(d => d >= fromDate && d <= toDate),
      overrides: all.overrides.filter(
        o => o.availability_date >= fromDate && o.availability_date <= toDate,
      ),
    };
  }
  return fetchAvailabilityDateExceptionsRange(providerId, fromDate, toDate);
}

/**
 * All provider-owned scheduling data needed to evaluate one calendar date.
 * Keeping this projection here preserves the database boundary while letting
 * AvailabilityService evaluate rules without a chain of screen-time queries.
 */
export async function getAvailabilityDateBundle(
  providerId: string,
  date: string,
  serviceId?: string,
): Promise<{
  settings: AvailabilityProviderSettingsRow | null;
  windowRows: { day_of_week: number; start_time: string; end_time: string }[];
  legacyRows: { day_of_week: number; open_time: string; close_time: string; is_closed: boolean }[];
  isBlocked: boolean;
  overrides: {
    availability_date: string;
    is_closed: boolean;
    start_time: string | null;
    end_time: string | null;
  }[];
  serviceBuffer: ServiceBufferRow | null;
}> {
  const [core, exceptions, serviceBuffers] = await Promise.all([
    getAvailabilityProviderCore(providerId),
    getAvailabilityDateExceptions(providerId, date, date),
    serviceId ? getAvailabilityServiceBufferRows([serviceId]) : Promise.resolve([]),
  ]);
  return {
    ...core,
    isBlocked: exceptions.blockedDates.includes(date),
    overrides: exceptions.overrides,
    serviceBuffer: serviceBuffers[0] ?? null,
  };
}

export interface ServiceOpenWithin {
  service_id: string;
  has_slot: boolean;
  /** Earliest day with a free slot ('YYYY-MM-DD', UK date), or null. */
  next_available: string | null;
}

/**
 * The one "is there a free slot" check (get_services_open_within): per
 * service, within `withinDays` days and never past what the provider has
 * opened. Live providers' active services only — anything else comes back
 * without a row.
 */
export async function getServicesOpenWithin(
  serviceIds: string[],
  withinDays: number,
): Promise<ServiceOpenWithin[]> {
  if (serviceIds.length === 0) return [];
  const { data, error } = await supabase.rpc("get_services_open_within", {
    p_service_ids: serviceIds,
    p_within_days: withinDays,
  });
  if (error) throw error;
  return (data ?? []) as ServiceOpenWithin[];
}

/** The signed-in provider's own closure. A row can outlive the closure (its
 *  date has passed), so read isClosed, never whether a row came back. */
export type MyScheduleClosure = {
  isClosed: boolean;
  reopensOn: string | null;
  nextReleaseAt: string | null;
  reason: string | null;
  showReason: boolean;
  autoClosed: boolean;
};

export async function getMyScheduleClosure(): Promise<MyScheduleClosure | null> {
  const { data, error } = await supabase.rpc("get_my_schedule_closure");
  if (error) throw error;
  const row = (data as Array<{
    is_closed: boolean;
    reopens_on: string | null;
    next_release_at: string | null;
    reason: string | null;
    show_reason: boolean;
    auto_closed: boolean;
  }> | null)?.[0];
  if (!row) return null;
  return {
    isClosed: row.is_closed,
    reopensOn: row.reopens_on,
    nextReleaseAt: row.next_release_at,
    reason: row.reason,
    showReason: row.show_reason,
    autoClosed: row.auto_closed,
  };
}

/** Stops new client bookings. With no date, it reopens on the provider's next
 *  release day, or when they reopen it if they don't have one. */
export async function closeMySchedule(
  reopensOn: string | null,
  reason: string | null,
  showReason: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("close_my_schedule", {
    p_reopens_on: reopensOn,
    p_reason: reason,
    p_show_reason: showReason,
  });
  if (error) throw error;
}

export async function reopenMySchedule(): Promise<void> {
  const { error } = await supabase.rpc("reopen_my_schedule");
  if (error) throw error;
}

/** Why a provider is closed, only if they chose to tell clients. Never until when. */
export async function getProviderClosureReason(providerId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_provider_closure_reason", { p_provider_id: providerId });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** Whether a client can book. Why it's closed is getProviderClosureReason. */
export async function isProviderTakingBookings(providerId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("provider_is_taking_bookings", { p_provider_id: providerId });
  if (error) throw error;
  return data !== false;
}

export async function getProviderBookingHorizon(providerId: string): Promise<BookingHorizonSettings> {
  const { data, error } = await supabase
    .from("providers")
    .select(BOOKING_HORIZON_COLUMNS)
    .eq("id", providerId)
    .maybeSingle();
  if (error) throw error;
  const row = data as { booking_window_days: number | null; schedule_release_day: unknown; schedule_release_time: unknown } | null;
  return {
    booking_window_days: row?.booking_window_days ?? 60,
    schedule_release_day: toReleaseDay(row?.schedule_release_day),
    schedule_release_time: toReleaseTime(row?.schedule_release_time),
  };
}

export interface ProviderBusySpan {
  booking_date: string; // 'YYYY-MM-DD'
  busy_start: string; // 'HH:MM:SS'
  busy_end: string;
}

/**
 * Buffer-padded busy spans for a provider over a date range, via the
 * get_provider_busy_spans SECURITY DEFINER RPC.
 *
 * Reading `bookings` directly does NOT work from a client session: RLS grants
 * SELECT only to the booking's own client and to the owning provider, so a
 * client browsing another provider gets zero rows — indistinguishable from
 * "nothing is booked", which is why the slot picker used to offer taken slots
 * as free. The RPC returns only date/start/end (no booking id, user, service
 * or price), so availability can be accurate without exposing a table that
 * holds client PII.
 *
 * Requires supabase/provider_busy_spans_rpc.sql to be deployed.
 */
async function fetchProviderBusySpansRange(
  providerId: string,
  fromDate: string,
  toDate: string,
): Promise<ProviderBusySpan[]> {
  const { data, error } = await supabase.rpc("get_provider_busy_spans", {
    p_provider_id: providerId,
    p_from_date: fromDate,
    p_to_date: toDate,
  });
  if (error) throw error;
  return (data ?? []) as ProviderBusySpan[];
}

/** The whole horizon's busy spans for one provider, cached + in-flight-deduped.
 *  Stale for at most the TTL after a booking lands elsewhere — the server-side
 *  overlap constraint and the checkout slot hold are what actually prevent a
 *  double-book, so a briefly-stale free slot is caught at submit, not offered
 *  through. */
async function getProviderBusySpansHorizon(providerId: string): Promise<ProviderBusySpan[]> {
  const cached = providerBusySpansCache.get(providerId);
  if (cached) return cached;
  const inFlight = providerBusySpansRequests.get(providerId);
  if (inFlight) return inFlight;

  const { from, to } = availabilityHorizonRange();
  const request = fetchProviderBusySpansRange(providerId, from, to)
    .then(spans => {
      providerBusySpansCache.set(providerId, spans);
      return spans;
    })
    .finally(() => {
      providerBusySpansRequests.delete(providerId);
    });
  providerBusySpansRequests.set(providerId, request);
  return request;
}

export async function getProviderBusySpans(
  providerId: string,
  fromDate: string,
  toDate: string,
): Promise<ProviderBusySpan[]> {
  if (rangeWithinAvailabilityHorizon(fromDate, toDate)) {
    const all = await getProviderBusySpansHorizon(providerId);
    return all.filter(s => s.booking_date >= fromDate && s.booking_date <= toDate);
  }
  return fetchProviderBusySpansRange(providerId, fromDate, toDate);
}

// ─────────────────────────────────────────────────────────
// CALENDAR SYNC (busy times from the provider's phone calendar)
// ─────────────────────────────────────────────────────────

/** One busy stretch on one UK day: 'YYYY-MM-DD' and 'HH:MM:SS'. */
export interface CalendarBusyBlockInput {
  date: string;
  start: string;
  end: string;
}

export interface CalendarSyncStatus {
  syncedAt: string;
  /** 'YYYY-MM-DD': the last day the sync covered. */
  syncedThrough: string;
  blockCount: number;
}

/** Replace the signed-in provider's busy times with `blocks`
 *  (sync_my_calendar_busy_blocks). get_provider_busy_spans returns them to
 *  every slot picker and enforce_booking_bookability refuses a booking into
 *  one. Start and end only: nothing about what the event is. */
export async function syncMyCalendarBusyBlocks(
  fromDate: string,
  toDate: string,
  blocks: readonly CalendarBusyBlockInput[],
): Promise<{ providerId: string; blockCount: number }> {
  const { data, error } = await supabase.rpc("sync_my_calendar_busy_blocks", {
    p_from: fromDate,
    p_to: toDate,
    p_blocks: blocks,
  });
  if (error) throw error;
  const row = data as { provider_id: string; block_count: number };
  invalidateProviderAvailabilityRanges(row.provider_id);
  return { providerId: row.provider_id, blockCount: row.block_count };
}

/** Disconnect: every busy time the provider synced is removed. */
export async function clearMyCalendarBusyBlocks(): Promise<void> {
  const { data, error } = await supabase.rpc("clear_my_calendar_busy_blocks");
  if (error) throw error;
  if (typeof data === "string") invalidateProviderAvailabilityRanges(data);
}

/** When the provider last synced, or null if they never have (or disconnected). */
export async function getMyCalendarSyncStatus(): Promise<CalendarSyncStatus | null> {
  const { data, error } = await supabase.rpc("get_my_calendar_sync_status");
  if (error) throw error;
  const row = (data as Array<{ synced_at: string; synced_through: string; block_count: number }> | null)?.[0];
  return row
    ? { syncedAt: row.synced_at, syncedThrough: row.synced_through, blockCount: row.block_count }
    : null;
}

// ── Provider Availability ─────────────────────────────────────────────────────

export async function getProviderAvailability(
  providerId: string,
): Promise<DbProviderAvailability[]> {
  const { data, error } = await supabase
    .from("provider_availability")
    .select("*")
    .eq("provider_id", providerId)
    .order("day_of_week");
  if (error) throw error;
  return data ?? [];
}

/** Return every recurring working period, ordered for direct calendar display. */
export async function getProviderAvailabilityWindows(
  providerId: string,
): Promise<DbProviderAvailabilityWindow[]> {
  const { data, error } = await supabase
    .from("provider_availability_windows")
    .select("*")
    .eq("provider_id", providerId)
    .order("day_of_week")
    .order("start_time");
  if (error) throw error;
  return (data ?? []) as DbProviderAvailabilityWindow[];
}

/** Replace a provider's full weekly schedule atomically from the UI's point of view. */
export async function replaceProviderAvailabilityWindows(
  providerId: string,
  windows: { day_of_week: number; start_time: string; end_time: string }[],
): Promise<void> {
  const { error: removeError } = await supabase
    .from("provider_availability_windows")
    .delete()
    .eq("provider_id", providerId);
  if (removeError) throw removeError;
  // Both exits invalidate: clearing every window IS a schedule change, and
  // this is the primitive every schedule write goes through, so putting it
  // here covers the callers that don't go via saveProviderWeeklySchedule.
  if (windows.length === 0) {
    invalidateAvailabilityProviderCore(providerId);
    return;
  }
  const { error } = await supabase
    .from("provider_availability_windows")
    .insert(windows.map((w) => ({ provider_id: providerId, ...w })));
  if (error) throw error;
  invalidateAvailabilityProviderCore(providerId);
}

/** Replace both legacy day rows and v2 working windows.
 *
 *  NOT atomic, deliberately. This used to call `replace_provider_weekly_schedule()`,
 *  an RPC that does both in one transaction — but that function was never
 *  applied to the live database, so every call failed with "function not found"
 *  and NO provider could save their hours at all. Since a weekly schedule is
 *  one of the three go-live gates, that also silently blocked new providers
 *  from ever publishing.
 *
 *  The RPC's migration (`20260823065212_atomic_provider_weekly_schedule.sql`)
 *  is deliberately parked pending the provider terms & policy work rather than
 *  applied piecemeal, so this goes back to the two writes the app already owns.
 *  Restore the RPC call when that migration ships — the signature is unchanged.
 *
 *  The tradeoff: a failure between the two writes leaves day rows and windows
 *  out of step. Recoverable rather than silent — both writes throw, the screen
 *  keeps its `dirty` flags and tells the provider to retry, and a retry re-sends
 *  the complete schedule, overwriting whichever half landed.
 *
 *  Days go in ONE upsert rather than a loop over seven — see the no-N+1 rule. */
export async function saveProviderWeeklySchedule(
  providerId: string,
  days: {
    day_of_week: number;
    open_time: string;
    close_time: string;
    is_closed: boolean;
  }[],
  windows: { day_of_week: number; start_time: string; end_time: string }[],
): Promise<void> {
  if (days.length > 0) {
    const { error } = await supabase.from("provider_availability").upsert(
      days.map((d) => ({ provider_id: providerId, ...d })),
      { onConflict: "provider_id,day_of_week" },
    );
    if (error) throw error;
  }
  // Windows second: the day rows are what check_and_set_provider_live() reads,
  // so if the second write fails the provider is at worst still gated the same
  // way they were before, never published against a schedule that isn't there.
  // replaceProviderAvailabilityWindows invalidates the picker's cached copy
  // of these hours on both its exits, so this provider won't be shown the
  // previous week for the rest of the TTL.
  await replaceProviderAvailabilityWindows(providerId, windows);
}

export async function getProviderAvailabilityOverrides(
  providerId: string,
  fromDate?: string,
): Promise<DbProviderAvailabilityOverride[]> {
  let query = supabase
    .from("provider_availability_overrides")
    .select("*")
    .eq("provider_id", providerId)
    .order("availability_date")
    .order("start_time");
  if (fromDate) query = query.gte("availability_date", fromDate);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DbProviderAvailabilityOverride[];
}

export async function addProviderAvailabilityOverride(
  providerId: string,
  override: {
    availability_date: string;
    is_closed: boolean;
    start_time?: string | null;
    end_time?: string | null;
    reason?: string | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from("provider_availability_overrides")
    .insert({ provider_id: providerId, ...override });
  if (error) throw error;
  invalidateProviderAvailabilityRanges(providerId);
}

export async function removeProviderAvailabilityOverride(
  id: string,
  /** Pass it when the caller has it, so the picker's cached horizon for this
   *  provider is dropped now rather than after the TTL. */
  providerId?: string,
): Promise<void> {
  const { error } = await supabase
    .from("provider_availability_overrides")
    .delete()
    .eq("id", id);
  if (error) throw error;
  if (providerId) invalidateProviderAvailabilityRanges(providerId);
}

export async function updateProviderAutoAccept(
  providerId: string,
  autoAccept: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("providers")
    .update({ auto_accept_bookings: autoAccept })
    .eq("id", providerId);
  if (error) throw error;
}

export async function updateProviderScheduleSettings(
  providerId: string,
  settings: {
    booking_window_days: number;
    slot_interval_mins: number;
    buffer_mins: number;
    min_booking_notice_hrs: number;
  },
): Promise<void> {
  const { error } = await supabase
    .from("providers")
    .update(settings)
    .eq("id", providerId);
  if (error) throw error;
}

/** The four emergency-request opt-ins plus the bound on how far an
 *  out-of-hours request may reach. Written only by the provider's own
 *  Scheduling & Availability screen — these decide what a CLIENT is allowed
 *  to ask for, and the bookability trigger reads them straight off this row,
 *  so nothing else may set them. See
 *  supabase/migrations/20260821143821_emergency_booking_requests.sql. */
export async function updateProviderRequestSettings(
  providerId: string,
  settings: {
    allow_out_of_hours_requests: boolean;
    allow_blocked_date_requests: boolean;
    allow_short_notice_requests: boolean;
    allow_beyond_window_requests: boolean;
    /** null = any time. */
    request_window_before_mins: number | null;
    request_window_after_mins: number | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from("providers")
    .update(settings)
    .eq("id", providerId);
  if (error) throw error;
}

/** Persist cancellation notice hours to providers table (0 = anytime). */
export async function updateProviderCancellationPolicy(
  providerId: string,
  noticeHours: number,
): Promise<void> {
  const { error } = await supabase
    .from("providers")
    .update({ cancellation_notice_hours: noticeHours })
    .eq("id", providerId);
  if (error) throw error;
}

/** Saves the provider's own profile sections (Policies & Info). Cleaned
 *  first, so only what the profile would show is stored. */
export async function updateProviderProfileSections(
  providerId: string,
  sections: OwnSections,
  /** When the provider ticked the agreement at the bottom of Policies & Info
   *  for this change (ISO). Kept beside the sections as a record; the profile
   *  ignores it (normalizeOwnSections drops unknown keys). */
  agreedAt: string,
): Promise<void> {
  const { error } = await supabase
    .from("providers")
    .update({ profile_sections: { ...normalizeOwnSections(sections), agreedAt } })
    .eq("id", providerId);
  if (error) throw error;
}

type AutomationSettings = NonNullable<DbProvider["automation_settings"]>;

/**
 * Changes only the given automation_settings keys (and removes `remove`), in
 * one statement on the server — merge_provider_automation_settings. The
 * bundle is edited from several screens (Automations, Payments, Scheduling's
 * monthly release); writing the whole bundle back from a copy loaded when the
 * screen opened let one screen's save silently undo another's change.
 */
export async function mergeProviderAutomationSettings(
  providerId: string,
  set: Partial<AutomationSettings>,
  remove: (keyof AutomationSettings)[] = [],
): Promise<void> {
  const { error } = await supabase.rpc("merge_provider_automation_settings", {
    p_provider_id: providerId,
    p_set: set,
    p_remove: remove,
  });
  if (error) throw error;
}

/** Mirrors the precedence the display surfaces (InfoRegScreen, ProviderProfileScreen)
 *  already use: prefer the dedicated cancellation_notice_hours column (set via the
 *  Automations screen); if that's unset (0), fall back to parsing the descriptive
 *  booking_policies.cancelNotice string set during registration ('none'|'24h'|'48h'|'72h').
 *  Without this fallback, enforcement could silently ignore a policy the client was
 *  already shown on the provider's profile. */
export function mapCancellationPolicyRow(
  data: {
    cancellation_notice_hours: number | null;
    booking_policies: { cancelNotice?: string } | null;
  } | null,
): number {
  const hours = data?.cancellation_notice_hours ?? 0;
  if (hours > 0) return hours;
  const noticeMap: Record<string, number> = {
    none: 0,
    "24h": 24,
    "48h": 48,
    "72h": 72,
  };
  return noticeMap[data?.booking_policies?.cancelNotice ?? "none"] ?? 0;
}

/** Fetch a provider's cancellation notice window by display name. Returns 0 (anytime) on error. */
export async function getProviderCancellationPolicy(
  displayName: string,
): Promise<number> {
  const { data } = await supabase
    .from("providers")
    .select("cancellation_notice_hours, booking_policies")
    .eq("display_name", displayName)
    .maybeSingle();
  return mapCancellationPolicyRow(data);
}

/** Cancellation policy by provider id (stable) — prefer over the display-name variant. */
export async function getProviderCancellationPolicyById(
  providerId: string,
): Promise<number> {
  const { data } = await supabase
    .from("providers")
    .select("cancellation_notice_hours, booking_policies")
    .eq("id", providerId)
    .maybeSingle();
  return mapCancellationPolicyRow(data);
}

export async function upsertProviderAvailability(
  providerId: string,
  dayOfWeek: number,
  openTime: string,
  closeTime: string,
  isClosed: boolean,
): Promise<void> {
  const { error } = await supabase.from("provider_availability").upsert(
    {
      provider_id: providerId,
      day_of_week: dayOfWeek,
      open_time: openTime,
      close_time: closeTime,
      is_closed: isClosed,
    },
    { onConflict: "provider_id,day_of_week" },
  );
  if (error) throw error;
}

export async function getProviderBlockedDates(
  providerId: string,
): Promise<DbProviderBlockedDate[]> {
  const { data, error } = await supabase
    .from("provider_blocked_dates")
    .select("*")
    .eq("provider_id", providerId)
    .order("blocked_date")
    .limit(500);
  if (error) throw error;
  return data ?? [];
}

export async function addProviderBlockedDate(
  providerId: string,
  date: string,
  reason: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("provider_blocked_dates")
    .insert({ provider_id: providerId, blocked_date: date, reason });
  if (error) throw error;
  invalidateProviderAvailabilityRanges(providerId);
}

export async function removeProviderBlockedDate(
  id: string,
  /** Pass it when the caller has it, so the picker's cached horizon for this
   *  provider is dropped now rather than after the TTL. */
  providerId?: string,
): Promise<void> {
  const { error } = await supabase
    .from("provider_blocked_dates")
    .delete()
    .eq("id", id);
  if (error) throw error;
  if (providerId) invalidateProviderAvailabilityRanges(providerId);
}

// ─────────────────────────────────────────────────────────
// SCHEDULING CONSTRAINTS
// ─────────────────────────────────────────────────────────

/**
 * Fetch the scheduling constraints configured by a provider.
 * Returns sensible defaults when the provider is not found.
 */
export async function getProviderSchedulingConstraints(
  providerIdOrDisplayName: string,
): Promise<{
  bookingWindowDays: number;
  /** Set = monthly release, which replaces bookingWindowDays. */
  scheduleReleaseDay: number | null;
  /** 'HH:MM' UK time the release day opens next month. */
  scheduleReleaseTime: string;
  minBookingNoticeHrs: number;
}> {
  // Prefer the real UUID when the caller has one — exact display_name
  // matching is fragile (case, punctuation, a provider renaming their
  // business) and silently returns nothing, which looks identical to a
  // provider with no constraints set instead of a failed lookup.
  const query = supabase
    .from("providers")
    .select(`${BOOKING_HORIZON_COLUMNS}, min_booking_notice_hrs`);
  const { data } = UUID_RE.test(providerIdOrDisplayName)
    ? await query.eq("id", providerIdOrDisplayName).maybeSingle()
    : await query.eq("display_name", providerIdOrDisplayName).maybeSingle();
  return {
    bookingWindowDays: (data as any)?.booking_window_days ?? 60,
    scheduleReleaseDay: toReleaseDay((data as any)?.schedule_release_day),
    scheduleReleaseTime: toReleaseTime((data as any)?.schedule_release_time),
    minBookingNoticeHrs: (data as any)?.min_booking_notice_hrs ?? 0,
  };
}

/**
 * The signed-in provider's own monthly release day (null = rolling window)
 * and the time it opens. Lets a screen that edits them (Edit Profile) pick up
 * a change made on the other one (Scheduling & Availability) when it comes
 * back into view. Own record, so no has_gone_live filter. Same duplicate-row
 * tie-break as the provider lookup by user id above.
 */
export async function getMyProviderRelease(userId: string): Promise<{ day: number | null; time: string }> {
  const { data, error } = await supabase
    .from("providers")
    .select("schedule_release_day:automation_settings->scheduleReleaseDay, schedule_release_time:automation_settings->>scheduleReleaseTime")
    .eq("user_id", userId)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const row = data as { schedule_release_day?: unknown; schedule_release_time?: unknown } | null;
  return { day: toReleaseDay(row?.schedule_release_day), time: toReleaseTime(row?.schedule_release_time) };
}
