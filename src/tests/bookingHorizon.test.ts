import {
  bookableDayCount,
  isBeyondHorizon,
  lastBookableDate,
  nextReleaseMoment,
  whenDateOpens,
  rollingWindowExplainer,
  releaseSettingsPatch,
  releaseTimeLabel,
  toReleaseTime,
  ukOffsetMinutes,
  ukTodayYMD,
  parseBookingWindowDays,
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
  // 20 Oct 2026 is still British Summer Time: 9am UK is 08:00 UTC.
  it('stays on this month until 9am UK time on the release day', () => {
    const settings = { booking_window_days: 30, schedule_release_day: 20 };
    expect(ymd(lastBookableDate(settings, new Date('2026-10-20T07:59:00Z')))).toBe('2026-10-31');
    expect(isBeyondHorizon(settings, '2026-11-01', new Date('2026-10-20T07:59:00Z'))).toBe(true);
  });

  it('opens all of next month at the release moment, ignoring the rolling window', () => {
    const settings = { booking_window_days: 30, schedule_release_day: 20 };
    expect(ymd(lastBookableDate(settings, new Date('2026-10-20T08:00:00Z')))).toBe('2026-11-30');
    expect(isBeyondHorizon(settings, '2026-11-30', new Date('2026-10-20T08:00:00Z'))).toBe(false);
    expect(isBeyondHorizon(settings, '2026-12-01', new Date('2026-10-20T08:00:00Z'))).toBe(true);
  });

  it('opens at the time the provider chose', () => {
    const settings = { schedule_release_day: 14, schedule_release_time: '19:00' };
    expect(ymd(lastBookableDate(settings, new Date('2026-11-14T18:59:00Z')))).toBe('2026-11-30');
    expect(ymd(lastBookableDate(settings, new Date('2026-11-14T19:00:00Z')))).toBe('2026-12-31');
  });

  it('opens a midnight release on the 1st at UK midnight, a UTC hour early in summer', () => {
    const settings = { schedule_release_day: 1, schedule_release_time: '00:00' };
    // 23:30 UTC on 30 Sep is 00:30 on 1 Oct in the UK: October's release has happened.
    expect(ymd(lastBookableDate(settings, new Date('2026-09-30T23:30:00Z')))).toBe('2026-11-30');
    expect(ymd(lastBookableDate(settings, new Date('2026-09-30T22:59:00Z')))).toBe('2026-10-31');
  });

  it('reads an unreadable time as 9am', () => {
    const settings = { schedule_release_day: 14, schedule_release_time: '7pm' };
    expect(ymd(lastBookableDate(settings, new Date('2026-11-14T08:59:00Z')))).toBe('2026-11-30');
    expect(ymd(lastBookableDate(settings, new Date('2026-11-14T09:00:00Z')))).toBe('2026-12-31');
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
    expect(nextReleaseMoment(20, new Date('2026-10-19T12:00:00Z')).toISOString()).toBe('2026-10-20T08:00:00.000Z');
    expect(nextReleaseMoment(20, new Date('2026-10-20T08:00:00Z')).toISOString()).toBe('2026-11-20T09:00:00.000Z');
    expect(nextReleaseMoment(31, new Date('2027-01-31T10:00:00Z')).toISOString()).toBe('2027-02-28T09:00:00.000Z');
  });

  it('uses the chosen time', () => {
    expect(nextReleaseMoment(5, new Date('2026-11-09T12:00:00Z'), '20:30').toISOString()).toBe('2026-12-05T20:30:00.000Z');
    expect(nextReleaseMoment(5, new Date('2027-05-01T12:00:00Z'), '20:30').toISOString()).toBe('2027-05-05T19:30:00.000Z');
  });
});

describe('whenDateOpens', () => {
  const now = new Date('2026-11-03T12:00:00Z');

  it('opens a rolling-window day booking_window_days before it', () => {
    expect(ymd(whenDateOpens({ booking_window_days: 30 }, '2026-12-10', now))).toBe('2026-11-10');
  });

  it('opens a monthly-release day on the release day of the month before', () => {
    const opens = whenDateOpens({ booking_window_days: 30, schedule_release_day: 20 }, '2026-12-10', now);
    expect(opens?.toISOString()).toBe('2026-11-20T09:00:00.000Z');
  });

  it('uses the last day of a short month for a late release day', () => {
    const opens = whenDateOpens({ schedule_release_day: 31 }, '2026-12-10', now);
    expect(opens?.toISOString()).toBe('2026-11-30T09:00:00.000Z');
  });

  it('opens on the chosen time', () => {
    const opens = whenDateOpens({ schedule_release_day: 20, schedule_release_time: '00:00' }, '2026-12-10', now);
    expect(opens?.toISOString()).toBe('2026-11-20T00:00:00.000Z');
  });

  it('has no date when there is no limit', () => {
    expect(whenDateOpens({ booking_window_days: 0 }, '2030-01-01', now)).toBeNull();
  });
});

