// Business-name font choices for the provider Branding screen. Each key is
// stored in providers.brand_font. These fonts apply only to the provider's
// display name, never to body text or app chrome.
//
// Every fontFamily here must be loaded in App.tsx's useFonts, or the name
// silently falls back to the system font.

export type FontCollectionKey = 'editorial' | 'signature' | 'modern' | 'statement' | 'soft' | 'classics';

/** The picker shows the fonts in these groups, in this order. The five named
 *  collections hold the owner's picks from 2026-11-03
 *  (https://claude.ai/artifact/Fo89nJmKeBoM69qD2mVCL9); Classics holds the
 *  fonts that were here before them. */
export const FONT_COLLECTIONS: { key: FontCollectionKey; name: string; description: string }[] = [
  { key: 'editorial', name: 'Editorial', description: 'Magazine-cover serifs' },
  { key: 'signature', name: 'Signature', description: 'Handwritten scripts' },
  { key: 'modern',    name: 'Modern',    description: 'Clean sans-serifs with a twist' },
  { key: 'statement', name: 'Statement', description: 'Art-deco and poster faces' },
  { key: 'soft',      name: 'Soft',      description: 'Rounded and friendly' },
  { key: 'classics',  name: 'Classics',  description: 'The original CERVICED fonts' },
];

export interface ProviderFontOption {
  key: string;
  name: string;
  fontFamily: string;
  collection: FontCollectionKey;
  /** Thin scripts read much smaller than a serif at the same point size, so
   *  they're drawn this much larger wherever the name is shown big. */
  sizeScale?: number;
}

export const DEFAULT_PROVIDER_FONT = 'default';

export const PROVIDER_FONTS: ProviderFontOption[] = [
  { key: 'playfair-display', name: 'Playfair Display', fontFamily: 'PlayfairDisplay_700Bold', collection: 'editorial' },
  { key: 'italiana',         name: 'Italiana',         fontFamily: 'Italiana_400Regular',     collection: 'editorial' },
  { key: 'great-vibes',      name: 'Great Vibes',      fontFamily: 'GreatVibes_400Regular',   collection: 'signature', sizeScale: 1.2 },
  { key: 'pinyon-script',    name: 'Pinyon Script',    fontFamily: 'PinyonScript_400Regular', collection: 'signature', sizeScale: 1.2 },
  { key: 'sacramento',       name: 'Sacramento',       fontFamily: 'Sacramento_400Regular',   collection: 'signature', sizeScale: 1.3 },
  { key: 'syne',             name: 'Syne',             fontFamily: 'Syne_700Bold',            collection: 'modern' },
  { key: 'josefin-sans',     name: 'Josefin Sans',     fontFamily: 'JosefinSans_600SemiBold', collection: 'modern' },
  { key: 'tenor-sans',       name: 'Tenor Sans',       fontFamily: 'TenorSans_400Regular',    collection: 'modern' },
  { key: 'poiret-one',       name: 'Poiret One',       fontFamily: 'PoiretOne_400Regular',    collection: 'statement' },
  { key: 'limelight',        name: 'Limelight',        fontFamily: 'Limelight_400Regular',    collection: 'statement' },
  { key: 'shrikhand',        name: 'Shrikhand',        fontFamily: 'Shrikhand_400Regular',    collection: 'statement' },
  { key: 'bebas-neue',       name: 'Bebas Neue',       fontFamily: 'BebasNeue_400Regular',    collection: 'statement' },
  { key: 'fredoka',          name: 'Fredoka',          fontFamily: 'Fredoka_600SemiBold',     collection: 'soft' },
  { key: 'comfortaa',        name: 'Comfortaa',        fontFamily: 'Comfortaa_700Bold',       collection: 'soft' },
  { key: 'pacifico',         name: 'Pacifico',         fontFamily: 'Pacifico_400Regular',     collection: 'soft' },
  { key: 'default', name: 'Classic', fontFamily: 'Prata-Regular', collection: 'classics' },
  { key: 'lobster', name: 'Rounded Script', fontFamily: 'Lobster_400Regular', collection: 'classics' },
  { key: 'dancing-script', name: 'Elegant Script', fontFamily: 'DancingScript_700Bold', collection: 'classics' },
  { key: 'bungee', name: 'Bold Display', fontFamily: 'Bungee_400Regular', collection: 'classics' },
  { key: 'righteous', name: 'Confident', fontFamily: 'Righteous_400Regular', collection: 'classics' },
  { key: 'sniglet', name: 'Bubbly', fontFamily: 'Sniglet_800ExtraBold', collection: 'classics' },
  { key: 'baloo-2', name: 'Chunky & Rounded', fontFamily: 'Baloo2_700Bold', collection: 'classics' },
  { key: 'varela-round', name: 'Smooth & Rounded', fontFamily: 'VarelaRound_400Regular', collection: 'classics' },
  { key: 'bakbak', name: 'Bakbak', fontFamily: 'BakbakOne-Regular', collection: 'classics' },
];

const DEFAULT_FONT_FAMILY = 'Prata-Regular';

export function resolveProviderFontFamily(key: string | null | undefined): string {
  return PROVIDER_FONTS.find(font => font.key === key)?.fontFamily ?? DEFAULT_FONT_FAMILY;
}

/** How much larger than the usual size to draw the name in this font: 1 for
 *  everything but the thin scripts. */
export function resolveProviderFontScale(key: string | null | undefined): number {
  return PROVIDER_FONTS.find(font => font.key === key)?.sizeScale ?? 1;
}
