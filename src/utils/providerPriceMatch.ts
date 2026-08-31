// src/utils/providerPriceMatch.ts
// Resolving what a provider costs, for Search's Price filter and price sort.
//
// Two sources exist and they are NOT interchangeable:
//
//   priceRange — the real £min–£max across a provider's active services,
//                resolved per result set by getProviderPriceRanges(). This is
//                the number the provider card actually prints.
//   priceTier  — providers.price_tier, a coarse four-bucket self-description
//                the provider optionally picks once at registration.
//
// The filter used to test the tier and nothing else, rejecting any provider
// without one. price_tier is NULL for every provider in production, so every
// price bucket returned zero results while the card beside it went on showing
// a real range from the other source — a client saw "£40–£100", tapped
// "£25–£50", and got "No providers found".
//
// Real service prices win. The tier is a fallback for a provider whose
// services aren't priced yet, not the primary answer.

export type PriceTier = 'budget' | 'mid' | 'premium' | 'luxury';
export type PriceRange = { min: number; max: number };

/** £ span each providers.price_tier value stands for, used only when a
 *  provider has no priced services to derive a real range from. */
export const PRICE_TIER_RANGES: Record<PriceTier, PriceRange> = {
  budget:  { min: 15,  max: 35 },
  mid:     { min: 35,  max: 65 },
  premium: { min: 65,  max: 100 },
  luxury:  { min: 100, max: 9999 },
};

const isPriceTier = (value: string): value is PriceTier =>
  Object.prototype.hasOwnProperty.call(PRICE_TIER_RANGES, value);

/**
 * The £ range to judge a provider by — real service prices first, the
 * self-described tier as a fallback, null when neither is known.
 *
 * null means "no answer yet", never "free" or "no match" — callers must not
 * collapse it into a number, or an unpriced provider silently sorts as £0.
 */
export function resolveProviderPriceRange(
  priceRange: PriceRange | null | undefined,
  priceTier: string | null | undefined,
): PriceRange | null {
  if (priceRange) return priceRange;
  if (priceTier && isPriceTier(priceTier)) return PRICE_TIER_RANGES[priceTier];
  return null;
}

/**
 * Does a provider's range overlap the bucket the client picked?
 *
 * Overlap, not a midpoint test: a provider spanning £40–£100 legitimately
 * belongs in both "£25–£50" and "£65–£100", and a midpoint would drop them
 * from both. An unknown range is never claimed as a match.
 */
export function priceRangeMatchesBucket(
  range: PriceRange | null,
  bucket: PriceRange,
): boolean {
  if (!range) return false;
  return range.min <= bucket.max && range.max >= bucket.min;
}

/**
 * Sort key for the price sorts — cheapest-first reads the bottom of a
 * provider's range, dearest-first reads the top, so a wide-range provider
 * isn't judged by the same end of it in both directions.
 *
 * Returns null for an unknown range so callers can place those last rather
 * than letting a sentinel number rank them as free or infinitely expensive.
 */
export function priceSortKey(
  range: PriceRange | null,
  direction: 'price-low' | 'price-high',
): number | null {
  if (!range) return null;
  return direction === 'price-high' ? range.max : range.min;
}
