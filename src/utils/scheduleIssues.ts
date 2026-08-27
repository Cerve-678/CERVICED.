import { BookingStatus } from '../types/booking';
import { to24HourTime } from './dateUtils';

/**
 * Everything wrong with a booking that a provider can only see by comparing
 * it against something else — another booking, their opening hours, their
 * blocked dates, or the clock. Each one is surfaced on the booking itself in
 * ProviderHomeScreen (list card and timeline block).
 */
export type ScheduleIssueKind =
  /** Runs over another live booking on the same day. */
  | 'overlap'
  /** Doesn't fit inside any of that date's working windows — it starts before
   *  the first one opens, runs past the last one, or sits in a break between
   *  two of them. This is what a provider who narrowed their hours AFTER
   *  taking the booking is looking at. */
  | 'time_unavailable'
  /** The provider isn't working that date at all — a closed weekday, or a
   *  closed date override. */
  | 'not_working'
  /** Falls on a date the provider explicitly blocked off. */
  | 'blocked_date'
  /** Still awaiting the provider's response after its own start time. */
  | 'unconfirmed_past_start'
  /** Long finished but still sitting as confirmed/in-progress. Normally
   *  impossible: process_auto_complete_bookings() sweeps these every 30
   *  minutes. Seeing one means that sweep isn't reaching this booking. */
  | 'needs_closing_out'
  /** No end time saved on the booking row and no service length to fall back
   *  on, so its real length is genuinely unrecoverable. */
  | 'missing_end_time'
  /** Sits outside the provider's hours, day off or blocked date BY DESIGN:
   *  the client asked for this exact time through the emergency-request
   *  opt-in and the provider chose to be asked. Replaces whichever of
   *  'time_unavailable' / 'not_working' / 'blocked_date' would otherwise
   *  fire, because all three would be describing a fault where there isn't
   *  one — nothing about the schedule changed. */
  | 'emergency_request';

export interface ScheduleIssue {
  kind: ScheduleIssueKind;
  /** Short provider-facing wording, ready to render. */
  label: string;
}

/** The minimum a booking has to expose to be checked. */
export interface ScheduleCheckBooking {
  id: string;
  bookingDate: string;
  bookingTime: string;
  endTime: string;
  /** "1h 30m" — the fallback when endTime is missing or not after the start. */
  duration: string;
  /** The booked service's own length, the last resort before giving up on
   *  working out how long this booking runs. Callers resolve it in one
   *  batched lookup (getServiceDurationsByIds) for the rows that need it. */
  serviceDurationMinutes?: number | undefined;
  status: BookingStatus;
  /** True for a booking the client raised through the emergency-request
   *  opt-in. ConfirmedBooking already carries this, so callers pass their
   *  existing rows unchanged. */
  isEmergencyRequest?: boolean | undefined;
}

export interface ScheduleCheckContext {
  /**
   * The provider's real bookable periods per date ('YYYY-MM-DD'), already
   * resolved through AvailabilityService's `resolveWorkingWindows` — date
   * overrides beat the recurring weekly windows, which beat the legacy single
   * open/close row. An entry present but EMPTY means "not working that date";
   * a date absent from the map is simply not checked, so a caller that only
   * resolved part of the calendar doesn't produce false alarms for the rest.
   *
   * Resolved windows rather than raw opening hours is the whole point: a
   * provider working 09:00-13:00 and 14:00-18:00 has a real break, and a
   * booking sitting in it is unavailable time that a naive open/close check
   * (09:00-18:00) calls perfectly fine.
   */
  windowsByDate: ReadonlyMap<string, readonly { start_time: string; end_time: string }[]>;
  /** Dates ('YYYY-MM-DD') the provider blocked off. */
  blockedDates: readonly string[];
  /** Injectable for tests; defaults to now. */
  now?: Date;
}

/**
 * Statuses that still occupy the provider's diary — deliberately the same set
 * the database uses in get_provider_busy_spans() and the bookings_no_overlap
 * constraint ('pending', 'confirmed' → UPCOMING, 'in_progress'), so the app
 * never flags a clash the server would consider imaginary.
 *
 * COMPLETED, CANCELLED and both no-show statuses are excluded: whatever went
 * wrong with those is history, not something the provider can still act on.
 */
const OCCUPYING_STATUSES: readonly BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.UPCOMING,
  BookingStatus.IN_PROGRESS,
];

/** Last-resort length, only for a booking with no end time, no duration
 *  string and no service to read a length off. Matches what the database
 *  itself assumes (get_provider_busy_spans COALESCEs to booking_time + 1
 *  hour) and what the timeline has always assumed. A block must never be
 *  treated as zero-length: that would silently make it incapable of ever
 *  conflicting with anything, which is exactly the bug that hid real
 *  double-bookings. */
