// ── Profile page styles ──────────────────────────────────────────────────────
// Branding → Page Style. A page style changes how the public profile is laid
// out and decorated — section headings, card treatment, how the policies are
// drawn, the frame round the logo — on top of whatever colour set, finish,
// card shape and business-name font the provider picked. It never changes the
// colours themselves, so every style works with every colour set.
//
// Chosen by the owner on 2026-11-13 from the concept canvas
// https://claude.ai/artifact/Q3iiDvPo8zuXkbPBHYtqW3 (templates 1, 2, 3, 4, 8
// and 9). Stored as the fifth `|` part of providers.profile_theme (see
// encodeThemeKey), so it needs no column of its own.
//
// Each style is a small set of switches the profile reads, not a layout of its
// own: the profile keeps one structure, and these decide how each part looks.

export type PageStyleKey = 'classic' | 'cover' | 'arch' | 'framed' | 'scrapbook' | 'spa' | 'glossy';

/** How a section's title is drawn. */
export type PageHeading =
  | 'plain'      // Bakbak, inside the card (the profile as it has always been)
  | 'bigLower'   // huge lowercase sans, above the section
  | 'scriptPair' // a handwritten word then a serif word, centred
  | 'legend'     // set into the top line of an outlined box
  | 'capsScript' // heavy caps then a handwritten word
  | 'spacedCaps' // tiny, widely spaced caps, centred
  | 'bubbly';    // a fat rounded display face, centred

/** What a section sits on. */
export type PageCards =
  | 'frosted' // the frosted glass card it has always been
  | 'none'    // straight on the page, with a hairline between sections
  | 'flat'    // a flat, solid tile with no shadow
  | 'outline' // a thin outlined box, no fill
  | 'paper'   // a solid card with a soft drop shadow
  | 'gloss';  // a rounder card with a tinted rim and a shine along the top

/** How the policy rows are drawn. */
export type PagePolicies =
  | 'rows'      // icon, label and value in a list (as it has always been)
  | 'boxes'     // two-up bordered boxes
  | 'discTiles' // two-up flat tiles, each with its icon in a filled disc
  | 'circles'   // two-up, each under an outlined circle icon
  | 'band'      // two-up on a band of the accent colour with wavy edges
  | 'hairline'  // quiet rows between hairlines
  | 'bubbles';  // two-up rounded tiles

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
  | 'spa';       // what they do as a tiny spaced line, the name, a ringed logo and their opening line

/** The frame round the logo in the hero. */
export type PageLogoFrame = 'circle' | 'arch' | 'polaroid' | 'doubleRing' | 'glossRing';

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
