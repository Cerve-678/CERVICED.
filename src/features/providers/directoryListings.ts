import { normalizeExternalBookingUrl } from './externalBookingLink';
import { filtersAllowLinkOnly, type LinkOnlyFilterInput } from './linkOnlySearch';
import { ALL_SERVICE_TYPE_OPTS } from '../business-details/options';
import { tr } from '../../i18n/translate';

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

export interface DirectoryListingFilterInput extends LinkOnlyFilterInput {
  specialty?: string[];
  distance?: number;
}

/**
 * Whether listings can show under the current Search filters. They match
 * the same filters a link-only provider can (category, area), minus the two
 * they have no data for: specialities and distance (no coordinates). City is
 * matched card by card, against each listing's area text.
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
    return { label: tr('discover.page.openTheirTiktok'), url, opensInApp: false };
  }
  if (host === 'wa.me' || host === 'whatsapp.com' || host.endsWith('.whatsapp.com')) {
    return { label: tr('discover.page.messageOnWhatsapp'), url, opensInApp: false };
  }
  return { label: tr('discover.page.bookOnTheirPage'), url, opensInApp: true };
}

/** A listing's Instagram profile URL, or null if the handle isn't one. */
export function listingInstagramUrl(handle: string | null | undefined): string | null {
  const clean = handle?.trim().replace(/^@+/, '');
  if (!clean || !/^[a-z0-9._]+$/i.test(clean)) return null;
  return `https://instagram.com/${clean}`;
}

/** A listing's category as the app writes it elsewhere ("MUA" → "Makeup"),
 *  or the raw value for one the app doesn't know. */
export function listingCategoryLabel(category: string): string {
  return ALL_SERVICE_TYPE_OPTS.find(opt => opt.value === category)?.label ?? category;
}

/** What the business says it does ("Wigs"), from the import's service type,
 *  or null when it only repeats the category ("Lashes" on a LASHES listing). */
export function listingServiceKind(customServiceType: string | null | undefined, category: string): string | null {
  const kind = customServiceType?.trim();
  if (!kind) return null;
  const same = (a: string) => a.toLowerCase() === kind.toLowerCase();
  return same(category) || same(listingCategoryLabel(category)) ? null : kind;
}

/**
 * The notice on a listing's page. Legal-adjacent: it mirrors Client Terms §6
 * on cerviced.co/legal (not partnered, not bookable in the app, their booking
 * page isn't run by CERVICED, details may be out of date, claim or email to
 * correct or remove). Wording is the product owner's (2026-11-24); see
 * LEGAL-COMPLIANCE-NOTES §29 before changing it.
 */
export function listingNotice(hasLink: boolean): string {
  return [
    "This business hasn't joined or partnered with CERVICED, so you can't book it in the app.",
    hasLink
      ? "You book on their own page, which CERVICED doesn't run."
      : 'To book, get in touch with them on Instagram.',
    'Details come from public directories and may be out of date.',
    "If it's your business, claim it below, or email support@cerviced.co to have it corrected or removed.",
    'We list beauty businesses so beauty lovers can find them in one place.',
    'Press Nudge if you want them on the app.',
  ].join(' ');
}

/** The line an owner sees on the claim screen, or null with no nudges yet. */
export function listingNudgeLine(people: number): string | null {
  if (!Number.isFinite(people) || people < 1) return null;
  return people === 1
    ? '1 beauty lover has nudged you to join CERVICED.'
    : `${Math.floor(people)} beauty lovers have nudged you to join CERVICED.`;
}
