import {
  rescheduleProbeStart,
  rescheduleCandidateDates,
  rescheduleWindowLabel,
  RESCHEDULE_HORIZON_DAYS,
  RESCHEDULE_LOOKBACK_DAYS,
  rescheduleRequestToken,
  parseRescheduleRequestToken,
} from '../utils/rescheduleWindow';
import { formatTime12Safe } from '../utils/dateUtils';

// The reschedule picker used to probe availability for the 14 days after
// TOMORROW, regardless of when the booking being moved actually was. A client
// with an appointment three months out was offered next week's dates only —
// reported as "it only shows me the current month". The window is anchored on
// the booking now, so these are the rules worth pinning.
const NOW = new Date(2026, 7, 20, 10, 0, 0); // 20 Aug 2026, local

describe('rescheduleProbeStart', () => {
  it('starts tomorrow for a booking the default window already reaches', () => {
    // Anchoring here would drop tomorrow..22 Aug, and moving an appointment
    // earlier is a normal thing to want.
    const start = rescheduleProbeStart('2026-08-25', NOW);
    expect(start).toEqual(new Date(2026, 7, 21));
  });

  it('anchors just before the booking when it is months out', () => {
    const start = rescheduleProbeStart('2026-11-14', NOW);
    // 14 Nov minus RESCHEDULE_LOOKBACK_DAYS
    expect(start).toEqual(new Date(2026, 10, 14 - RESCHEDULE_LOOKBACK_DAYS));
  });

  it('never returns a date before tomorrow, even for a past booking', () => {
    const start = rescheduleProbeStart('2026-01-05', NOW);
    expect(start).toEqual(new Date(2026, 7, 21));
  });

  it('falls back to tomorrow on an unparseable date', () => {
    const start = rescheduleProbeStart('not-a-date', NOW);
    expect(start).toEqual(new Date(2026, 7, 21));
  });
});

describe('rescheduleCandidateDates', () => {
  it('covers dates either side of a far-future booking', () => {
    const dates = rescheduleCandidateDates('2026-11-14', NOW);
    expect(dates[0]).toBe('2026-11-11');
    expect(dates).toContain('2026-11-13'); // earlier than the booking
    expect(dates).toContain('2026-11-15'); // later than the booking
    // The booking's own date is never offered back.
    expect(dates).not.toContain('2026-11-14');
    expect(dates).toHaveLength(RESCHEDULE_HORIZON_DAYS - 1);
  });

  it('keeps the default window for a booking the horizon already covers', () => {
    const dates = rescheduleCandidateDates('2026-08-25', NOW);
    expect(dates[0]).toBe('2026-08-21'); // tomorrow — moving it EARLIER stays possible
    expect(dates).not.toContain('2026-08-25');
    expect(dates).toHaveLength(RESCHEDULE_HORIZON_DAYS - 1);
  });
});

describe('rescheduleWindowLabel', () => {
  it('says "the next N days" for a near-term booking', () => {
    expect(rescheduleWindowLabel('2026-08-25', NOW))
      .toBe(`in the next ${RESCHEDULE_HORIZON_DAYS} days`);
  });

  it('names the real window for a far-future booking', () => {
    expect(rescheduleWindowLabel('2026-11-14', NOW))
      .toBe('between Wednesday 11th November and Tuesday 24th November');
  });
});

// The "you requested" breakdown rendered requested_times raw, so a 24-hour
// value showed with no am/pm at all. It goes through formatTime12 now — but
// that throws on junk, and these values come straight from the database, so
// the render sites use the non-throwing variant.
describe('formatTime12Safe', () => {
  it('adds am/pm to 24-hour values', () => {
    expect(formatTime12Safe('14:00')).toBe('2:00pm');
    expect(formatTime12Safe('09:30')).toBe('09:30am');
    expect(formatTime12Safe('00:15')).toBe('12:15am');
    expect(formatTime12Safe('12:00')).toBe('12:00pm');
  });

  it('returns null instead of throwing on empty or unparseable input', () => {
    expect(formatTime12Safe('')).toBeNull();
    expect(formatTime12Safe(null)).toBeNull();
    expect(formatTime12Safe(undefined)).toBeNull();
    expect(formatTime12Safe('sometime after lunch')).toBeNull();
  });
});


// A client-initiated reschedule request travels as one space-joined
// "YYYY-MM-DD HH:MM" token, and BOTH ends split it on whitespace — the RPC via
// split_part(v_raw, ' ', 2), BookingContext via parseRescheduleRequestToken.
// The screen used to build it as `${date} ${selectedTime}` straight from the
// slot chips, which carry 12-hour strings: "2026-09-01 2:30 PM" is three
// tokens, so the meridiem was dropped and a 2:30 PM request was stored, shown
// back to the client (formatTime12Safe('2:30') → 2:30am) and sent to the
// provider as 2:30 in the morning.
describe('rescheduleRequestToken', () => {
  it('normalises a 12-hour slot-chip time to 24-hour, so the token stays two parts', () => {
    expect(rescheduleRequestToken('2026-09-01', '2:30 PM')).toBe('2026-09-01 14:30');
    expect(rescheduleRequestToken('2026-09-01', '2:30 PM').split(' ')).toHaveLength(2);
  });

  it('passes a 24-hour custom-picker time through unchanged', () => {
    expect(rescheduleRequestToken('2026-09-01', '14:30')).toBe('2026-09-01 14:30');
    expect(rescheduleRequestToken('2026-09-01', '09:05')).toBe('2026-09-01 09:05');
  });

  it('keeps midnight and midday the right way round', () => {
    expect(rescheduleRequestToken('2026-09-01', '12:00 AM')).toBe('2026-09-01 00:00');
    expect(rescheduleRequestToken('2026-09-01', '12:00 PM')).toBe('2026-09-01 12:00');
  });

  it('passes an unparseable time through rather than throwing mid-submit', () => {
    expect(rescheduleRequestToken('2026-09-01', 'whenever')).toBe('2026-09-01 whenever');
  });
});

describe('parseRescheduleRequestToken', () => {
  it('round-trips its own token', () => {
    expect(parseRescheduleRequestToken(rescheduleRequestToken('2026-09-01', '2:30 PM')))
      .toEqual(['2026-09-01', '14:30']);
  });

  it('splits on the first space only, so a legacy 12-hour token keeps its meridiem', () => {
    expect(parseRescheduleRequestToken('2026-09-01 2:30 PM')).toEqual(['2026-09-01', '2:30 PM']);
  });

  it('returns an empty time for a date-only token', () => {
    expect(parseRescheduleRequestToken('2026-09-01')).toEqual(['2026-09-01', '']);
  });
});
