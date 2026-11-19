// src/constants/customPageStyle.ts
//
// Branding → Custom: a plain page the provider makes themselves (owner,
// 2026-11-18, from the "Simple template" canvas). Every other page style is a
// fixed design; Custom is the same few switches (constants/pageStyles), set by
// the provider's own picks: each part of the page (the top, what sections
// sit on, the headings, policies, services and photos), a font for the
// headings and a font for the text. The six plain layouts are looks to start
// from, which set every part at once.
// The name keeps the Business Name Font from Branding → Name (brand_font), so
// there is still one name-font setting, not two.
//
// Stored as the seventh `|` part of profile_theme ("plain~prata~jura~0", then
// the parts once they differ from the look's), read only while the page style
// is 'custom'. Anything unreadable falls back to the look's own part.

import type { PageCards, PageHero, PageLogoFrame, PagePolicies, PageStyle } from './pageStyles';

export type CustomLayout = 'plain' | 'cards' | 'bigName' | 'banner' | 'soft' | 'bigBoxes';

export const CUSTOM_LAYOUTS: readonly { key: CustomLayout; name: string; description: string }[] = [
  { key: 'plain', name: 'Plain', description: 'Your logo and name, sections between fine lines' },
  { key: 'cards', name: 'Cards', description: 'Your name on the left, each section in its own card' },
  { key: 'bigName', name: 'Big Name', description: 'Your name large across the top, lots of space' },
  { key: 'banner', name: 'Banner', description: 'Your logo and name, sections in outlined boxes' },
  // 2026-11-18 (owner: "add more to custom").
  { key: 'soft', name: 'Soft', description: 'Your logo and name, each section in a soft round card' },
  { key: 'bigBoxes', name: 'Bold Boxes', description: 'Your name large, sections in round outlined boxes' },
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
  // 2026-11-18: more, all already loaded for the fixed page styles.
  { key: 'playfair', name: 'Playfair', fontFamily: 'PlayfairDisplay_700Bold', sizeScale: 0.95 },
  { key: 'cinzel', name: 'Cinzel', fontFamily: 'Cinzel-Medium', sizeScale: 0.9 },
  { key: 'bellefair', name: 'Bellefair', fontFamily: 'Bellefair-Regular', sizeScale: 1.05 },
  { key: 'gloock', name: 'Gloock', fontFamily: 'Gloock-Regular' },
  { key: 'caslon', name: 'Caslon', fontFamily: 'LibreCaslonDisplay-Regular', sizeScale: 1.1 },
  { key: 'youngSerif', name: 'Young Serif', fontFamily: 'YoungSerif-Regular', sizeScale: 0.95 },
  { key: 'oswald', name: 'Oswald', fontFamily: 'Oswald-Medium' },
  { key: 'spartan', name: 'Spartan', fontFamily: 'LeagueSpartan-ExtraBold', sizeScale: 0.95 },
  { key: 'archivo', name: 'Archivo', fontFamily: 'Archivo-ExtraBold', sizeScale: 0.9 },
  { key: 'righteous', name: 'Righteous', fontFamily: 'Righteous_400Regular', sizeScale: 0.95 },
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
  // 2026-11-18: more, all already loaded for the fixed page styles.
  { key: 'garamond', name: 'Garamond', fontFamily: 'EBGaramond-SemiBold', sizeScale: 1.05 },
  { key: 'oldStandard', name: 'Old Standard', fontFamily: 'OldStandardTT-Regular' },
  { key: 'bellefair', name: 'Bellefair', fontFamily: 'Bellefair-Regular', sizeScale: 1.1 },
  { key: 'spartanLight', name: 'Spartan', fontFamily: 'LeagueSpartan-Light', sizeScale: 1.05 },
  { key: 'varela', name: 'Varela', fontFamily: 'VarelaRound_400Regular' },
];

