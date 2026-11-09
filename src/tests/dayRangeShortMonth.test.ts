import { describe, expect, it } from '@jest/globals';
import { formatDayRangeShortMonth } from '../utils/dateUtils';

describe('formatDayRangeShortMonth', () => {
  it('names the month once inside one month', () => {
    expect(formatDayRangeShortMonth('2026-11-09', '2026-11-15')).toBe('9 – 15 Nov');
  });

  it('names both months when the week crosses one', () => {
    expect(formatDayRangeShortMonth('2026-11-30', '2026-12-06')).toBe('30 Nov – 6 Dec');
  });

  it('names both months when the week crosses a year', () => {
    expect(formatDayRangeShortMonth('2026-12-28', '2027-01-03')).toBe('28 Dec – 3 Jan');
  });
});
