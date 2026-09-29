import { formatShortDayDate } from '../utils/dateUtils';

describe('formatShortDayDate', () => {
  it('gives weekday, day and month without a year or ordinal', () => {
    expect(formatShortDayDate('2026-10-03')).toBe('Sat 3 Oct');
    expect(formatShortDayDate('2026-12-25')).toBe('Fri 25 Dec');
  });

  it('reads a YYYY-MM-DD string as a local date, not UTC', () => {
    expect(formatShortDayDate('2026-01-01')).toBe('Thu 1 Jan');
  });

  it('accepts a Date', () => {
    expect(formatShortDayDate(new Date(2026, 8, 27))).toBe('Sun 27 Sep');
  });
});
