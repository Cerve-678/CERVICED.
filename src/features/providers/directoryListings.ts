import { UK_CITIES } from '../../constants/ukCities';
import { normalizeExternalBookingUrl } from './externalBookingLink';
import { filtersAllowLinkOnly, type LinkOnlyFilterInput } from './linkOnlySearch';

/**
 * Directory listings: businesses imported from public directories that
 * haven't joined CERVICED (providers.is_claimed = false). Clients find them
 * in Search as "Not on CERVICED yet" cards, after every bookable provider,
 * and each opens a read-only listing page whose buttons go to the business's
 * own page and Instagram. Nothing about them is bookable in the app, so they
 * carry no logo, rating, prices or availability.
 */

/** The letter on a listing's grey placeholder logo: the first letter or
 *  digit of its name, so "_hdastyless" shows H rather than an underscore. */
export function listingInitial(name: string): string {
  const chars = Array.from(name.trim());
  const first = chars.find(c => /[a-z0-9]/i.test(c)) ?? chars[0];
  return first ? first.toUpperCase() : '?';
}

/**
 * The cities from the Search City filter that a listing's area text names,
 * so "Lewisham, South London" matches the London filter. Listings have no
 * service-coverage list of their own, only the area text they were imported
 * with.
 */
export function citiesInLocation(locationText: string | null | undefined): string[] {
  if (!locationText) return [];
  return UK_CITIES.filter(city =>
    new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(locationText),
  );
}

export interface DirectoryListingFilterInput extends LinkOnlyFilterInput {
  specialty?: string[];
  distance?: number;
}

/**
 * Whether listings can show under the current Search filters. They match
 * the same filters a link-only provider can (category, area), minus the two
 * they have no data for: specialities and distance (no coordinates). City is
 * matched card by card, against citiesInLocation.
 */
export function filtersAllowDirectoryListings(filters: DirectoryListingFilterInput): boolean {
  return (
    filtersAllowLinkOnly(filters) &&
    !filters.specialty?.length &&
    !(filters.distance != null && filters.distance < 999)
  );
}

export interface ListingLink {
  label: string;
  url: string;
  /** Booking pages open in the in-app browser like a link-only provider's
   *  Book button; social and messaging links open in their own apps. */
  opensInApp: boolean;
}

/**
 * What a listing's website link really is. The import took the link from
 * the business's Instagram bio, which is usually a booking page (Acuity,
 * Linktree, Fresha) but sometimes TikTok or WhatsApp, and those shouldn't be
 * labelled as booking.
 */
export function listingLink(raw: string | null | undefined): ListingLink | null {
  const url = normalizeExternalBookingUrl(raw);
  if (!url) return null;
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
    return { label: 'Open their TikTok', url, opensInApp: false };
  }
  if (host === 'wa.me' || host === 'whatsapp.com' || host.endsWith('.whatsapp.com')) {
    return { label: 'Message on WhatsApp', url, opensInApp: false };
  }
  return { label: 'Book on their page', url, opensInApp: true };
}

/** A listing's Instagram profile URL, or null if the handle isn't one. */
export function listingInstagramUrl(handle: string | null | undefined): string | null {
  const clean = handle?.trim().replace(/^@+/, '');
  if (!clean || !/^[a-z0-9._]+$/i.test(clean)) return null;
  return `https://instagram.com/${clean}`;
}
