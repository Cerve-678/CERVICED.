import { formatMiles, KM_PER_MILE } from '../utils/distance';

it('reads distances in miles, with a decimal only while it matters', () => {
  expect(formatMiles(0.5)).toBe('0.3 mi');
  expect(formatMiles(3.2 * KM_PER_MILE)).toBe('3.2 mi');
  expect(formatMiles(12.4 * KM_PER_MILE)).toBe('12 mi');
});