const ASSUMED_DURATION_MINUTES = 60;

/** How long past a booking's end before "still not completed" is a real
 *  problem rather than the auto-complete cron simply not having run yet.
 *  Four times that job's 30-minute cadence. */
const STALE_COMPLETION_GRACE_MS = 2 * 60 * 60 * 1000;

/** Minutes past midnight, or null for a time this app can't parse. */
function toMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  try {
    const [h, m] = to24HourTime(time).split(':');
    return parseInt(h!, 10) * 60 + parseInt(m!, 10);
  } catch {
    // A single unparseable time must not take out the whole day's list.
    return null;
  }
}

/** "1h 30m" / "45m" / "2h" → minutes. 0 when there's nothing to read. */
function durationToMinutes(duration: string): number {
  if (!duration) return 0;
  const hours = /(\d+)\s*h/i.exec(duration);
  const mins = /(\d+)\s*m/i.exec(duration);
  const h = hours ? parseInt(hours[1]!, 10) : 0;
  const m = mins ? parseInt(mins[1]!, 10) : 0;
  return h * 60 + m;
}


interface Span {
  id: string;
  start: number;
  end: number;
  /** True when nothing on the booking or its service gave a real length. */
  assumedLength: boolean;
}

/**
 * Start/end minutes for a booking, or null if even the start is unreadable.
 *
 * Falls back through endTime → duration string → the service's own length →
 * a flat assumed hour. That chain is the whole reason the first version of
 * this check missed real clashes: mapDbBookingToConfirmed sets `endTime` to
 * the START time whenever bookings.end_time is null, which made the booking
 * look zero-length, and a zero-length block can never overlap anything.
 *
 * Reaching the last step is now genuinely rare — a booking is written with an
 * end time, and a service carries a duration — so `missing_end_time` means a
 * real broken row rather than a gap in this check.
 */
function resolveSpan(booking: ScheduleCheckBooking): Span | null {
  const start = toMinutes(booking.bookingTime);
  if (start == null) return null;

  const explicitEnd = toMinutes(booking.endTime);
  if (explicitEnd != null && explicitEnd > start) {
    return { id: booking.id, start, end: explicitEnd, assumedLength: false };
  }

  const fromDuration = durationToMinutes(booking.duration);
  if (fromDuration > 0) {
    return { id: booking.id, start, end: start + fromDuration, assumedLength: false };
  }

  const fromService = booking.serviceDurationMinutes ?? 0;
  if (fromService > 0) {
    return { id: booking.id, start, end: start + fromService, assumedLength: false };
  }

  return {
    id: booking.id,
    start,
    end: start + ASSUMED_DURATION_MINUTES,
    assumedLength: true,
  };
}

/**
 * The one line an emergency request gets in place of the three "this doesn't
 * fit your rules" findings. A fresh object each time: callers push these into
 * arrays they own.
 *
 * Deliberately not phrased as a problem. "This time is no longer available"
 * claims the schedule changed under a booking that was already taken, which is
 * the opposite of what happened here — the provider was asked for this exact
 * slot and said yes to being asked.
 */
function emergencyIssue(): ScheduleIssue {
  return { kind: 'emergency_request', label: 'Client requested outside your working hours' };
}

/**
 * Every schedule problem on every booking, keyed by booking id. Bookings with
 * nothing wrong are absent from the map rather than present with an empty
 * array, so callers can treat a lookup miss as "fine".
 *
 * Overlap is strict on both ends: a 14:00 finish next to a 14:00 start is
 * back-to-back, which is a normal working day, not a clash. No buffer is
 * applied here — buffers live server-side in get_provider_busy_spans, which
 * returns spans already padded, and re-padding app-side would double them.
 *
 * These problems are genuinely reachable despite the bookings_no_overlap
 * constraint: it only covers bookings ending after its deployment cutoff, so
 * historical rows were grandfathered in, and provider-created bookings can be
 * placed outside opening hours or on a blocked date by design.
 */
