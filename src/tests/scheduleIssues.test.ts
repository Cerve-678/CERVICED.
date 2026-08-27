import { findScheduleIssues, primaryIssue, type ScheduleCheckBooking, type ScheduleCheckContext } from '../utils/scheduleIssues';
import { formatDurationMinutes } from '../utils/dateUtils';
import { BookingStatus } from '../types/booking';

// The whole calendar the tests care about is one Friday, 2026-08-21.
const DAY = '2026-08-21';
const NINE_TO_SIX = [{ start_time: '09:00:00', end_time: '18:00:00' }];

const windows = (
  ...entries: [string, { start_time: string; end_time: string }[]][]
) => new Map(entries);

const ctx = (over: Partial<ScheduleCheckContext> = {}): ScheduleCheckContext => ({
  windowsByDate: windows([DAY, NINE_TO_SIX], ['2026-08-22', NINE_TO_SIX], ['2026-08-19', NINE_TO_SIX]),
  blockedDates: [],
  // Midday on 2026-08-20 — the day before DAY, so everything on DAY is in
  // the future unless a test deliberately dates it earlier.
  now: new Date(2026, 7, 20, 12, 0, 0),
  ...over,
});

const booking = (
  id: string,
  bookingTime: string,
  endTime: string,
  over: Partial<ScheduleCheckBooking> = {},
): ScheduleCheckBooking => ({
  id,
  bookingDate: DAY,
  bookingTime,
  endTime,
  duration: '1h',
  status: BookingStatus.UPCOMING,
  ...over,
});

const kinds = (m: Map<string, { kind: string }[]>, id: string) =>
  (m.get(id) ?? []).map(i => i.kind).sort();

describe('findScheduleIssues — overlaps', () => {
  it('flags both sides of an overlap', () => {
    const m = findScheduleIssues(
      [booking('a', '10:00 AM', '11:30 AM'), booking('b', '11:00 AM', '12:00 PM')],
      ctx(),
    );
    expect(kinds(m, 'a')).toEqual(['overlap']);
    expect(kinds(m, 'b')).toEqual(['overlap']);
  });

  it('treats back-to-back bookings as fine', () => {
    const m = findScheduleIssues(
      [booking('a', '10:00 AM', '11:00 AM'), booking('b', '11:00 AM', '12:00 PM')],
      ctx(),
    );
    expect(m.size).toBe(0);
  });

  // The regression that made the first version of this check miss real
  // clashes: mapDbBookingToConfirmed sets endTime to the START time when
  // bookings.end_time is null, which looked zero-length and never conflicted.
  it('still catches a clash when endTime equals the start time', () => {
    const m = findScheduleIssues(
      [
        booking('a', '10:00 AM', '10:00 AM', { duration: '1h 30m' }),
        booking('b', '11:00 AM', '11:00 AM', { duration: '1h' }),
      ],
      ctx(),
    );
    expect(kinds(m, 'a')).toContain('overlap');
    expect(kinds(m, 'b')).toContain('overlap');
  });

  it("uses the service's own length when the row has no end time or duration", () => {
    const m = findScheduleIssues(
      [
        booking('a', '10:00 AM', '10:00 AM', { duration: '', serviceDurationMinutes: 90 }),
        booking('b', '11:00 AM', '11:00 AM', { duration: '', serviceDurationMinutes: 60 }),
      ],
      ctx(),
    );
    // 10:00-11:30 against 11:00-12:00 — a clash only visible once the service
    // length is used, and NOT reported as a missing end time.
    expect(kinds(m, 'a')).toEqual(['overlap']);
    expect(kinds(m, 'b')).toEqual(['overlap']);
  });

  it('falls back to an assumed hour only when nothing at all gives a length', () => {
    const m = findScheduleIssues(
      [
        booking('a', '10:00 AM', '10:00 AM', { duration: '' }),
        booking('b', '10:30 AM', '10:30 AM', { duration: '' }),
      ],
      ctx(),
    );
    expect(kinds(m, 'a')).toEqual(['missing_end_time', 'overlap']);
    expect(kinds(m, 'b')).toEqual(['missing_end_time', 'overlap']);
  });

  it('never compares across different days', () => {
    const m = findScheduleIssues(
      [booking('a', '10:00 AM', '11:30 AM'), booking('b', '10:30 AM', '11:00 AM', { bookingDate: '2026-08-22' })],
      ctx(),
    );
    expect(m.size).toBe(0);
  });

  it('ignores bookings that no longer occupy the diary', () => {
    const m = findScheduleIssues(
      [
        booking('a', '10:00 AM', '11:30 AM'),
        booking('b', '10:30 AM', '11:00 AM', { status: BookingStatus.CANCELLED }),
        booking('c', '10:15 AM', '10:45 AM', { status: BookingStatus.NO_SHOW }),
        booking('d', '10:20 AM', '10:40 AM', { status: BookingStatus.COMPLETED }),
      ],
      ctx(),
    );
    expect(m.size).toBe(0);
  });

  it('flags a pending request landing on a confirmed booking', () => {
    const m = findScheduleIssues(
      [
        booking('confirmed', '2:00 PM', '3:00 PM'),
        booking('request', '2:30 PM', '3:30 PM', { status: BookingStatus.PENDING }),
      ],
      ctx(),
    );
    expect(kinds(m, 'confirmed')).toContain('overlap');
    expect(kinds(m, 'request')).toContain('overlap');
  });

  it('flags every member of a three-way pile-up', () => {
    const m = findScheduleIssues(
      [
        booking('a', '9:00 AM', '12:00 PM'),
        booking('b', '10:00 AM', '10:30 AM'),
        booking('c', '11:00 AM', '11:30 AM'),
      ],
      ctx(),
    );
    expect(kinds(m, 'a')).toContain('overlap');
    expect(kinds(m, 'b')).toContain('overlap');
    expect(kinds(m, 'c')).toContain('overlap');
  });
});

