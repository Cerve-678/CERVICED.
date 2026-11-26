// src/utils/serviceFilterMatch.ts
// Judging Search's service-level filters against ONE service at a time.
//
// Price, audience and skin tone used to be decided per provider, each on its
// own: a provider passed "under £30" because one service was cheap and "for
// women" because a different one was tagged so. Nothing established that a
// single service was both, so a client could be shown a provider for a
// combination that provider doesn't offer — and a typed search ("braids") was
// ignored entirely, so a £20 wash let a £120-braids provider through "<£30".
//
// Here a service must satisfy EVERY active criterion itself. When the client
// typed a query, only the services that matched it count (see
// candidateServices) — the filters narrow the search, they don't look past it.
//
// Provider-level filters (rating, distance, city, hair type, speciality,
// business type, availability) stay provider-level and are applied by the
// caller.

import { matchesSkinTone } from '../constants/skinTones';
import { priceRangeMatchesBucket, type PriceRange } from './providerPriceMatch';

export interface FilterableService {
  id: string;
  price: number | null;
  /** Top of a "from £x to £y" price; null for a fixed price. */
  priceMax: number | null;
  /** 'women' | 'men' | 'kids' | 'everyone', or null when untagged. */
  audience: string | null;
  skinTones: readonly string[];
}

export interface ServiceFilterCriteria {
  /** The service's own £ range must overlap this bucket. */
  priceBucket?: PriceRange | undefined;
  /** The service must carry exactly this tag — untagged doesn't match, the
   *  same rule the provider-level filter used. */
  audience?: string | undefined;
  skinTone?: string | undefined;
}

export function hasServiceCriteria(criteria: ServiceFilterCriteria): boolean {
  return !!criteria.priceBucket || !!criteria.audience || !!criteria.skinTone;
}

/** The £ range one service costs — a fixed price is a range of one. null when
 *  the service has no price, which never matches a price bucket. */
export function serviceRange(service: Pick<FilterableService, 'price' | 'priceMax'>): PriceRange | null {
  if (service.price == null) return null;
  return { min: service.price, max: service.priceMax ?? service.price };
}

export function serviceMatchesCriteria(
  service: FilterableService,
  criteria: ServiceFilterCriteria,
): boolean {
  if (criteria.priceBucket && !priceRangeMatchesBucket(serviceRange(service), criteria.priceBucket)) {
    return false;
  }
  if (criteria.audience && service.audience !== criteria.audience) return false;
  if (criteria.skinTone && !matchesSkinTone(service.skinTones, criteria.skinTone)) return false;
  return true;
}

/**
 * The services a provider is judged on. When a typed query matched some of
 * this provider's services, only those — otherwise a cheap unrelated service
 * answers for the one the client searched for. A provider that matched by
 * name or category alone (no matched services) is judged on their whole menu.
 */
export function candidateServices<T extends FilterableService>(
  services: readonly T[],
  queryMatchedIds: ReadonlySet<string> | undefined,
): readonly T[] {
  if (!queryMatchedIds || queryMatchedIds.size === 0) return services;
  return services.filter(s => queryMatchedIds.has(s.id));
}

/** £min–£max across the services that pass, null when none has a price. */
export function priceRangeAcrossServices(services: readonly FilterableService[]): PriceRange | null {
  let range: PriceRange | null = null;
  for (const service of services) {
    const own = serviceRange(service);
    if (!own) continue;
    range = range
      ? { min: Math.min(range.min, own.min), max: Math.max(range.max, own.max) }
      : own;
  }
  return range;
}