describe('Scheduling screen: how far ahead clients can book', () => {
  const now = new Date(2026, 10, 3, 12, 0); // Tue 3 Nov 2026, local

  it('explains a rolling window with the date clients can book up to today', () => {
    expect(rollingWindowExplainer(30, now)).toMatch(/^Today clients can book up to Thu,? 3 Dec\. This moves forward one day every day\./);
  });

  it('explains "Any time" as no limit', () => {
    expect(rollingWindowExplainer(0, now)).toBe('Clients can book any date in the future.');
  });

  it('saves "Any time" as 0, not as the 60-day default', () => {
    expect(parseBookingWindowDays('0')).toBe(0);
    expect(parseBookingWindowDays('90')).toBe(90);
    expect(parseBookingWindowDays('')).toBe(60);
  });
});

describe('release time', () => {
  it('reads a stored time, or 9am when there is none', () => {
    expect(toReleaseTime('19:00')).toBe('19:00');
    expect(toReleaseTime(undefined)).toBe('09:00');
    expect(toReleaseTime('25:00')).toBe('09:00');
    expect(toReleaseTime(19)).toBe('09:00');
  });

  it('says the time the way people say it', () => {
    expect(releaseTimeLabel('00:00')).toBe('midnight');
    expect(releaseTimeLabel('09:00')).toBe('9am');
    expect(releaseTimeLabel('09:30')).toBe('9:30am');
    expect(releaseTimeLabel('12:00')).toBe('midday');
    expect(releaseTimeLabel('19:00')).toBe('7pm');
    expect(releaseTimeLabel(null)).toBe('9am');
  });

  it('knows when the UK is on summer time, the same way Postgres does', () => {
    expect(ukOffsetMinutes(new Date('2026-03-29T00:59:00Z'))).toBe(0);
    expect(ukOffsetMinutes(new Date('2026-03-29T01:00:00Z'))).toBe(60);
    expect(ukOffsetMinutes(new Date('2026-10-25T00:59:00Z'))).toBe(60);
    expect(ukOffsetMinutes(new Date('2026-10-25T01:00:00Z'))).toBe(0);
  });

  it('reads the hour the clocks go back as GMT, as Postgres does', () => {
    // '2026-10-25 01:30' AT TIME ZONE 'Europe/London' = 01:30 UTC (checked live).
    expect(nextReleaseMoment(25, new Date('2026-10-01T12:00:00Z'), '01:30').toISOString()).toBe('2026-10-25T01:30:00.000Z');
    // '2026-03-29 01:30' never happens; Postgres reads it as 01:30 UTC too.
    expect(nextReleaseMoment(29, new Date('2026-03-01T12:00:00Z'), '01:30').toISOString()).toBe('2026-03-29T01:30:00.000Z');
  });
});

describe('releaseSettingsPatch: a save writes only what changed on that screen', () => {
  const loaded = { day: 14, time: '09:00' };

  it('writes nothing when nothing changed', () => {
    expect(releaseSettingsPatch(loaded, { day: 14, time: '09:00' })).toBeNull();
  });

  it('writes just the time when only the time changed', () => {
    expect(releaseSettingsPatch(loaded, { day: 14, time: '19:00' })).toEqual({ set: { scheduleReleaseTime: '19:00' }, remove: [] });
  });

  it('writes just the day when only the day changed', () => {
    expect(releaseSettingsPatch(loaded, { day: 5, time: '09:00' })).toEqual({ set: { scheduleReleaseDay: 5 }, remove: [] });
  });

  it('removes the day but keeps the time when going back to a rolling window', () => {
    expect(releaseSettingsPatch(loaded, { day: null, time: '19:00' })).toEqual({ set: {}, remove: ['scheduleReleaseDay'] });
  });
});

describe('ukTodayYMD', () => {
  it('is the UK date, not the UTC one, just after midnight in summer', () => {
    // 00:30 BST on 2 July is still 1 July in UTC.
    expect(ukTodayYMD(new Date('2026-07-01T23:30:00Z'))).toBe('2026-07-02');
  });
  it('matches the UTC date in winter', () => {
    expect(ukTodayYMD(new Date('2026-12-01T23:30:00Z'))).toBe('2026-12-01');
  });
});