describe('findScheduleIssues — availability', () => {
  it('flags a booking that starts before the first window opens', () => {
    const m = findScheduleIssues([booking('a', '8:00 AM', '9:30 AM')], ctx());
    expect(kinds(m, 'a')).toEqual(['time_unavailable']);
  });

  it('flags a booking that runs past the last window', () => {
    const m = findScheduleIssues([booking('a', '5:30 PM', '7:00 PM')], ctx());
    expect(kinds(m, 'a')).toEqual(['time_unavailable']);
  });

  it('leaves a booking inside a window alone', () => {
    const m = findScheduleIssues([booking('a', '9:00 AM', '6:00 PM')], ctx());
    expect(m.size).toBe(0);
  });

  // The case a naive open/close check (09:00-18:00) calls perfectly fine.
  it('flags a booking sitting in the break between two windows', () => {
    const split = windows([DAY, [
      { start_time: '09:00:00', end_time: '13:00:00' },
      { start_time: '14:00:00', end_time: '18:00:00' },
    ]]);
    const m = findScheduleIssues([booking('a', '1:00 PM', '2:00 PM')], ctx({ windowsByDate: split }));
    expect(kinds(m, 'a')).toEqual(['time_unavailable']);
  });

  it('flags a booking that straddles the gap rather than fitting one window', () => {
    const split = windows([DAY, [
      { start_time: '09:00:00', end_time: '13:00:00' },
      { start_time: '14:00:00', end_time: '18:00:00' },
    ]]);
    const m = findScheduleIssues([booking('a', '12:30 PM', '2:30 PM')], ctx({ windowsByDate: split }));
    expect(kinds(m, 'a')).toEqual(['time_unavailable']);
  });

  it('accepts a booking in the later of two windows', () => {
    const split = windows([DAY, [
      { start_time: '09:00:00', end_time: '13:00:00' },
      { start_time: '14:00:00', end_time: '18:00:00' },
    ]]);
    const m = findScheduleIssues([booking('a', '2:00 PM', '3:00 PM')], ctx({ windowsByDate: split }));
    expect(m.size).toBe(0);
  });

  it('flags a booking on a date with no working windows at all', () => {
    const m = findScheduleIssues([booking('a', '10:00 AM', '11:00 AM')], ctx({ windowsByDate: windows([DAY, []]) }));
    expect(kinds(m, 'a')).toEqual(['not_working']);
  });

  // An emergency request is a slot the client deliberately asked for through
  // the opt-in, and the provider chose to be asked. Telling them the time is
  // "no longer available" describes a change that never happened, and the same
  // goes for the day-off and blocked-date wording — so all three collapse into
  // one honest line.
  describe('emergency requests', () => {
    const emergency = (id: string, time: string, end: string) =>
      booking(id, time, end, { isEmergencyRequest: true });

    it('relabels an out-of-hours emergency request instead of calling it unavailable', () => {
      const m = findScheduleIssues([emergency('a', '8:00 PM', '9:00 PM')], ctx());
      expect(kinds(m, 'a')).toEqual(['emergency_request']);
      expect(m.get('a')![0]!.label).toBe('Outside your hours by request');
    });

    it('relabels one on a day off and one on a blocked date the same way', () => {
      const dayOff = findScheduleIssues(
        [emergency('a', '10:00 AM', '11:00 AM')],
        ctx({ windowsByDate: windows([DAY, []]) }),
      );
      expect(kinds(dayOff, 'a')).toEqual(['emergency_request']);

      const blocked = findScheduleIssues(
        [emergency('a', '10:00 AM', '11:00 AM')],
        ctx({ blockedDates: [DAY] }),
      );
      expect(kinds(blocked, 'a')).toEqual(['emergency_request']);
    });

    it('stays silent when the requested time fits the day anyway', () => {
      // Only the notice period made it a request; the slot itself is normal.
      const m = findScheduleIssues([emergency('a', '10:00 AM', '11:00 AM')], ctx());
      expect(m.size).toBe(0);
    });

    it('still reports a real clash, and ranks it above the request note', () => {
      const m = findScheduleIssues(
        [emergency('a', '8:00 PM', '10:00 PM'), emergency('b', '9:00 PM', '11:00 PM')],
        ctx(),
      );
      expect(kinds(m, 'a')).toEqual(['emergency_request', 'overlap']);
      expect(primaryIssue(m.get('a')!)!.kind).toBe('overlap');
    });

    it('leaves an ordinary booking untouched — same wording as before', () => {
      const m = findScheduleIssues([booking('a', '8:00 PM', '9:00 PM')], ctx());
      expect(m.get('a')![0]!.label).toBe('This time is no longer available in your schedule');
    });
  });

  it('flags a booking on a blocked date, and does not pile on other availability issues', () => {
    const m = findScheduleIssues(
      [booking('a', '8:00 AM', '9:30 AM')],
      ctx({ blockedDates: [DAY] }),
    );
    expect(kinds(m, 'a')).toEqual(['blocked_date']);
  });

  it('stays quiet about a date that was never resolved', () => {
    const m = findScheduleIssues([booking('a', '8:00 AM', '9:30 AM')], ctx({ windowsByDate: new Map() }));
    expect(m.size).toBe(0);
  });
});

