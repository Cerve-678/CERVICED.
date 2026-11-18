// src/constants/customPageStyle.ts
//
// Branding → Custom: a plain page the provider makes themselves (owner,
// 2026-11-18, from the "Simple template" canvas). Every other page style is a
// fixed design; Custom is the same few switches (constants/pageStyles), set by
// the provider's own picks: one of four plain layouts, a font for the
// headings, a font for the text, and headings as typed or in spaced caps.
// The name keeps the Business Name Font from Branding → Name (brand_font), so
// there is still one name-font setting, not two.
//
// Stored as the seventh `|` part of profile_theme ("plain~prata~jura~0"), read
// only while the page style is 'custom'. Anything unreadable falls back to the
// default for that part.

import type { PageCards, PageHero, PageLogoFrame, PagePolicies, PageStyle } from './pageStyles';

export type CustomLayout = 'plain' | 'cards' | 'bigName' | 'banner';

export const CUSTOM_LAYOUTS: readonly { key: CustomLayout; name: string; description: string }[] = [
  { key: 'plain', name: 'Plain', description: 'Your logo and name, sections between fine lines' },
  { key: 'cards', name: 'Cards', description: 'Your name on the left, each section in its own card' },
  { key: 'bigName', name: 'Big Name', description: 'Your name large across the top, lots of space' },
  { key: 'banner', name: 'Banner', description: 'Your logo and name, sections in outlined boxes' },
];

export interface CustomFont {
  key: string;
  name: string;
  fontFamily: string;
  /** Some faces draw small for their size; this evens them out. */
  sizeScale?: number;
}

/** Fonts for the section headings. All are already loaded in App.tsx. */
export const CUSTOM_HEADING_FONTS: readonly CustomFont[] = [
  { key: 'prata', name: 'Prata', fontFamily: 'Prata-Regular' },
  { key: 'instrument', name: 'Instrument', fontFamily: 'InstrumentSerif-Regular', sizeScale: 1.15 },
  { key: 'dmSerif', name: 'DM Serif', fontFamily: 'DMSerifDisplay-Regular' },
  { key: 'marcellus', name: 'Marcellus', fontFamily: 'Marcellus-Regular' },
  { key: 'gilda', name: 'Gilda', fontFamily: 'GildaDisplay-Regular' },
  { key: 'tenor', name: 'Tenor', fontFamily: 'TenorSans_400Regular' },
  { key: 'josefin', name: 'Josefin', fontFamily: 'JosefinSans_600SemiBold' },
  { key: 'montserrat', name: 'Montserrat', fontFamily: 'Montserrat-ExtraBold', sizeScale: 0.9 },
  { key: 'syne', name: 'Syne', fontFamily: 'Syne_700Bold', sizeScale: 0.95 },
  { key: 'bebas', name: 'Bebas', fontFamily: 'BebasNeue_400Regular', sizeScale: 1.2 },
  { key: 'fredoka', name: 'Fredoka', fontFamily: 'Fredoka_600SemiBold' },
  { key: 'poiret', name: 'Poiret', fontFamily: 'PoiretOne_400Regular', sizeScale: 1.05 },
  { key: 'bakbak', name: 'Bakbak', fontFamily: 'BakbakOne-Regular', sizeScale: 0.95 },
];

/** Fonts for the text: the About, services, policies and contact lines. */
export const CUSTOM_TEXT_FONTS: readonly CustomFont[] = [
  { key: 'jura', name: 'Jura', fontFamily: 'Jura-VariableFont_wght' },
  { key: 'jost', name: 'Jost', fontFamily: 'Jost-Light', sizeScale: 1.05 },
  { key: 'hanken', name: 'Hanken', fontFamily: 'HankenGrotesk-Medium' },
  { key: 'montserrat', name: 'Montserrat', fontFamily: 'Montserrat-Medium', sizeScale: 0.95 },
  { key: 'didact', name: 'Didact', fontFamily: 'DidactGothic-Regular' },
  { key: 'josefin', name: 'Josefin', fontFamily: 'JosefinSans_400Regular', sizeScale: 1.05 },
  { key: 'figtree', name: 'Figtree', fontFamily: 'Figtree-SemiBold' },
  { key: 'castoro', name: 'Castoro', fontFamily: 'Castoro-Regular', sizeScale: 1.05 },
];

export interface CustomChoices {
  layout: CustomLayout;
  heading: string;
  text: string;
  /** Headings in small, widely spaced capitals instead of as typed. */
  caps: boolean;
}

export const DEFAULT_CUSTOM_CHOICES: CustomChoices = { layout: 'plain', heading: 'prata', text: 'jura', caps: false };

export type FontSetCollection = 'soft' | 'chic' | 'signed' | 'bold';

export const FONT_SET_COLLECTIONS: readonly { key: FontSetCollection; name: string }[] = [
  { key: 'soft', name: 'Soft & clean' },
  { key: 'chic', name: 'Classic & chic' },
  { key: 'signed', name: 'Signed' },
  { key: 'bold', name: 'Bold' },
];

export interface FontSet {
  key: string;
  name: string;
  collection: FontSetCollection;
  /** A Business Name Font key (constants/providerFonts). */
  nameFont: string;
  heading: string;
  text: string;
}

