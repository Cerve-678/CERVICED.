import {
  bookableDayCount,
  isBeyondHorizon,
  lastBookableDate,
  nextReleaseMoment,
} from '../utils/bookingHorizon';

// Must agree with public.provider_last_bookable_date(), which the booking
// trigger enforces. If these drift, the picker offers dates the server rejects
// (or hides dates it would take).
const ymd = (d: Date | null) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null;

describe('rolling window (no release day)', () => {
  const now = new Date('2026-10-26T12:00:00Z');

  it('is today + booking_window_days, inclusive', () => {
    expect(ymd(lastBookableDate({ booking_window_days: 30 }, now))).toBe('2026-11-25');
    expect(bookableDayCount({ booking_window_days: 30 }, now)).toBe(31);
  });

  it('defaults a missing window to 60 days, like the trigger', () => {
    expect(ymd(lastBookableDate({}, now))).toBe('2026-12-25');
  });

  it('treats 0 as no limit', () => {
    expect(lastBookableDate({ booking_window_days: 0 }, now)).toBeNull();
    expect(bookableDayCount({ booking_window_days: 0 }, now)).toBeNull();
    expect(isBeyondHorizon({ booking_window_days: 0 }, '2030-01-01', now)).toBe(false);
  });
});

describe('monthly release', () => {
  it('stays on this month until the release day at 09:00 UTC', () => {
    const settings = { booking_window_days: 30, schedule_release_day: 20 };
    expect(ymd(lastBookableDate(settings, new Date('2026-10-20T08:59:00Z')))).toBe('2026-10-31');
    expect(isBeyondHorizon(settings, '2026-11-01', new Date('2026-10-20T08:59:00Z'))).toBe(true);
  });

  it('opens all of next month at the release moment, ignoring the rolling window', () => {
    const settings = { booking_window_days: 30, schedule_release_day: 20 };
    expect(ymd(lastBookableDate(settings, new Date('2026-10-20T09:00:00Z')))).toBe('2026-11-30');
    expect(isBeyondHorizon(settings, '2026-11-30', new Date('2026-10-20T09:00:00Z'))).toBe(false);
    expect(isBeyondHorizon(settings, '2026-12-01', new Date('2026-10-20T09:00:00Z'))).toBe(true);
  });

  it('clamps a release day past the end of a short month to its last day', () => {
    const settings = { schedule_release_day: 31 };
    expect(ymd(lastBookableDate(settings, new Date('2026-11-30T08:00:00Z')))).toBe('2026-11-30');
    expect(ymd(lastBookableDate(settings, new Date('2026-11-30T09:00:00Z')))).toBe('2026-12-31');
    expect(ymd(lastBookableDate(settings, new Date('2027-02-28T10:00:00Z')))).toBe('2027-03-31');
  });

  it('crosses the year end', () => {
    expect(ymd(lastBookableDate({ schedule_release_day: 5 }, new Date('2026-12-10T12:00:00Z')))).toBe('2027-01-31');
  });

  it('counts today in the bookable days', () => {
    expect(bookableDayCount({ schedule_release_day: 20 }, new Date('2026-10-31T12:00:00Z'))).toBe(31);
  });
});

describe('nextReleaseMoment', () => {
  it('is this month before the release, next month after', () => {
    expect(nextReleaseMoment(20, new Date('2026-10-19T12:00:00Z')).toISOString()).toBe('2026-10-20T09:00:00.000Z');
    expect(nextReleaseMoment(20, new Date('2026-10-20T09:00:00Z')).toISOString()).toBe('2026-11-20T09:00:00.000Z');
    expect(nextReleaseMoment(31, new Date('2027-01-31T10:00:00Z')).toISOString()).toBe('2027-02-28T09:00:00.000Z');
  });
});
