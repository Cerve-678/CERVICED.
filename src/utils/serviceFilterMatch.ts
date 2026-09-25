// src/utils/serviceFilterMatch.ts
// Judging Search's service-level filters against ONE service at a time.
//
// Price, audience and availability used to be decided per provider, each on its
// own: a provider passed "under £60" because one service was cheap, "for men"
// because a different one was tagged so, and "available now" because their
// diary had room for something. Nothing established that a single service was
// all three, so a client could be shown a provider — and a price — for a
// combination that provider doesn't actually offer.
//
// Here a service must satisfy EVERY active criterion itself, and the cheapest
// service that does is the one the card shows and Book Now opens.
//
// Provider-level filters (rating, distance, city, hair type, category, business
// type) stay provider-level: they are properties of the provider, not of a
// service, and are applied by the caller.
//
// TO ADD SKIN TONE when the skin-tone filter reaches main: add
// `skinTone?: string` to ServiceFilterCriteria, `skinTonesSuitable` to
// FilterableService, and one clause to serviceMatchesCriteria using
// matchesSkinTone(service.skinTonesSuitable, criteria.skinTone). It is a
// per-service column already, so it slots in exactly like audience.

import { priceRangeMatchesBucket, type PriceRange } from './providerPriceMatch';

export interface FilterableService {
  id: string;
  price: number;
  /** Top of a "from £x to £y" price; null for a fixed price. */
  priceMax: number | null;
  /** 'women' | 'men' | 'kids' | 'everyone', or null when untagged. */
  audience: string | null;
}

export interface ServiceFilterCriteria {
  /** The price bucket the client picked; the service's own £ range must overlap it. */
  priceBucket?: PriceRange | undefined;
  /** The audience the client picked; the service must carry exactly that tag. An
   *  untagged service does not match — the same rule the provider-level filter used. */
  audience?: string | undefined;
  /** Services known to have an open slot this week. When set, the service must be in it. */
  availableServiceIds?: ReadonlySet<string> | undefined;
}

/** True when at least one service-level filter is on. */
export function hasServiceCriteria(criteria: ServiceFilterCriteria): boolean {
  return !!criteria.priceBucket || !!criteria.audience || !!criteria.availableServiceIds;
}

/** The £ range one service costs — a fixed price is a range of one. No
 *  provider-tier fallback here: that stands in for a provider with NO priced
 *  services, and a service always has a price. */
export function serviceRange(service: Pick<FilterableService, 'price' | 'priceMax'>): PriceRange {
  return { min: service.price, max: service.priceMax ?? service.price };
}

/** £min–£max across a set of services, null when there are none. */
export function priceRangeAcrossServices(
  services: readonly Pick<FilterableService, 'price' | 'priceMax'>[],
): PriceRange | null {
  let range: PriceRange | null = null;
  for (const service of services) {
    const own = serviceRange(service);
    range = range
      ? { min: Math.min(range.min, own.min), max: Math.max(range.max, own.max) }
      : own;
  }
  return range;
}

/** Does this ONE service satisfy every active criterion? */
export function serviceMatchesCriteria(
  service: FilterableService,
  criteria: ServiceFilterCriteria,
): boolean {
  if (criteria.priceBucket && !priceRangeMatchesBucket(serviceRange(service), criteria.priceBucket)) {
    return false;
  }
  if (criteria.audience && service.audience !== criteria.audience) return false;
  if (criteria.availableServiceIds && !criteria.availableServiceIds.has(service.id)) return false;
  return true;
}

/**
 * The service to show for a provider: the cheapest one that satisfies every
 * active criterion, or null when none does (the provider is filtered out).
 * Ties break on id so the choice is stable between renders.
 */
export function pickMatchingService<T extends FilterableService>(
  services: readonly T[],
  criteria: ServiceFilterCriteria,
): T | null {
  let best: T | null = null;
  for (const service of services) {
    if (!serviceMatchesCriteria(service, criteria)) continue;
    if (
      !best
      || service.price < best.price
      || (service.price === best.price && service.id < best.id)
    ) {
      best = service;
    }
  }
  return best;
}
