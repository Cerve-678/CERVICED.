// Pure date-window logic for the client-side reschedule picker
// (src/screens/client/RescheduleScreen.tsx). Lives here rather than in the
// screen so the anchoring rule below can be tested directly — same split as
// src/utils/bookingConflicts.ts.

import { toLocalDate, formatLongDateNoYear, to24HourTime } from './dateUtils';

// Width of the window we probe for real availability when the client is
// requesting a reschedule (before the provider has offered specific slots).
export const RESCHEDULE_HORIZON_DAYS = 14;

// The window is anchored on the BOOKING being moved, not on today: for a
// booking months out, starting from tomorrow offered a strip of next-week
// dates nobody moving a far-future appointment would pick. When the booking is
// further out than the horizon, probing starts this many days before it, so
// "slightly earlier" is on offer alongside "slightly later".
export const RESCHEDULE_LOOKBACK_DAYS = 3;

// Cap how many dates-with-availability we surface in the horizontal strip, so a
// wide-open provider doesn't produce an endlessly long scroll.
export const RESCHEDULE_MAX_DATES = 7;

/** Local midnight tomorrow — the floor for every reschedule date. */
function tomorrowMidnight(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * First date to probe: tomorrow whenever the default window already reaches the
 * booking, otherwise RESCHEDULE_LOOKBACK_DAYS before the booking's own date.
 *
 * The "already reaches it" check matters — anchoring unconditionally would drop
 * the sooner dates for a booking that's only a week out, and moving an
 * appointment EARLIER is a normal thing to want. Never earlier than tomorrow.
 */
export function rescheduleProbeStart(currentDate: string, now: Date = new Date()): Date {
  const floor = tomorrowMidnight(now);

  const booked = toLocalDate(currentDate);
  if (Number.isNaN(booked.getTime())) return floor;
  booked.setHours(0, 0, 0, 0);

  const defaultWindowEnd = new Date(floor);
  defaultWindowEnd.setDate(defaultWindowEnd.getDate() + RESCHEDULE_HORIZON_DAYS - 1);
  if (booked <= defaultWindowEnd) return floor;

  const anchored = new Date(booked);
  anchored.setDate(anchored.getDate() - RESCHEDULE_LOOKBACK_DAYS);
  anchored.setHours(0, 0, 0, 0);
  return anchored > floor ? anchored : floor;
}

/**
 * The dates rescheduleProbeStart's window covers, as "YYYY-MM-DD", excluding
 * the date the booking is already on (no point offering the slot they're leaving).
 */
export function rescheduleCandidateDates(currentDate: string, now: Date = new Date()): string[] {
  const start = rescheduleProbeStart(currentDate, now);
  const dates: string[] = [];
  for (let i = 0; i < RESCHEDULE_HORIZON_DAYS; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (iso === currentDate) continue;
    dates.push(iso);
  }
  return dates;
}

/**
 * Human description of the window actually probed, so an empty state doesn't
 * claim "the next 14 days" for a booking whose window is anchored months out.
 */
export function rescheduleWindowLabel(currentDate: string, now: Date = new Date()): string {
  const start = rescheduleProbeStart(currentDate, now);
  if (start.getTime() <= tomorrowMidnight(now).getTime()) {
    return `in the next ${RESCHEDULE_HORIZON_DAYS} days`;
  }
  const end = new Date(start);
  end.setDate(end.getDate() + RESCHEDULE_HORIZON_DAYS - 1);
  return `between ${formatLongDateNoYear(start)} and ${formatLongDateNoYear(end)}`;
}

/**
 * The "YYYY-MM-DD HH:MM" token a client-initiated reschedule request is sent
 * as (RescheduleScreen → BookingContext.requestReschedule →
 * request_reschedule_own_booking).
 *
 * The time MUST be 24-hour. Both ends of this pipe split the token on
 * whitespace — the RPC does `split_part(v_raw, ' ', 2)` and BookingContext
 * splits it for the local pending-request card — so a 12-hour "2:30 PM" is
 * three tokens and the meridiem was silently dropped: a 2:30 PM request was
 * stored, shown back to the client, and sent to the provider as 2:30.
 *
 * Slot chips carry getAvailableSlots' 12-hour strings and the custom picker
 * produces 24-hour, so normalisation happens here rather than by changing
 * what either control displays. An unparseable time is passed through
 * untouched so submission fails at the RPC (which reports why) instead of
 * throwing mid-tap.
 */
export function rescheduleRequestToken(date: string, time: string): string {
  return `${date} ${to24HourTimeOrRaw(time)}`;
}

function to24HourTimeOrRaw(time: string): string {
  try {
    return to24HourTime(time);
  } catch {
    return time;
  }
}

/**
 * The inverse of rescheduleRequestToken: `[date, time]`, splitting on the
 * FIRST space only so a 12-hour token from an older client (or a hand-built
 * caller) keeps its meridiem instead of being truncated to "2:30".
 */
export function parseRescheduleRequestToken(token: string): [date: string, time: string] {
  const i = token.indexOf(' ');
  return i < 0 ? [token, ''] : [token.slice(0, i), token.slice(i + 1).trim()];
}