export type CustomHeadingStyle = 'typed' | 'caps' | 'numbered' | 'underlined' | 'script';
export type CustomTop = 'centred' | 'ringed' | 'side' | 'bigName' | 'cover' | 'arch' | 'polaroid' | 'calm' | 'prism';
export type CustomSurface = 'open' | 'cards' | 'outlined' | 'roundBoxes' | 'soft' | 'paper';
export type CustomPolicies = 'rows' | 'lines' | 'side' | 'boxes' | 'tiles' | 'discs' | 'notes' | 'open';
export type CustomServices = 'list' | 'numbered';
export type CustomPhotos = 'plain' | 'rounded' | 'stamps' | 'pinned' | 'pressed' | 'newsprint';

/** One way a part of the page can look: what the provider sees, and the page switch it sets. */
export interface CustomPartOption<K extends string> {
  key: K;
  name: string;
  description: string;
}

// 2026-11-18 (owner: "the custom can be so much more … the current layout
// options are boring"): every part of a Custom page is its own pick, drawn by
// pieces the fixed page styles already have, so a Custom page can look like
// far more than six layouts. The six layouts are now looks to start from.

export const CUSTOM_TOPS: readonly CustomPartOption<CustomTop>[] = [
  { key: 'centred', name: 'Centred', description: 'Your logo, then your name' },
  { key: 'ringed', name: 'Ringed', description: 'Centred, your logo in a double ring' },
  { key: 'side', name: 'Side by Side', description: 'Your logo left, your name beside it' },
  { key: 'bigName', name: 'Big Name', description: 'Your name large, no logo' },
  { key: 'cover', name: 'Cover', description: 'Your name huge and low, a small logo' },
  { key: 'arch', name: 'Arch', description: 'Your name up top, an arched logo' },
  { key: 'polaroid', name: 'Polaroid', description: 'Your logo as a polaroid' },
  { key: 'calm', name: 'Calm', description: 'Your name spaced out over a ringed logo' },
  { key: 'prism', name: 'Prism', description: 'Angled colour planes round your logo and name' },
];

export const CUSTOM_SURFACES: readonly CustomPartOption<CustomSurface>[] = [
  { key: 'open', name: 'Open', description: 'Straight on the page, fine lines between' },
  { key: 'cards', name: 'Cards', description: 'Flat solid cards' },
  { key: 'outlined', name: 'Outlined', description: 'Fine boxes, the title in the line' },
  { key: 'roundBoxes', name: 'Round Boxes', description: 'Dark outlines, big round corners' },
  { key: 'soft', name: 'Soft', description: 'Tinted cards, big round corners' },
  { key: 'paper', name: 'Paper', description: 'Cards lifted by a soft shadow' },
];

export const CUSTOM_HEADING_STYLES: readonly CustomPartOption<CustomHeadingStyle>[] = [
  { key: 'typed', name: 'As Typed', description: 'Plain titles in your heading font' },
  { key: 'caps', name: 'Spaced Caps', description: 'Small, widely spaced capitals' },
  { key: 'numbered', name: 'Numbered', description: '01, 02, 03 before each title' },
  { key: 'underlined', name: 'Underlined', description: 'A short bar of your colour' },
  { key: 'script', name: 'Script Word', description: 'A handwritten word over each title' },
];

export const CUSTOM_POLICY_LAYOUTS: readonly CustomPartOption<CustomPolicies>[] = [
  { key: 'rows', name: 'Rows', description: 'An icon, the title and your policy' },
  { key: 'lines', name: 'Lines', description: 'Quiet rows between fine lines' },
  { key: 'side', name: 'Side by Side', description: 'A small title beside each policy' },
  { key: 'boxes', name: 'Boxes', description: 'Two across, in outlined boxes' },
  { key: 'tiles', name: 'Tiles', description: 'Two across, tinted round tiles' },
  { key: 'discs', name: 'Icons', description: 'Two across, each icon in a circle' },
  { key: 'notes', name: 'Notes', description: 'Centred, in soft italics' },
  { key: 'open', name: 'Tap to Open', description: 'Just the titles until tapped' },
];

export const CUSTOM_SERVICE_LAYOUTS: readonly CustomPartOption<CustomServices>[] = [
  { key: 'list', name: 'With Photos', description: 'Each service with its photo' },
  { key: 'numbered', name: 'Numbered', description: '01, 02, 03 instead of photos' },
];

