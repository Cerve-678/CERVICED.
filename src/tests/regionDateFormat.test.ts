import { formatShortDate, dateOrderForRegion } from '../utils/dateUtils';
import { getRegion, setRegion } from '../utils/regionStore';

// 14 October 2026 — 14 > 12, so DMY vs MDY order is unambiguous.
const SAMPLE = new Date(2026, 9, 14);

describe('region-aware numeric date', () => {
  afterEach(() => {
    // Reset the module store so tests don't leak region state into each other.
    setRegion('GB');
  });

  describe('dateOrderForRegion', () => {
    it('maps UK/IE/AU/CA to DMY and US to MDY', () => {
      expect(dateOrderForRegion('GB')).toBe('DMY');
      expect(dateOrderForRegion('IE')).toBe('DMY');
      expect(dateOrderForRegion('AU')).toBe('DMY');
      expect(dateOrderForRegion('CA')).toBe('DMY');
      expect(dateOrderForRegion('US')).toBe('MDY');
    });

    it('defaults an unknown region to DMY', () => {
      expect(dateOrderForRegion('ZZ')).toBe('DMY');
    });
  });

  describe('formatShortDate with an explicit region', () => {
    it('formats GB as DD/MM/YYYY', () => {
      expect(formatShortDate(SAMPLE, 'GB')).toBe('14/10/2026');
    });

    it('formats US as MM/DD/YYYY', () => {
      expect(formatShortDate(SAMPLE, 'US')).toBe('10/14/2026');
    });

    it('zero-pads single-digit day and month', () => {
      expect(formatShortDate(new Date(2026, 0, 3), 'GB')).toBe('03/01/2026');
      expect(formatShortDate(new Date(2026, 0, 3), 'US')).toBe('01/03/2026');
    });

    it('accepts a YYYY-MM-DD string without a UTC day shift', () => {
      expect(formatShortDate('2026-10-14', 'US')).toBe('10/14/2026');
    });
  });

  describe('formatShortDate reading the module store', () => {
    it('defaults to GB order', () => {
      expect(getRegion()).toBe('GB');
      expect(formatShortDate(SAMPLE)).toBe('14/10/2026');
    });

    it('follows the store once the region changes', () => {
      setRegion('US');
      expect(formatShortDate(SAMPLE)).toBe('10/14/2026');
      setRegion('GB');
      expect(formatShortDate(SAMPLE)).toBe('14/10/2026');
    });
  });
});
