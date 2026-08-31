import {
  resolveProviderPriceRange,
  priceRangeMatchesBucket,
  priceSortKey,
  PRICE_TIER_RANGES,
} from '../utils/providerPriceMatch';

// The bug this guards: Search's Price filter tested providers.price_tier and
// nothing else, so a provider without one failed every bucket. price_tier is
// NULL for every provider in production, so the filter returned zero results
// while the card beside it displayed a real £ range from a different source.
describe('resolveProviderPriceRange', () => {
  it('prefers real service prices over the self-described tier', () => {
    expect(resolveProviderPriceRange({ min: 40, max: 100 }, 'budget')).toEqual({ min: 40, max: 100 });
  });

  it('falls back to the tier when a provider has no priced services', () => {
    expect(resolveProviderPriceRange(null, 'premium')).toEqual(PRICE_TIER_RANGES.premium);
  });

  it('returns null — not a guess — when neither source knows', () => {
    expect(resolveProviderPriceRange(null, null)).toBeNull();
    expect(resolveProviderPriceRange(undefined, undefined)).toBeNull();
  });

  it('ignores a tier value that is not one of the four buckets', () => {
    expect(resolveProviderPriceRange(null, 'mid-range')).toBeNull();
  });
});

describe('priceRangeMatchesBucket', () => {
  // Tiago Hairs: £40–£100 real, price_tier NULL. Before the fix this provider
  // matched no bucket at all.
  const tiago = resolveProviderPriceRange({ min: 40, max: 100 }, null);

  it('matches a bucket its range overlaps at the bottom', () => {
    expect(priceRangeMatchesBucket(tiago, { min: 25, max: 50 })).toBe(true);
  });

  it('matches a bucket its range overlaps at the top', () => {
    expect(priceRangeMatchesBucket(tiago, { min: 65, max: 100 })).toBe(true);
  });

  it('does not match a bucket entirely below its range', () => {
    expect(priceRangeMatchesBucket(tiago, { min: 0, max: 25 })).toBe(false);
  });

  it('never claims a match for an unknown range', () => {
    expect(priceRangeMatchesBucket(null, { min: 0, max: 9999 })).toBe(false);
  });
});

describe('priceSortKey', () => {
  const wide = { min: 20, max: 178 };

  it('reads the bottom of the range for cheapest-first', () => {
    expect(priceSortKey(wide, 'price-low')).toBe(20);
  });

  it('reads the top of the range for dearest-first', () => {
    expect(priceSortKey(wide, 'price-high')).toBe(178);
  });

  it('returns null for an unknown range so callers can place it last', () => {
    // A sentinel number here would rank an unpriced provider as either the
    // cheapest or the dearest thing on screen — both are claims the app
    // cannot make.
    expect(priceSortKey(null, 'price-low')).toBeNull();
    expect(priceSortKey(null, 'price-high')).toBeNull();
  });
});