export const CUSTOM_PHOTO_LAYOUTS: readonly CustomPartOption<CustomPhotos>[] = [
  { key: 'plain', name: 'Plain', description: 'Your photos as they are' },
  { key: 'rounded', name: 'Rounded', description: 'Big round corners' },
  { key: 'stamps', name: 'Stamps', description: 'Each one a postage stamp' },
  { key: 'pinned', name: 'Pinned', description: 'Prints held by a clip' },
  { key: 'pressed', name: 'Pressed', description: 'Pressed into the page like a print' },
  { key: 'newsprint', name: 'Newsprint', description: 'A fine frame and a dot screen' },
];

export type CustomPartKey = 'top' | 'surface' | 'headingStyle' | 'services' | 'photos' | 'policies';

/** Every part, in page order, with the name the provider sees and its choices. */
export const CUSTOM_PARTS: readonly { key: CustomPartKey; name: string; label: string; options: readonly CustomPartOption<string>[] }[] = [
  { key: 'top', name: 'Top', label: 'TOP OF YOUR PAGE', options: CUSTOM_TOPS },
  { key: 'surface', name: 'Sections', label: 'WHAT SECTIONS SIT ON', options: CUSTOM_SURFACES },
  { key: 'headingStyle', name: 'Headings', label: 'HEADINGS', options: CUSTOM_HEADING_STYLES },
  { key: 'policies', name: 'Policies', label: 'POLICIES', options: CUSTOM_POLICY_LAYOUTS },
  { key: 'services', name: 'Services', label: 'SERVICES', options: CUSTOM_SERVICE_LAYOUTS },
  { key: 'photos', name: 'Photos', label: 'PORTFOLIO PHOTOS', options: CUSTOM_PHOTO_LAYOUTS },
];

/** These picks with one part changed, if the value is one of that part's choices. */
export function withPart(choices: CustomChoices, part: CustomPartKey, value: string): CustomChoices {
  const config = CUSTOM_PARTS.find(p => p.key === part);
  if (!config?.options.some(o => o.key === value)) return choices;
  return { ...choices, [part]: value } as CustomChoices;
}

/** The parts a Custom page is made of, besides its fonts. */
export interface CustomParts {
  top: CustomTop;
  surface: CustomSurface;
  headingStyle: CustomHeadingStyle;
  policies: CustomPolicies;
  services: CustomServices;
  photos: CustomPhotos;
}

export interface CustomChoices extends CustomParts {
  /** The look they last started from; its parts fill in any part a saved value doesn't have. */
  layout: CustomLayout;
  heading: string;
  text: string;
}

/** The parts each starting look sets. */
export const LAYOUT_PARTS: Record<CustomLayout, CustomParts> = {
  plain: { top: 'centred', surface: 'open', headingStyle: 'typed', policies: 'lines', services: 'list', photos: 'plain' },
  cards: { top: 'side', surface: 'cards', headingStyle: 'typed', policies: 'rows', services: 'list', photos: 'plain' },
  bigName: { top: 'bigName', surface: 'open', headingStyle: 'typed', policies: 'side', services: 'list', photos: 'plain' },
  banner: { top: 'ringed', surface: 'outlined', headingStyle: 'typed', policies: 'boxes', services: 'list', photos: 'plain' },
  soft: { top: 'centred', surface: 'soft', headingStyle: 'typed', policies: 'tiles', services: 'list', photos: 'rounded' },
  bigBoxes: { top: 'bigName', surface: 'roundBoxes', headingStyle: 'typed', policies: 'boxes', services: 'list', photos: 'plain' },
};

export const DEFAULT_CUSTOM_CHOICES: CustomChoices = { layout: 'plain', heading: 'prata', text: 'jura', ...LAYOUT_PARTS.plain };

/** The look these parts make, if they make one. The heading style is left
 *  out: a look is the page's layout, and keeps whatever headings they chose. */
export function matchingLook(parts: CustomParts): CustomLayout | null {
  const found = CUSTOM_LAYOUTS.find(look => sameParts(LAYOUT_PARTS[look.key], { ...parts, headingStyle: LAYOUT_PARTS[look.key].headingStyle }));
  return found ? found.key : null;
}

