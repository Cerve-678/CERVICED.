// The price bands a provider can say their services sit in. They pick as many
// as apply, stored in providers.price_bands. Search only uses them for a
// provider with no priced services yet: real prices always win.
import type { PriceRange, PriceTier } from '../utils/providerPriceMatch';

export const PRICE_BANDS = [
  { value: 'under_25', label: 'Under £25', range: { min: 0, max: 25 } },
  { value: '25_50', label: '£25–£50', range: { min: 25, max: 50 } },
  { value: '50_75', label: '£50–£75', range: { min: 50, max: 75 } },
  { value: '75_100', label: '£75–£100', range: { min: 75, max: 100 } },
  { value: '100_150', label: '£100–£150', range: { min: 100, max: 150 } },
  { value: '150_200', label: '£150–£200', range: { min: 150, max: 200 } },
  { value: '200_300', label: '£200–£300', range: { min: 200, max: 300 } },
  { value: '300_plus', label: '£300+', range: { min: 300, max: 9999 } },
] as const;

export type PriceBand = (typeof PRICE_BANDS)[number]['value'];

/** The span from the lowest band picked to the highest, or null with none. */
export function rangeForBands(bands: readonly string[] | null | undefined): PriceRange | null {
  const picked = PRICE_BANDS.filter(band => bands?.includes(band.value));
  if (picked.length === 0) return null;
  return { min: picked[0]!.range.min, max: picked[picked.length - 1]!.range.max };
}

/** providers.price_tier, which Home's filter still reads, from the lowest band picked. */
export function tierForBands(bands: readonly string[]): PriceTier | '' {
  const range = rangeForBands(bands);
  if (!range) return '';
  if (range.min < 35) return 'budget';
  if (range.min < 65) return 'mid';
  if (range.min < 100) return 'premium';
  return 'luxury';
}
