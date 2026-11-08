import { formatDayOrdinalShortMonth } from '../utils/dateUtils';

/** The provider receipt's headline date: "Thursday 3rd Oct". */
describe('formatDayOrdinalShortMonth', () => {
  it('gives the full weekday, an ordinal day and a short month, no year', () => {
    expect(formatDayOrdinalShortMonth('2026-10-01')).toBe('Thursday 1st Oct');
    expect(formatDayOrdinalShortMonth('2026-10-22')).toBe('Thursday 22nd Oct');
    expect(formatDayOrdinalShortMonth('2026-11-13')).toBe('Friday 13th Nov');
  });

  it('reads a YYYY-MM-DD string as a local date, not UTC', () => {
    expect(formatDayOrdinalShortMonth('2026-01-01')).toBe('Thursday 1st Jan');
  });
});
