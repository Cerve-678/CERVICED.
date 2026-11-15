// ── Profile page styles ──────────────────────────────────────────────────────
// Branding → Page Style. A page style changes how the public profile is laid
// out and decorated — section headings, card treatment, how the policies are
// drawn, the frame round the logo — on top of whatever colour set, finish,
// card shape and business-name font the provider picked. It never changes the
// colours themselves, so every style works with every colour set.
//
// Chosen by the owner on 2026-11-13 from the concept canvas
// https://claude.ai/artifact/Q3iiDvPo8zuXkbPBHYtqW3 (templates 1, 2, 3, 4, 8
// and 9), then six more on 2026-11-14 from
// https://claude.ai/artifact/5jGhmNUFgb2cY8SZhdeQYc (templates 11–16:
// Editorial, Heritage, Duet, Groovy, Gallery, Apothecary). Stored as the fifth `|` part of providers.profile_theme (see
// encodeThemeKey), so it needs no column of its own.
//
// Each style is a small set of switches the profile reads, not a layout of its
// own: the profile keeps one structure, and these decide how each part looks.

export type PageStyleKey =
  | 'classic' | 'cover' | 'arch' | 'framed' | 'scrapbook' | 'spa' | 'glossy'
  | 'editorial' | 'heritage' | 'duet' | 'groovy' | 'gallery' | 'apothecary'
  | 'snapshot' | 'signature' | 'quiet'
  | 'callingCard';

/** How a section's title is drawn. */
export type PageHeading =
  | 'plain'      // Bakbak, inside the card (the profile as it has always been)
  | 'bigLower'   // huge lowercase sans, above the section
  | 'scriptPair' // a handwritten word then a serif word, centred
  | 'legend'     // set into the top line of an outlined box
  | 'capsScript' // heavy caps then a handwritten word
  | 'spacedCaps' // tiny, widely spaced caps, centred
  | 'bubbly'     // a fat rounded display face, centred
  | 'dotCaps'    // a light word, then a full stop in the accent and bold caps, between hairlines
  | 'italicCaps' // an italic word between short rules, spaced engraved caps under it
  | 'layered'    // a big handwritten word in the accent, heavy caps laid over its foot
  | 'groovy'     // a soft, chunky italic in lowercase with a squiggle under it
  | 'serifTitle' // a large serif title, nothing above it (Gallery)
  | 'labelCaps'  // spaced serif caps between hairlines, like a printed label
  | 'indexed'    // a section number in the accent, a short rule, then the title (Signature)
  | 'condensed'  // huge condensed caps over a short accent bar (Snapshot)
  | 'quietCaps'  // spaced sans caps on the left, a hairline running out to the right (Quiet)
  | 'engravedCaps'; // engraved serif caps, centred between hairlines (Calling Card)

/** What a section sits on. */
export type PageCards =
  | 'frosted' // the frosted glass card it has always been
  | 'none'    // straight on the page, with a hairline between sections
  | 'flat'    // a flat, solid tile with no shadow
  | 'outline' // a thin outlined box, no fill
  | 'paper'   // a solid card with a soft drop shadow
  | 'gloss'   // a rounder card with a tinted rim and a shine along the top
  | 'open'    // straight on the page with no rule (the heading carries its own lines)
  | 'offset'  // a white card, a dark outline and a hard shadow in a soft accent
  | 'chunky'  // a rounder card, a thick outline and a hard accent shadow
  | 'label'    // a square card with a fine outline and an inner accent rule
  | 'topRule'  // a square card with a heavy rule along its top edge
  | 'block'    // a square card with a thick dark outline
  | 'clipped'; // a near-square card with an inner rule, held at the top by a gold clip (Calling Card)

/** How the policy rows are drawn. */
export type PagePolicies =
  | 'rows'      // icon, label and value in a list (as it has always been)
  | 'boxes'     // two-up bordered boxes
  | 'discTiles' // two-up flat tiles, each with its icon in a filled disc
  | 'circles'   // two-up, each under an outlined circle icon
  | 'band'      // two-up on a band of the accent colour with wavy edges
  | 'hairline'  // quiet rows between hairlines
  | 'bubbles'   // two-up rounded tiles
  | 'tiles'     // two-up tiles tinted with the accent, a bold caps label
  | 'numerals'  // rows numbered in roman numerals
  | 'divided'   // a two-up grid split by accent lines, each with its icon
  | 'stickers'  // two-up filled tiles, each tilted a little
  | 'definition' // a small caps label beside each value, between hairlines
  | 'ribbon';    // two-up on one card with a ribbon across its corner (Calling Card)

