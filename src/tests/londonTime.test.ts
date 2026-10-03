import { londonWallTimeToUtcMs } from '../../supabase/functions/_shared/londonTime';

describe('londonWallTimeToUtcMs', () => {
  it('treats winter times as UTC', () => {
    expect(new Date(londonWallTimeToUtcMs('2026-01-15', '17:00')).toISOString()).toBe('2026-01-15T17:00:00.000Z');
  });

  it('takes an hour off during British Summer Time', () => {
    expect(new Date(londonWallTimeToUtcMs('2026-07-01', '17:00:00')).toISOString()).toBe('2026-07-01T16:00:00.000Z');
  });

  it('is right on both sides of the clock changes', () => {
    // Clocks go forward 29 Mar 2026 01:00 UTC, back 25 Oct 2026 01:00 UTC.
    expect(new Date(londonWallTimeToUtcMs('2026-03-29', '00:30')).toISOString()).toBe('2026-03-29T00:30:00.000Z');
    expect(new Date(londonWallTimeToUtcMs('2026-03-29', '03:00')).toISOString()).toBe('2026-03-29T02:00:00.000Z');
    expect(new Date(londonWallTimeToUtcMs('2026-10-25', '00:30')).toISOString()).toBe('2026-10-24T23:30:00.000Z');
    expect(new Date(londonWallTimeToUtcMs('2026-10-25', '03:00')).toISOString()).toBe('2026-10-25T03:00:00.000Z');
  });

  it('returns NaN for junk', () => {
    expect(londonWallTimeToUtcMs('not-a-date', '17:00')).toBeNaN();
  });
});