describe('findScheduleIssues — unanswered requests', () => {
  it('flags a pending booking whose start time has passed', () => {
    const m = findScheduleIssues(
      [booking('a', '10:00 AM', '11:00 AM', { bookingDate: '2026-08-19', status: BookingStatus.PENDING })],
      ctx(),
    );
    expect(kinds(m, 'a')).toContain('unconfirmed_past_start');
  });

  it('leaves a pending booking in the future alone', () => {
    const m = findScheduleIssues(
      [booking('a', '10:00 AM', '11:00 AM', { status: BookingStatus.PENDING })],
      ctx(),
    );
    expect(m.size).toBe(0);
  });

  it('flags a confirmed booking that finished long ago and never closed out', () => {
    const m = findScheduleIssues(
      [booking('a', '10:00 AM', '11:00 AM', { bookingDate: '2026-08-19' })],
      ctx(),
    );
    expect(kinds(m, 'a')).toEqual(['needs_closing_out']);
  });

  // The auto-complete cron runs every 30 minutes, so a booking that ended a
  // few minutes ago is mid-sweep — flagging it would amber-flag every
  // appointment the moment it finished.
  it('leaves a booking that only just finished alone', () => {
    const m = findScheduleIssues(
      [booking('a', '10:00 AM', '11:00 AM', { bookingDate: '2026-08-20' })],
      ctx({
        windowsByDate: windows(['2026-08-20', NINE_TO_SIX]),
        now: new Date(2026, 7, 20, 11, 20, 0),
      }),
    );
    expect(m.size).toBe(0);
  });

  it('leaves a confirmed booking that has started but not finished alone', () => {
    const m = findScheduleIssues(
      [booking('a', '11:30 AM', '1:00 PM', { bookingDate: '2026-08-20' })],
      // now is 12:00 on the 20th — under way, not over.
      ctx({ windowsByDate: windows(['2026-08-20', NINE_TO_SIX]) }),
    );
    expect(m.size).toBe(0);
  });

  it('does not ask for a completed booking to be closed out again', () => {
    const m = findScheduleIssues(
      [booking('a', '10:00 AM', '11:00 AM', { bookingDate: '2026-08-19', status: BookingStatus.COMPLETED })],
      ctx(),
    );
    expect(m.size).toBe(0);
  });
});

describe('primaryIssue', () => {
  it('ranks a double-booking above everything else', () => {
    const m = findScheduleIssues(
      [
        booking('a', '8:00 AM', '8:00 AM', { duration: '' }),
        booking('b', '8:30 AM', '9:30 AM'),
      ],
      ctx(),
    );
    expect(primaryIssue(m.get('a') ?? [])?.kind).toBe('overlap');
  });

  it('returns null for a booking with nothing wrong', () => {
    expect(primaryIssue([])).toBeNull();
  });
});

// formatDurationMinutes recovers a display string for a legacy booking whose
// row has a NULL end_time (see mapDbBookingToConfirmed) — ProviderHomeScreen
// and ProviderBookingDetailScreen both feed a batched service-duration
// lookup through this so the recovered length reads exactly like a normal
// one, not just a schedule-issue flag.
describe('formatDurationMinutes', () => {
  it('formats hours and minutes together', () => {
    expect(formatDurationMinutes(90)).toBe('1h 30m');
  });

  it('formats a whole number of hours with no trailing minutes', () => {
    expect(formatDurationMinutes(120)).toBe('2h');
  });

  it('formats minutes-only under an hour', () => {
    expect(formatDurationMinutes(45)).toBe('45m');
  });

  it('returns empty string for zero or negative input, never "0m"', () => {
    expect(formatDurationMinutes(0)).toBe('');
    expect(formatDurationMinutes(-5)).toBe('');
  });
});