/**
 * How the hero (the top of the profile, over the photo or colours) is laid
 * out. Every layout keeps the stars, the slots pill with its bell, Instagram
 * and a link-only provider's Book block; they differ in where the logo, the
 * name and the words around them sit.
 */
export type PageHero =
  | 'stacked'    // logo, then the name under it, centred (Classic, Glossy)
  | 'cover'      // no logo: a huge name low over the photo, pills under it
  | 'masthead'   // the name at the top as a heading, then the arched logo beside "Meet" and their About
  | 'sideBySide' // the logo on the left; "Welcome to", the name, their About and area on the right
  | 'poster'     // a polaroid logo and a big name
  | 'spa'        // what they do as a tiny spaced line, the name, a ringed logo and their opening line
  | 'editorial'  // the name left in light and bold caps with an accent full stop, two tilted cards beside it
  | 'crest'      // a seal: the name curved round the top of a dotted ring, the logo inside
  | 'duet'       // a white welcome card: the logo beside the name in signature script over caps
  | 'groovy'     // a sticker sheet: logo sticker, rating starburst, the name on a tilted pill
  | 'exhibition' // a gallery wall label, the name large, the logo framed and matted
  | 'label'      // a paper tag hanging on a string
  | 'blockName'  // photos edge to edge, the name huge in condensed caps on an accent block, the logo beside it
  | 'signed'     // a big ringed logo with the whole name signed across its foot
  | 'quietBand'  // their photo left clear, the name and logo on a pale band across it
  | 'callingCard'; // satin folds, and a cream calling card held by a gold clip with the logo and name

/** The frame round the logo in the hero. */
export type PageLogoFrame =
  | 'circle' | 'arch' | 'polaroid' | 'doubleRing' | 'glossRing'
  | 'tilted'     // a rounded square card, tilted (Editorial)
  | 'accentRing' // a ring of the accent with a gap round the logo (Duet)
  | 'mat'        // square, in a white mat and a thin dark frame (Gallery)
  | 'square';    // a square with barely rounded corners (Snapshot)

export interface PageStyle {
  key: PageStyleKey;
  name: string;
  description: string;
  heading: PageHeading;
  cards: PageCards;
  policies: PagePolicies;
  logo: PageLogoFrame;
  hero: PageHero;
  /** Their About sits in the hero (Arch, Framed), so the page doesn't repeat it as a section. */
  aboutInHero: boolean;
  /** Service types, area and venue as white pills under the name. */
  heroPills: boolean;
  /** A bar of section links (About, Services, Policies, Reviews) at the top of the page. */
  jumpBar: boolean;
  /** About and Policies as two sections of their own instead of one tabbed card. */
  separateAboutAndPolicies: boolean;
  /** A service without a photo shows its number in the menu (01, 02…) instead of its first letter. */
  numberedServices: boolean;
  /** Their About on a full-width band of the accent (Editorial). */
  aboutOnBand?: boolean;
  /** Policy numerals in lower case ("i.", "ii.") rather than capitals. */
  numeralsLower?: boolean;
  /** Portfolio photos as cream-bordered prints, each pinned by a small gold clip (Calling Card). */
  clippedPhotos?: boolean;
}

export const DEFAULT_PAGE_STYLE: PageStyleKey = 'classic';