export function findScheduleIssues(
  bookings: readonly ScheduleCheckBooking[],
  context: ScheduleCheckContext,
): Map<string, ScheduleIssue[]> {
  const issues = new Map<string, ScheduleIssue[]>();
  const add = (id: string, issue: ScheduleIssue) => {
    const existing = issues.get(id);
    if (existing) existing.push(issue);
    else issues.set(id, [issue]);
  };

  const blocked = new Set(context.blockedDates);
  const nowMs = (context.now ?? new Date()).getTime();

  // ── Per-booking checks, and collect spans for the overlap sweep ──────────
  const spansByDate = new Map<string, Span[]>();

  for (const booking of bookings) {
    if (!OCCUPYING_STATUSES.includes(booking.status)) continue;

    const span = resolveSpan(booking);
    if (!span) continue;

    if (span.assumedLength) {
      add(booking.id, {
        kind: 'missing_end_time',
        label: 'No end time saved — length assumed',
      });
    }

    // A blocked date is reported on its own. Reporting "not working" or
    // "time unavailable" on top would be three ways of saying the same thing,
    // and the blocked date is the one the provider can act on.
    if (blocked.has(booking.bookingDate)) {
      add(booking.id, booking.isEmergencyRequest
        ? emergencyIssue()
        : { kind: 'blocked_date', label: "On a date you've blocked off" });
    } else {
      const windows = context.windowsByDate.get(booking.bookingDate);
      // Absent (rather than empty) means this date was never resolved, so
      // there is nothing to compare against — stay quiet instead of guessing.
      if (windows) {
        if (windows.length === 0) {
          add(booking.id, booking.isEmergencyRequest
            ? emergencyIssue()
            : { kind: 'not_working', label: "On a day you're not working" });
        } else {
          // Must fit ENTIRELY inside ONE window. Spanning the gap between two
          // windows is the break the provider deliberately left themselves.
          const fits = windows.some(w => {
            const open = toMinutes(w.start_time);
            const close = toMinutes(w.end_time);
            return open != null && close != null && span.start >= open && span.end <= close;
          });
          if (!fits) {
            add(booking.id, booking.isEmergencyRequest
              ? emergencyIssue()
              : {
                  kind: 'time_unavailable',
                  label: 'This time is no longer available in your schedule',
                });
          }
        }
      }
    }

    const [y, m, d] = booking.bookingDate.split('-').map(Number);
    if (y && m && d) {
      const startsAt = new Date(y, m - 1, d, Math.floor(span.start / 60), span.start % 60, 0, 0);
      const endsAt = new Date(y, m - 1, d, Math.floor(span.end / 60), span.end % 60, 0, 0);
      if (booking.status === BookingStatus.PENDING && startsAt.getTime() <= nowMs) {
        add(booking.id, {
          kind: 'unconfirmed_past_start',
          label: 'Still unconfirmed and its start time has passed',
        });
      }
      // Confirmed/in-progress work that finished LONG ago and still hasn't
      // closed out. The grace period matters: process_auto_complete_bookings()
      // sweeps confirmed/in_progress bookings past their end time every 30
      // minutes, so a booking that ended ten minutes ago is mid-sweep, not a
      // problem — flagging it would put an amber warning on every appointment
      // the moment it finished. Past the grace window the sweep has had four
      // chances and hasn't taken them, which is worth the provider knowing.
      if (
        (booking.status === BookingStatus.UPCOMING || booking.status === BookingStatus.IN_PROGRESS) &&
        endsAt.getTime() + STALE_COMPLETION_GRACE_MS <= nowMs
      ) {
        add(booking.id, {
          kind: 'needs_closing_out',
          label: 'Finished a while ago and still open — mark it complete or a no-show',
        });
      }
    }

    const day = spansByDate.get(booking.bookingDate);
    if (day) day.push(span);
    else spansByDate.set(booking.bookingDate, [span]);
  }

  // ── Overlap sweep, one day at a time ────────────────────────────────────
  for (const spans of spansByDate.values()) {
    if (spans.length < 2) continue;
    // Sorted by start, so once a later booking begins at or after the one
    // being checked ends, nothing further along can reach back either.
    spans.sort((a, b) => a.start - b.start);
    const overlapping = new Set<string>();
    for (let i = 0; i < spans.length; i++) {
      const current = spans[i]!;
      for (let j = i + 1; j < spans.length; j++) {
        const next = spans[j]!;
        if (next.start >= current.end) break;
        overlapping.add(current.id);
        overlapping.add(next.id);
      }
    }
    for (const id of overlapping) {
      add(id, { kind: 'overlap', label: 'Overlaps another booking' });
    }
  }

  return issues;
}

/** The single line to show when there's no room for the full list. Ordered by
 *  how much it costs the provider to miss: a double-booking is someone turned
 *  away at the door, an assumed length is only an unknown. */
const SEVERITY: readonly ScheduleIssueKind[] = [
  'overlap',
  'blocked_date',
  'not_working',
  'time_unavailable',
  'unconfirmed_past_start',
  'needs_closing_out',
  'missing_end_time',
  // Last: it isn't a problem at all, just context. A real overlap or an
  // unconfirmed request past its start still wins the single-line slot.
  'emergency_request',
];

export function primaryIssue(issues: readonly ScheduleIssue[]): ScheduleIssue | null {
  for (const kind of SEVERITY) {
    const match = issues.find(i => i.kind === kind);
    if (match) return match;
  }
  return issues[0] ?? null;
}
