import { PRICE_BANDS, rangeForBands, tierForBands } from '../constants/priceBands';
import { resolveProviderPriceRange } from '../utils/providerPriceMatch';

it('spans from the lowest band picked to the highest, in any order', () => {
  expect(rangeForBands(['100_150', '25_50'])).toEqual({ min: 25, max: 150 });
});

it('has no range with nothing picked', () => {
  expect(rangeForBands([])).toBeNull();
  expect(rangeForBands(null)).toBeNull();
});

it('keeps the bands in order with no gaps', () => {
  PRICE_BANDS.slice(1).forEach((band, i) => expect(band.range.min).toBe(PRICE_BANDS[i]!.range.max));
});

it('keeps the older tier in step with the lowest band', () => {
  expect(tierForBands(['25_50', '300_plus'])).toBe('budget');
  expect(tierForBands(['50_75'])).toBe('mid');
  expect(tierForBands(['75_100'])).toBe('premium');
  expect(tierForBands(['150_200'])).toBe('luxury');
  expect(tierForBands([])).toBe('');
});

it('prefers real prices, then bands, then the older tier', () => {
  const real = { min: 40, max: 60 };
  expect(resolveProviderPriceRange(real, 'luxury', ['300_plus'])).toEqual(real);
  expect(resolveProviderPriceRange(null, 'luxury', ['25_50'])).toEqual({ min: 25, max: 50 });
  expect(resolveProviderPriceRange(null, 'mid', [])).toEqual({ min: 35, max: 65 });
});