export const PAGE_STYLES: readonly PageStyle[] = [
  {
    key: 'classic', name: 'Classic', description: 'Frosted cards, the profile as it has always looked',
    heading: 'plain', cards: 'frosted', policies: 'rows', logo: 'circle',
    hero: 'stacked', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: false, numberedServices: false,
  },
  {
    key: 'cover', name: 'Cover', description: 'Your name huge across your photo, big lowercase headings',
    heading: 'bigLower', cards: 'none', policies: 'boxes', logo: 'circle',
    hero: 'cover', aboutInHero: false,
    heroPills: true, jumpBar: true, separateAboutAndPolicies: true, numberedServices: false,
  },
  {
    key: 'arch', name: 'Arch', description: 'Your name at the top, an arched logo beside your About',
    heading: 'scriptPair', cards: 'flat', policies: 'discTiles', logo: 'arch',
    hero: 'masthead', aboutInHero: true,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
  },
  {
    key: 'framed', name: 'Framed', description: 'Your logo beside your name, outlined boxes',
    heading: 'legend', cards: 'outline', policies: 'circles', logo: 'arch',
    hero: 'sideBySide', aboutInHero: true,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
  },
  {
    key: 'scrapbook', name: 'Scrapbook', description: 'A polaroid logo, your name big, policies on a wavy band',
    heading: 'capsScript', cards: 'paper', policies: 'band', logo: 'polaroid',
    hero: 'poster', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
  },
  {
    key: 'spa', name: 'Spa', description: 'Calm and minimal: fine lines, numbered treatments',
    heading: 'spacedCaps', cards: 'none', policies: 'hairline', logo: 'doubleRing',
    hero: 'spa', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: true,
  },
  {
    key: 'glossy', name: 'Glossy', description: 'Shiny, rounded cards and bubbly headings',
    heading: 'bubbly', cards: 'gloss', policies: 'bubbles', logo: 'glossRing',
    hero: 'stacked', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
  },
  {
    key: 'editorial', name: 'Editorial', description: 'Your name in light and bold with a full stop, colour bands',
    heading: 'dotCaps', cards: 'open', policies: 'tiles', logo: 'tilted',
    hero: 'editorial', aboutInHero: false, aboutOnBand: true,
    heroPills: false, jumpBar: true, separateAboutAndPolicies: true, numberedServices: false,
  },
  {
    key: 'heritage', name: 'Heritage', description: 'Old-money engraved caps, a seal, house rules',
    heading: 'italicCaps', cards: 'open', policies: 'numerals', logo: 'circle',
    hero: 'crest', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
  },
  {
    key: 'duet', name: 'Duet', description: 'A welcome card, signature script, cards with a pop of colour',
    heading: 'layered', cards: 'offset', policies: 'divided', logo: 'accentRing',
    hero: 'duet', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
  },
  {
    key: 'groovy', name: 'Groovy', description: 'Retro and fun: a sticker sheet, chunky type, bold outlines',
    heading: 'groovy', cards: 'chunky', policies: 'stickers', logo: 'circle',
    hero: 'groovy', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
  },
  {
    key: 'gallery', name: 'Gallery', description: 'Your work like an exhibition: wall labels, framed logo',
    heading: 'serifTitle', cards: 'none', policies: 'definition', logo: 'mat',
    hero: 'exhibition', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: true,
  },
  {
    key: 'apothecary', name: 'Apothecary', description: 'A hanging paper tag, numbered treatments',
    heading: 'labelCaps', cards: 'label', policies: 'numerals', logo: 'circle',
    hero: 'label', aboutInHero: false, numeralsLower: true,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: true,
  },
  // 2026-11-15: Duet's A and C heroes and Apothecary's C, each made a
  // template of its own (Signature restyled so it isn't another Duet), from https://claude.ai/artifact/RopN63UF8acRMG1aCYK4Hh.
  {
    key: 'snapshot', name: 'Snapshot', description: 'Bold: your photos edge to edge, your name huge on a colour block',
    heading: 'condensed', cards: 'block', policies: 'boxes', logo: 'square',
    hero: 'blockName', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: true,
  },
  {
    key: 'signature', name: 'Signature', description: 'Your name signed in pen across a ringed logo, numbered sections',
    heading: 'indexed', cards: 'topRule', policies: 'boxes', logo: 'accentRing',
    hero: 'signed', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
  },
  {
    key: 'quiet', name: 'Quiet', description: 'Your photo left clear, your name on a calm band',
    heading: 'quietCaps', cards: 'none', policies: 'definition', logo: 'circle',
    hero: 'quietBand', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: true,
  },
  // 2026-11-15, round 4 (https://claude.ai/artifact/68xp8mxLLTCV6pVuiQHJZS,
  // board 23): satin and a calling card held by a gold clip.
  {
    key: 'callingCard', name: 'Calling Card', description: 'Your name on a cream card held by a gold clip, over satin',
    heading: 'engravedCaps', cards: 'clipped', policies: 'ribbon', logo: 'circle',
    hero: 'callingCard', aboutInHero: false, clippedPhotos: true,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
  },
];

