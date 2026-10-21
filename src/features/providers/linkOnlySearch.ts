/**
 * Which Search filters a link-only provider can match.
 *
 * A link-only provider (booking_mode 'external') appears in Search only by
 * category, speciality, area and accessibility (product owner, 2026-10-17).
 * Everything else Search filters on is CERVICED-booking data they don't have
 * — live availability, prices from a service list, ratings, per-service hair
 * type / skin tone / audience tags, and the practice details tied to taking
 * bookings here. So as soon as any of those filters is on, link-only
 * providers drop out rather than being judged on data that isn't there.
 *
 * Category is applied server-side, before this runs; sorting never removes
 * anyone.
 */
export interface LinkOnlyFilterInput {
  rating?: number;
  priceRange?: { min: number; max: number };
  availableOnly?: boolean;
  serviceType?: string;
  hairType?: string;
  skinTone?: string;
  audience?: string;
  walkInsWelcome?: boolean;
  groupBookingsAvailable?: boolean;
  veganCrueltyFree?: boolean;
}

export function filtersAllowLinkOnly(filters: LinkOnlyFilterInput): boolean {
  return !(
    (filters.rating != null && filters.rating > 0) ||
    !!filters.priceRange ||
    !!filters.availableOnly ||
    (!!filters.serviceType && filters.serviceType !== 'all') ||
    !!filters.hairType ||
    !!filters.skinTone ||
    !!filters.audience ||
    !!filters.walkInsWelcome ||
    !!filters.groupBookingsAvailable ||
    !!filters.veganCrueltyFree
  );
}