function sameParts(a: CustomParts, b: CustomParts): boolean {
  return a.top === b.top && a.surface === b.surface && a.headingStyle === b.headingStyle
    && a.policies === b.policies && a.services === b.services && a.photos === b.photos;
}

/** Just the parts, from a whole set of picks. */
export function partsOf(choices: CustomChoices): CustomParts {
  const { top, surface, headingStyle, policies, services, photos } = choices;
  return { top, surface, headingStyle, policies, services, photos };
}

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
  { key: 'friendly', name: 'Friendly', collection: 'soft', nameFont: 'varela-round', heading: 'youngSerif', text: 'varela' },
  { key: 'oldMoney', name: 'Old Money', collection: 'chic', nameFont: 'italiana', heading: 'prata', text: 'castoro' },
  { key: 'editorial', name: 'Editorial', collection: 'chic', nameFont: 'playfair-display', heading: 'instrument', text: 'hanken' },
  { key: 'gallery', name: 'Gallery', collection: 'chic', nameFont: 'default', heading: 'gilda', text: 'montserrat' },
  { key: 'couture', name: 'Couture', collection: 'chic', nameFont: 'italiana', heading: 'cinzel', text: 'oldStandard' },
  { key: 'timeless', name: 'Timeless', collection: 'chic', nameFont: 'playfair-display', heading: 'playfair', text: 'garamond' },
  { key: 'signed', name: 'Signed', collection: 'signed', nameFont: 'great-vibes', heading: 'tenor', text: 'figtree' },
  { key: 'scriptSerif', name: 'Script & Serif', collection: 'signed', nameFont: 'pinyon-script', heading: 'prata', text: 'josefin' },
  { key: 'sweet', name: 'Sweet', collection: 'signed', nameFont: 'sacramento', heading: 'josefin', text: 'jost' },
  { key: 'loveLetter', name: 'Love Letter', collection: 'signed', nameFont: 'pinyon-script', heading: 'bellefair', text: 'bellefair' },
  { key: 'poster', name: 'Poster', collection: 'bold', nameFont: 'bebas-neue', heading: 'montserrat', text: 'hanken' },
  { key: 'studio', name: 'Studio', collection: 'bold', nameFont: 'syne', heading: 'syne', text: 'hanken' },
  { key: 'deco', name: 'Deco', collection: 'bold', nameFont: 'limelight', heading: 'poiret', text: 'josefin' },
  { key: 'sport', name: 'Sport', collection: 'bold', nameFont: 'bebas-neue', heading: 'oswald', text: 'spartanLight' },
  { key: 'sharp', name: 'Sharp', collection: 'bold', nameFont: 'josefin-sans', heading: 'archivo', text: 'hanken' },
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

function pick<K extends string>(options: readonly CustomPartOption<K>[], value: string | undefined, fallback: K): K {
  return options.find(o => o.key === value)?.key ?? fallback;
}

/** The heading style's one-letter code. '0' and '1' are what "as typed" and
 *  "spaced caps" were saved as before there were more. */
const HEADING_CODES: Record<CustomHeadingStyle, string> = { typed: '0', caps: '1', numbered: 'n', underlined: 'u', script: 's' };

/**
 * "plain~prata~jura~0" while the parts are still the look's own (so a page
 * saved before parts existed reads back unchanged), then the six parts after
 * it once any of them is changed.
 */
export function encodeCustomChoices(choices: CustomChoices): string {
  const base = [choices.layout, choices.heading, choices.text, HEADING_CODES[choices.headingStyle]];
  const look = LAYOUT_PARTS[choices.layout];
  const own = { ...partsOf(choices), headingStyle: look.headingStyle };
  if (sameParts(own, look)) return base.join('~');
  return [...base, choices.top, choices.surface, choices.policies, choices.services, choices.photos].join('~');
}