export function isPageStyleKey(value: string | null | undefined): value is PageStyleKey {
  return PAGE_STYLES.some(style => style.key === value);
}

/** The style for a stored key; anything unknown is Classic. */
export function getPageStyle(key: string | null | undefined): PageStyle {
  return PAGE_STYLES.find(style => style.key === key) ?? PAGE_STYLES[0]!;
}

/** Which section a heading belongs to, so a two-part heading can say something better than the bare title. */
export type PageSectionKey =
  | 'about' | 'policies' | 'services' | 'reviews' | 'hours' | 'contact'
  | 'info' | 'portfolio' | 'specialities' | 'policyPages';

/** The plain title of each section — what Classic shows, and what screen readers hear in every style. */
export const PAGE_SECTION_TITLES: Record<PageSectionKey, string> = {
  about: 'About',
  policies: 'Policies',
  services: 'Services',
  reviews: 'Reviews',
  hours: 'Opening Hours',
  contact: 'Contact',
  info: 'Additional Information',
  portfolio: 'Portfolio',
  specialities: 'Specialities',
  policyPages: 'Full Policy',
};

/** The two halves of a script-and-serif or caps-and-script heading: a short
 *  lead-in drawn in the handwritten face, then the section's name. */
const HEADING_PAIRS: Record<PageSectionKey, [string, string]> = {
  about: ['Meet', 'the Artist'],
  policies: ['Booking', 'Policies'],
  services: ['The', 'Services'],
  reviews: ['Client', 'Reviews'],
  hours: ['Opening', 'Hours'],
  contact: ['Get in', 'Touch'],
  info: ['Good to', 'Know'],
  portfolio: ['My', 'Portfolio'],
  specialities: ['My', 'Specialities'],
  policyPages: ['Before', 'You Book'],
};

export function headingPair(section: PageSectionKey): [string, string] {
  return HEADING_PAIRS[section];
}

/** Signature's section numbers, in the order the profile shows its sections. */
export const SECTION_NUMBERS: Record<PageSectionKey, string> = {
  about: '01',
  policies: '02',
  services: '03',
  policyPages: '04',
  portfolio: '05',
  reviews: '06',
  hours: '07',
  contact: '08',
  info: '09',
  specialities: '10',
};

/** Roman numerals for the numbered policy rows (Heritage, Apothecary). */
export function romanNumeral(index: number, lower = false): string {
  const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const value = numerals[index] ?? String(index + 1);
  return lower ? `${value.toLowerCase()}.` : value;
}

/** Two-digit menu numbers for the Spa style: 1 → "01". */
export function menuNumber(index: number): string {
  return String(index + 1).padStart(2, '0');
}

// ── Policy pictures ──────────────────────────────────────────────────────────
// Branding → Policy Pictures: how a provider's uploaded policy pages sit in
// their profile (owner's picks A and B on the 2026-11-13 canvas). Both run the
// page edge to edge in the page's own edge colours; they differ in how it
// meets the page around it. Stored as the sixth `|` part of profile_theme.

export type PolicyPictureLook = 'melt' | 'bleed';

export const DEFAULT_POLICY_PICTURE_LOOK: PolicyPictureLook = 'melt';

export const POLICY_PICTURE_LOOKS: readonly { key: PolicyPictureLook; name: string; description: string }[] = [
  { key: 'melt', name: 'Melt in', description: 'Your pages fade into the page around them' },
  { key: 'bleed', name: 'Bleed', description: 'Your pages run edge to edge on a wavy band of their own colour' },
];

export function isPolicyPictureLook(value: string | null | undefined): value is PolicyPictureLook {
  return POLICY_PICTURE_LOOKS.some(look => look.key === value);
}