/** Three fonts that go together, so most providers pick once. */
export const FONT_SETS: readonly FontSet[] = [
  { key: 'clean', name: 'Clean', collection: 'soft', nameFont: 'josefin-sans', heading: 'tenor', text: 'jost' },
  { key: 'rounded', name: 'Rounded', collection: 'soft', nameFont: 'comfortaa', heading: 'fredoka', text: 'figtree' },
  { key: 'calm', name: 'Calm', collection: 'soft', nameFont: 'tenor-sans', heading: 'tenor', text: 'didact' },
  { key: 'oldMoney', name: 'Old Money', collection: 'chic', nameFont: 'italiana', heading: 'prata', text: 'castoro' },
  { key: 'editorial', name: 'Editorial', collection: 'chic', nameFont: 'playfair-display', heading: 'instrument', text: 'hanken' },
  { key: 'gallery', name: 'Gallery', collection: 'chic', nameFont: 'default', heading: 'gilda', text: 'montserrat' },
  { key: 'signed', name: 'Signed', collection: 'signed', nameFont: 'great-vibes', heading: 'tenor', text: 'figtree' },
  { key: 'scriptSerif', name: 'Script & Serif', collection: 'signed', nameFont: 'pinyon-script', heading: 'prata', text: 'josefin' },
  { key: 'sweet', name: 'Sweet', collection: 'signed', nameFont: 'sacramento', heading: 'josefin', text: 'jost' },
  { key: 'poster', name: 'Poster', collection: 'bold', nameFont: 'bebas-neue', heading: 'montserrat', text: 'hanken' },
  { key: 'studio', name: 'Studio', collection: 'bold', nameFont: 'syne', heading: 'syne', text: 'hanken' },
  { key: 'deco', name: 'Deco', collection: 'bold', nameFont: 'limelight', heading: 'poiret', text: 'josefin' },
];

/** The set these three fonts make, if they make one. */
export function matchingFontSet(nameFont: string, heading: string, text: string): FontSet | null {
  return FONT_SETS.find(s => s.nameFont === nameFont && s.heading === heading && s.text === text) ?? null;
}

export function customHeadingFont(key: string | null | undefined): CustomFont {
  return CUSTOM_HEADING_FONTS.find(f => f.key === key) ?? CUSTOM_HEADING_FONTS[0]!;
}

export function customTextFont(key: string | null | undefined): CustomFont {
  return CUSTOM_TEXT_FONTS.find(f => f.key === key) ?? CUSTOM_TEXT_FONTS[0]!;
}

function isCustomLayout(value: string | undefined): value is CustomLayout {
  return CUSTOM_LAYOUTS.some(l => l.key === value);
}

export function encodeCustomChoices(choices: CustomChoices): string {
  return [choices.layout, choices.heading, choices.text, choices.caps ? '1' : '0'].join('~');
}

export function parseCustomChoices(value: string | null | undefined): CustomChoices {
  if (!value) return DEFAULT_CUSTOM_CHOICES;
  const [layout, heading, text, caps] = value.split('~');
  return {
    layout: isCustomLayout(layout) ? layout : DEFAULT_CUSTOM_CHOICES.layout,
    heading: CUSTOM_HEADING_FONTS.some(f => f.key === heading) ? heading! : DEFAULT_CUSTOM_CHOICES.heading,
    text: CUSTOM_TEXT_FONTS.some(f => f.key === text) ? text! : DEFAULT_CUSTOM_CHOICES.text,
    caps: caps === '1',
  };
}

export function sameCustomChoices(a: CustomChoices, b: CustomChoices): boolean {
  return encodeCustomChoices(a) === encodeCustomChoices(b);
}

/** The switches each layout sets; the rest of a Custom page is the same for all four. */
const LAYOUT_SWITCHES: Record<CustomLayout, { hero: PageHero; cards: PageCards; policies: PagePolicies; logo: PageLogoFrame }> = {
  plain: { hero: 'stacked', cards: 'none', policies: 'hairline', logo: 'circle' },
  cards: { hero: 'customLeft', cards: 'flat', policies: 'rows', logo: 'circle' },
  bigName: { hero: 'customBig', cards: 'none', policies: 'definition', logo: 'circle' },
  banner: { hero: 'stacked', cards: 'outline', policies: 'boxes', logo: 'doubleRing' },
};

/** The Custom page style for these picks. */
export function customPageStyle(choices: CustomChoices): PageStyle {
  const heading = customHeadingFont(choices.heading);
  const text = customTextFont(choices.text);
  return {
    key: 'custom',
    name: 'Custom',
    description: 'Your own layout and fonts',
    heading: 'custom',
    ...LAYOUT_SWITCHES[choices.layout],
    aboutInHero: false,
    heroPills: false,
    jumpBar: false,
    separateAboutAndPolicies: true,
    numberedServices: false,
    custom: {
      layout: choices.layout,
      headingFont: heading.fontFamily,
      headingScale: heading.sizeScale ?? 1,
      textFont: text.fontFamily,
      caps: choices.caps,
    },
  };
}
