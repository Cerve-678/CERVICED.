/**
 * "Products I work with" — the brand chips a provider picks in Services &
 * Pricing, grouped by service category, and the helpers that read and write
 * them.
 *
 * Stored in providers.products_used, a single text column, as a
 * comma-separated list ("Charlotte Tilbury, NARS, Olaplex"). That is the shape
 * the old free-text box already produced, so existing answers load straight
 * into chips: a name that matches a brand here becomes that chip (whatever its
 * casing or accents), and anything else is kept as the provider's own entry.
 *
 * Prescription-only medicines (botulinum toxin brands) are deliberately not
 * offered: UK rules bar advertising them to the public, and a chip on a
 * public profile is advertising. A provider can still type one in, so this is
 * a default, not enforcement.
 */

export const PRODUCT_BRANDS_MAP: Record<string, string[]> = {
  HAIR: [
    'Olaplex', 'K18', 'Kérastase', 'Redken', 'Wella', "L'Oréal Professionnel",
    'Schwarzkopf', 'Davines', 'Moroccanoil', 'Aveda', 'Joico', 'Pureology',
    'Paul Mitchell', 'Mizani', 'Design Essentials', 'Mielle', 'Cantu',
    'SheaMoisture', 'Bouncecurl', 'Cécred', 'Great Lengths', 'ghd', 'Dyson',
  ],
  NAILS: [
    'The GelBottle', 'OPI', 'CND Shellac', 'Gelish', 'Mylee', 'Bio Sculpture',
    'Navy Professional', 'Young Nails', 'NSI', 'Kiara Sky', 'Aprés Gel-X',
    'Light Elegance', 'Semilac', 'Madam Glam', 'Akzentz',
  ],
  LASHES: [
    'Lash FX', 'London Lash', 'SL Lashes', 'Sugarlash Pro', 'Nouveau Lashes',
    'Lash Perfect', 'Elleebana', 'Yumi Lashes', 'InLei', 'Bella Lash',
    'Borboleta',
  ],
  BROWS: [
    'HD Brows', 'Brow Code', 'Elleebana', 'Nouveau Brows', 'RefectoCil',
    'Thuya', 'Bronsun', 'Brow Henna', 'Brow Xenna', 'Everlasting Brows',
    'PhiBrows', 'Perma Blend', 'Anastasia Beverly Hills', 'Benefit',
  ],
  MUA: [
    'Charlotte Tilbury', 'NARS', 'MAC', 'Fenty Beauty', 'Huda Beauty', 'Dior',
    'Laura Mercier', 'Pat McGrath Labs', 'Armani Beauty', 'Rare Beauty',
    'Bobbi Brown', 'Estée Lauder', 'Too Faced', 'Urban Decay', 'Hourglass',
    'Natasha Denona', 'Danessa Myricks', 'Make Up For Ever', 'Inglot',
    'Kryolan', 'Mehron', 'Anastasia Beverly Hills', 'Benefit',
  ],
  AESTHETICS: [
    'Dermalogica', 'ZO Skin Health', 'Obagi', 'Environ', 'SkinCeuticals',
    'Medik8', 'Image Skincare', 'iS Clinical', 'Alumier MD', 'PCA Skin',
    'Murad', 'Elemis', 'HydraFacial', 'Profhilo', 'Juvéderm', 'Restylane',
    'Teoxane',
  ],
  OTHER: [
    'Lycon', 'Australian Bodycare', 'Perron Rigot', 'Hive', 'Tan-Luxe',
    'St. Tropez', 'Sienna X', 'Bondi Sands', 'Elemis', "Neal's Yard Remedies",
  ],
};

const CATEGORY_LABELS: Record<string, string> = {
  HAIR: 'Hair', NAILS: 'Nails', LASHES: 'Lashes', BROWS: 'Brows',
  MUA: 'Makeup', AESTHETICS: 'Skin & aesthetics', OTHER: 'Body & wellness',
};

const CATEGORY_ORDER = Object.keys(PRODUCT_BRANDS_MAP);

/** Folds case, accents and punctuation, so "nars", "N.A.R.S" and "NARS" — or
 *  "Kerastase" and "Kérastase" — are the same brand. */
function brandKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const KNOWN_BRANDS = new Map<string, string>();
for (const brand of CATEGORY_ORDER.flatMap(category => PRODUCT_BRANDS_MAP[category] ?? [])) {
  if (!KNOWN_BRANDS.has(brandKey(brand))) KNOWN_BRANDS.set(brandKey(brand), brand);
}

/** The brand sections to offer a provider: one per service category they
 *  work in, in the app's usual category order. A provider with no category
 *  on file sees every section rather than none. */
export function productBrandSections(
  categories: readonly string[],
): { category: string; label: string; brands: string[] }[] {
  const own = CATEGORY_ORDER.filter(category => categories.includes(category));
  return (own.length > 0 ? own : CATEGORY_ORDER).map(category => ({
    category,
    label: CATEGORY_LABELS[category] ?? category,
    brands: PRODUCT_BRANDS_MAP[category] ?? [],
  }));
}

/** Splits a stored or typed list into brand names: commas, semicolons and
 *  new lines separate entries, a trailing full stop is dropped, a known brand
 *  is spelled the way the list spells it, and repeats are removed. */
export function splitProductsUsed(text: string | null | undefined): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,;\n]/)) {
    const name = raw.trim().replace(/\.+$/, '').trim();
    const key = brandKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(KNOWN_BRANDS.get(key) ?? name);
  }
  return out;
}

/** The value to store: the list joined back into one line, or null for none. */
export function joinProductsUsed(names: readonly string[]): string | null {
  const joined = splitProductsUsed(names.join(', ')).join(', ');
  return joined || null;
}
