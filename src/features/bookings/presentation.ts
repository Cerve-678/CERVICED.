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
