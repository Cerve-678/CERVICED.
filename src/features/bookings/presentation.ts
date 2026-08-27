import { formatLongDateNoYear } from '../../utils/dateUtils';

export function formatBookingDate(date: string): string {
  return formatLongDateNoYear(date);
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  NAILS: ['gel', 'acrylic', 'nail', 'manicure', 'pedicure', 'nail art', 'infill', 'sns', 'dip', 'shellac', 'chrome', 'french'],
  HAIR: ['hair', 'cut', 'trim', 'blow dry', 'colour', 'color', 'highlights', 'balayage', 'extension', 'braid', 'cornrow', 'keratin', 'relaxer', 'weave', 'wig', 'loc', 'twist'],
  LASHES: ['lash', 'eyelash', 'classic set', 'hybrid set', 'volume', 'mega volume', 'lash lift', 'lash tint'],
  BROWS: ['brow', 'eyebrow', 'brow wax', 'brow tint', 'henna', 'lamination', 'microblading', 'ombre brow', 'powder brow'],
  MUA: ['makeup', 'make-up', 'mua', 'bridal make', 'glam', 'contour', 'airbrush', 'smokey'],
  AESTHETICS: ['botox', 'filler', 'aesthetic', 'facial', 'peel', 'microneedling', 'dermaplaning', 'thread', 'wax', 'waxing', 'tan', 'tanning', 'massage', 'skin'],
};

/** Resolves legacy booking snapshots to a consistent service category. */
export function resolveServiceCategory(serviceName: string, defaultCategory: string): string {
  if (defaultCategory?.trim()) return defaultCategory.toUpperCase();

  const lower = (serviceName ?? '').toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(keyword => lower.includes(keyword))) return category;
  }
  return 'OTHER';
}

/** The single source of truth for a booking's human-quotable reference.
 *
 *  A client reading a reference off their screen and a provider looking at
 *  the same appointment have to be saying the same string, or the reference
 *  is worse than useless for support. Four screens derived it as
 *  `id.slice(0, 8)` while ProviderHomeScreen used
 *  `id.replace(/-/g,'').substring(0, 10)` — the same booking quoted two
 *  different codes depending on who was looking.
 *
 *  Agreeing on a truncation does not make the truncation safe, though: eight
 *  hex characters collide with 1% probability at ~9,300 bookings. So the
 *  reference is now a real `booking_ref` column — 8 characters of a 30-symbol
 *  alphabet with the ambiguous glyphs removed, behind a UNIQUE index (see
 *  migration 20260827151000).
 *
 *  The fallback is deliberate and load-bearing rather than defensive
 *  clutter: rows written before that migration have no stored ref, and the
 *  old truncation is what was printed on their receipts. Recomputing it means
 *  a client holding a receipt from last month still finds their booking.
 *  Delete the fallback only once no such row can be read.
 */
export function formatBookingRef(
  booking: { bookingRef?: string | null | undefined; id?: string | null | undefined } | null | undefined,
): string {
  const stored = booking?.bookingRef?.trim();
  if (stored) return `${BOOKING_REF_PREFIX}${stored.toUpperCase()}`;
  return (booking?.id ?? '').replace(/-/g, '').slice(0, 8).toUpperCase();
}

/** Display-only. Not stored, so the column stays a clean searchable token. */
export const BOOKING_REF_PREFIX = 'CRV-';