export function parseCustomChoices(value: string | null | undefined): CustomChoices {
  if (!value) return DEFAULT_CUSTOM_CHOICES;
  const [layoutValue, heading, text, headingCode, top, surface, policies, services, photos] = value.split('~');
  const layout = isCustomLayout(layoutValue) ? layoutValue : DEFAULT_CUSTOM_CHOICES.layout;
  const look = LAYOUT_PARTS[layout];
  const headingStyle = (Object.keys(HEADING_CODES) as CustomHeadingStyle[]).find(k => HEADING_CODES[k] === headingCode) ?? look.headingStyle;
  return {
    layout,
    heading: CUSTOM_HEADING_FONTS.some(f => f.key === heading) ? heading! : DEFAULT_CUSTOM_CHOICES.heading,
    text: CUSTOM_TEXT_FONTS.some(f => f.key === text) ? text! : DEFAULT_CUSTOM_CHOICES.text,
    headingStyle,
    top: pick(CUSTOM_TOPS, top, look.top),
    surface: pick(CUSTOM_SURFACES, surface, look.surface),
    policies: pick(CUSTOM_POLICY_LAYOUTS, policies, look.policies),
    services: pick(CUSTOM_SERVICE_LAYOUTS, services, look.services),
    photos: pick(CUSTOM_PHOTO_LAYOUTS, photos, look.photos),
  };
}

export function sameCustomChoices(a: CustomChoices, b: CustomChoices): boolean {
  return encodeCustomChoices(a) === encodeCustomChoices(b);
}

const TOP_SWITCHES: Record<CustomTop, { hero: PageHero; logo: PageLogoFrame }> = {
  centred: { hero: 'stacked', logo: 'circle' },
  ringed: { hero: 'stacked', logo: 'doubleRing' },
  side: { hero: 'customLeft', logo: 'circle' },
  bigName: { hero: 'customBig', logo: 'circle' },
  cover: { hero: 'cover', logo: 'circle' },
  arch: { hero: 'masthead', logo: 'arch' },
  polaroid: { hero: 'poster', logo: 'polaroid' },
  calm: { hero: 'spa', logo: 'doubleRing' },
  prism: { hero: 'prismHeader', logo: 'sharp' },
};

const SURFACE_CARDS: Record<CustomSurface, PageCards> = {
  open: 'none', cards: 'flat', outlined: 'outline', roundBoxes: 'outlineRound', soft: 'soft', paper: 'paper',
};

const POLICY_LAYOUTS: Record<CustomPolicies, PagePolicies> = {
  rows: 'rows', lines: 'hairline', side: 'definition', boxes: 'boxes', tiles: 'softTiles', discs: 'discTiles', notes: 'gentleNotes', open: 'accordion',
};

const PHOTO_SWITCHES: Record<CustomPhotos, Partial<PageStyle>> = {
  plain: {},
  rounded: { roundedPhotos: true },
  stamps: { stampPhotos: true },
  pinned: { clippedPhotos: true },
  pressed: { plateMarkPhotos: true },
  newsprint: { halftonePhotos: true },
};

/** Tops that sit in the middle of the page, so the headings sit there with them on an open page. */
const CENTRED_TOPS: readonly CustomTop[] = ['centred', 'ringed', 'polaroid', 'calm'];

/** The Custom page style for these picks. */
export function customPageStyle(choices: CustomChoices): PageStyle {
  const heading = customHeadingFont(choices.heading);
  const text = customTextFont(choices.text);
  return {
    key: 'custom',
    name: 'Custom',
    description: 'Your own layout and fonts',
    heading: 'custom',
    ...TOP_SWITCHES[choices.top],
    cards: SURFACE_CARDS[choices.surface],
    policies: POLICY_LAYOUTS[choices.policies],
    ...PHOTO_SWITCHES[choices.photos],
    aboutInHero: false,
    heroPills: false,
    jumpBar: false,
    separateAboutAndPolicies: true,
    numberedServices: choices.services === 'numbered',
    custom: {
      layout: choices.layout,
      headingFont: heading.fontFamily,
      headingScale: heading.sizeScale ?? 1,
      textFont: text.fontFamily,
      headingStyle: choices.headingStyle,
      centred: choices.headingStyle === 'script'
        || (choices.surface === 'open' && CENTRED_TOPS.includes(choices.top)),
    },
  };
}
