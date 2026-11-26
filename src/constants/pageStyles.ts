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
// Editorial, Heritage, Duet, Groovy, Gallery, Apothecary), and from round 4
// on 2026-11-15. Stored as the fifth `|` part of providers.profile_theme (see
// encodeThemeKey), so it needs no column of its own.
//
// Each style is a small set of switches the profile reads, not a layout of its
// own: the profile keeps one structure, and these decide how each part looks.

import { customPageStyle, DEFAULT_CUSTOM_CHOICES, type CustomChoices, type CustomHeadingStyle, type CustomLayout } from './customPageStyle';

export type PageStyleKey =
  | 'classic' | 'cover' | 'arch' | 'framed' | 'scrapbook' | 'spa' | 'glossy'
  | 'editorial' | 'heritage' | 'duet' | 'groovy' | 'gallery' | 'apothecary'
  | 'snapshot' | 'signature' | 'quiet'
  | 'sheer'
  | 'embossed'
  | 'callingCard'
  | 'boutique'
  | 'gazette'
  | 'novel'
  | 'studio'
  | 'lounge'
  | 'softFocus'
  | 'hush'
  | 'stripes'
  | 'bow'
  | 'pure'
  | 'grid'
  | 'slate'
  | 'halo'
  | 'posy'
  | 'riviera'
  | 'noir'
  | 'muse'
  | 'retreat'
  | 'bonbon'
  | 'ledger'
  | 'pinboard'
  | 'portfolio'
  | 'atelier'
  // 2026-11-19, from the owner's reference boards (a coach's Instagram grid,
  // a café's drink posts and a hair shop's Shopify site): each built from
  // parts of its own rather than the ones the other styles share.
  | 'poster'
  | 'hibiscus'
  | 'storefront'
  | 'orbit'
  | 'typeblock'
  | 'filmstrip'
  | 'neon'
  | 'capsule'
  | 'moodboard'
  | 'latte'
  | 'custom'; // built from the provider's own picks (constants/customPageStyle)

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
  | 'sheerCaps' // thin, widely spaced serif caps, centred (Sheer)
  | 'embossCaps' // display caps pressed up out of the page, in the page's own colour (Embossed)
  | 'engravedCaps' // engraved serif caps, centred between hairlines (Calling Card)
  | 'shopSerif' // a big serif title on the left, like a shop's department heading (Boutique)
  | 'newsRule'  // condensed caps under a thick rule, a thin rule beneath, like a newspaper section (Gazette)
  | 'chapter'   // "CHAPTER III" in small caps over an italic title and a foil ornament (Novel)
  | 'chunkyCaps' // a lowercase script word, then the title in big serif caps, centred (Studio)
  | 'loungeCaps' // tall condensed caps, centred
  | 'twoToneCaps' // huge condensed caps, the lead word in the ink and the rest in the accent (Poster)
  | 'enjoyStack'  // a thin, widely spaced lead word over heavy condensed caps, centred (Hibiscus)
  | 'slantCaps'   // a tiny spaced overline, then heavy slanted caps, centred, like a shop banner (Storefront); Policies gets "PLEASE REVIEW MY" over it (Lounge)
  | 'softCaps'   // heavy grotesk caps at the top left of its own card (Soft Focus)
  | 'hushRule'   // tiny spaced caps between hairlines, in the style's own quiet words (Hush)
  | 'stripeCaps' // spaced serif caps, centred, at the top of the section's colour strip (Stripes)
  | 'bowSerif'   // a small satin bow over an italic serif title, centred (Bow)
  | 'appBold'    // a bold sans title on the left, like an app's section (Pure)
  | 'gridIndex' // the section's number in the accent, then a bold sans title (Grid)
  | 'neonScript' // a lowercase handwritten word in the accent, glowing like a lit tube on a dark page (Neon)
  | 'pillMark' // a small pill in a quiet tone, then a soft lowercase title (Capsule)
  | 'pourSerif' // a plain serif title on the section's band, in the band's own ink (Latte)
  | 'captionCaps' // tiny, very widely spaced caps in a quiet ink, a hairline running out after them, like a print's caption (Moodboard)
  | 'custom';   // the title in the font the provider picked, as typed or in spaced caps (Custom)

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
  | 'sheer'   // a square hairline outline over a faint wash, see-through (Sheer)
  | 'raised'  // a card pressed up out of the page: a lit top edge and a soft drop shadow (Embossed)
  | 'clipped' // a near-square card with an inner rule, held at the top by a clip in the accent (Calling Card)
  | 'product' // a clean card, a fine outline and small corners, like a shop's product tile (Boutique)
  | 'ruled'   // straight on the page, each item over a printed rule (Gazette)
  | 'pages'   // a square card with two page edges showing behind it, like a closed book (Novel)
  | 'tabbed'  // a square solid card with a little tab on its top edge naming the section (Studio)
  | 'outlineRound' // a card with a fine dark outline and big round corners (Lounge)
  | 'soft'    // a soft solid card with big round corners, its heading inside (Soft Focus)
  | 'stripes' // each section on a full-width strip of colour, its content in a finely outlined box (Stripes)
  | 'bow'     // a solid card with round corners (Bow)
  | 'grouped' // a solid card with round corners and no shadow, like a phone's grouped settings rows (Pure)
  | 'gridBox' // a square card in a fine ink outline, its heading inside (Grid)
  | 'lit'  // a rounded card outlined in the accent, glowing on a dark page (Neon)
  | 'capsule' // a soft card in their card colour with big round corners, no shadow; services as full pills taking turns in a tint of the accent and their card colour (Capsule)
  | 'print' // a white print: square corners and a soft drop shadow, like the photos on its board; the services sit on the page between hairlines (Moodboard)
  | 'pour'; // each section on a full-width band a shade deeper than the one above (milk to espresso, the other way on a dark page), its rounded top lapping over the band above, the ink light on the deep ones (Latte)

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
  | 'outlined'   // two-up square hairline boxes, a fine icon over thin serif caps (Sheer)
  | 'recessed'  // label-and-value rows inside a panel pressed down into the page (Embossed)
  | 'ribbon'    // two-up on one card with a ribbon across its corner (Calling Card)
  | 'accordion'  // rows that open and close, like a shop's "Delivery & returns" (Boutique)
  | 'columns'   // two-up newspaper columns boxed by ink rules (Gazette)
  | 'numberedRules' // numbered paragraphs, the label in small caps running into its value (Novel)
  | 'membership'  // two-up square tiles in blush, the card colour and a deep accent, like a studio's price plans (Studio)
  | 'loungeGrid'  // two-up columns straight on the page, a condensed caps label over each (Lounge)
  | 'softTiles'   // two-up round tiles tinted with the accent, inside the section's card (Soft Focus)
  | 'gentleNotes' // centred notes: a small caps label, then the policy in a light italic (Hush)
  | 'pearlNotes'  // rows in the outlined box, each beside a single pearl (Stripes)
  | 'ribbonBand' // one card with a satin ribbon across its top, two-up italic titles (Bow)
  | 'settingsRows' // the label on the left, the policy on the right, a fine line between rows (Pure)
  | 'gridCells';   // two-up cells split by fine lines, a small caps label over each policy (Grid)

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
  | 'labelCard'  // the logo, then the name on a double-ruled label like the page's cards (Apothecary)
  | 'blockName'  // photos edge to edge, the name huge in condensed caps on an accent block, the logo beside it
  | 'signed'     // a ringed logo on the left, the name signed in pen beside it, then area and what they do
  | 'quietBand'  // their photo left clear, the name and logo on a pale band across it
  | 'veil'      // their photo under a see-through black veil: an oval monogram, spaced caps
  | 'quietBand' // their photo left clear, the name and logo on a pale band across it
  | 'pressed'  // pressed straight into the theme backdrop, no card: the logo in a blind-stamped ring, the name raised out of it
  | 'callingCard' // satin in the theme colour, and a cream calling card held by an accent clip with the logo and name
  | 'productPage' // a product page: their logo big on their colour, then the name as the product title on a white panel with Add to basket (Boutique)
  | 'gazette'  // a newsprint front page: blackletter masthead, today's dateline, what they do as the headline
  | 'studio'    // a studio website's top: what they do in chunky caps on a deep bar, then the logo and the name pressed into a panel of the accent as a lowercase wordmark
  | 'lounge'   // a rounded-top panel of their colour with the name in tall caps in the page's colour across its foot
  | 'softCard' // a tinted card with a wave: the round logo beside the name in heavy caps and a pill of what they do
  | 'hushFan'  // quiet: what they do in tiny caps, a ringed logo, the name in light italic, three of their chosen photos in separate boxes
  | 'stripes'  // a full-width strip of their colour: the logo in a ring of pearls, the name in spaced serif caps, no photo
  | 'bow'      // their photo with a ribbon down it and a bow on top, the logo on its foot, the name in italic serif
  | 'appHeader' // the logo on the left, the name and what they do beside it, like an app's profile top (Pure)
  | 'gridHeader' // the logo and name in a box of fine lines, what they do and their area in cells under it (Grid)
  | 'slateHeader' // a large name and compact logo above one accent rule (Slate)
  | 'haloHeader' // a centred logo in a fine ring, name and details beneath (Halo)
  | 'prismHeader' // angled translucent colour planes frame the logo and name (Custom's Prism top)
  | 'roseCampaign' // the name and a rule on a deep panel beside one chosen work photo, in a rose frame (Custom's Rose top)
  | 'customLeft' // the logo on the left, the name and what they do beside it (Custom: Cards)
  | 'customBig'  // no logo: what they do in small caps, then the name large on the left (Custom: Big Name)
  | 'archWindow' // their chosen photo in a tall arched window, the logo on its foot, the name centred under it (Retreat)
  | 'colourBlock' // a block of the accent: what they do, the name huge in a fat italic, the logo over its corner (Riviera)
  | 'split'    // their chosen photo down the left half, the logo, name and details on the right (Posy)
  | 'portfolioFront' // a chosen work photo above a compact provider identity and booking details
  | 'pinboardHeader' // up to three rounded photo pins side by side at uneven heights, then the logo beside the name
  | 'atelierLetterhead' // a tall noncursive wordmark, fine rules and a small provider image
  | 'posterCover' // a pill label, the name in huge two-tone caps, a taped photo and a handwritten line in a sparkle loop (Poster)
  | 'echoName'   // the name repeated large and faint behind a chosen photo, a dark round panel over it with the name (Hibiscus)
  | 'storefrontBanner' // a chosen photo the full width of the page, then a soft band with the name in slanted caps (Storefront)
  | 'orbitMark' // identity held inside offset orbital rings, with the name below
  | 'typeblockMark' // asymmetric typographic block with a vertical accent rail
  | 'filmstripMark' // two chosen images in a numbered film strip above the identity
  | 'neonSign' // a dark wall: the name as a glowing neon script sign, a lit tube under it, what they do in thin caps (Neon)
  | 'tallCapsule' // their chosen photo in a tall capsule; beside it the logo with the name in light lowercase to its right, area and pill chips of what they do; no Book button (Capsule)
  | 'collage' // up to four chosen photos layered at angles as captioned white prints, one round, the name in huge thin lowercase across their foot, an italic line and an outline Book pill under it (Moodboard)
  | 'pourTop' // the palest band of the pour: their logo, the name huge in an italic serif, what they do and where in spaced caps (Latte)
  | 'titlePage'; // a book's title page set straight on the backdrop: ringed logo, the name in IM Fell, an ornament, what they do in italic

/** The frame round the logo in the hero. */
export type PageLogoFrame =
  | 'circle' | 'arch' | 'polaroid' | 'doubleRing' | 'glossRing'
  | 'tilted'     // a rounded square card, tilted (Editorial)
  | 'accentRing' // a ring of the accent with a gap round the logo (Duet)
  | 'mat'        // square, in a white mat and a thin dark frame (Gallery)
  | 'square'     // a square with barely rounded corners (Snapshot)
  | 'stamped'    // a ring pressed into the paper round it (Embossed)
  | 'rounded'    // a square with soft, round corners, like an app icon (Pure)
  | 'sharp';     // a square with barely any rounding (Grid)

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
  /** The section links as words between two fine rules instead of a filled pill (Lounge, owner 2026-11-17). */
  jumpBarRuled?: boolean;
  /** About and Policies as two sections of their own instead of one tabbed card. */
  separateAboutAndPolicies: boolean;
  /** A service without a photo shows its number in the menu (01, 02…) instead of its first letter. */
  numberedServices: boolean;
  /** Their About on a full-width band of the accent (Editorial). */
  aboutOnBand?: boolean;
  /** Policy numerals in lower case ("i.", "ii.") rather than capitals. */
  numeralsLower?: boolean;
  /** Portfolio photos as perforated postage stamps, each tilted a little (Custom's Stamps). */
  stampPhotos?: boolean;
  /** Portfolio photos sit in a plate mark pressed into the page, like prints (Embossed). */
  plateMarkPhotos?: boolean;
  /** Portfolio photos as cream-bordered prints, each pinned by a small accent clip (Calling Card). */
  clippedPhotos?: boolean;
  /** The word on each service's book button, when the style has its own (Boutique: "Add to basket").
   *  Only the word changes: the button still opens the booking sheet. */
  bookLabel?: string;
  /** Portfolio photos square, in a fine ink frame with a halftone dot screen (Gazette). */
  halftonePhotos?: boolean;
  /** Portfolio photos set on a page, their caption in italic under each (Novel). */
  pagePhotos?: boolean;
  /** The page itself is the veil: the photo and the black veil stay behind the
   *  whole profile, and the content sits on a see-through dark glass sheet in
   *  white ink (Sheer, owner 2026-11-15). */
  veilPage?: boolean;
  /** Portfolio photos with big round corners (Lounge, Soft Focus, Bow). */
  roundedPhotos?: boolean;
  /** How each service on the price list is laid out, when not as the usual
   *  row (photo left, details, Book on the right). */
  serviceLayout?: ServiceLayout;
  /** How the portfolio's photos are laid out, when not as the usual columns. */
  photoLayout?: PhotoLayout;
  /** A small mark drawn between sections. */
  divider?: SectionDivider;
  /** A fine pattern printed across the content sheet, under everything. */
  pagePattern?: PagePattern;
  /** The portfolio comes straight after the top of the page, before the About ("work first"). */
  portfolioFirst?: boolean;
  /** On the Stripes strips, the content sits straight on its strip with no outlined box (Riviera). */
  openStrips?: boolean;
  /** A bar pinned over the foot of the page: the name, the lowest price and Book, which jumps to Services. */
  pinnedBookBar?: boolean;
  /** The style's own face for the name on a top that otherwise uses the
   *  Branding name font (Cover, Big Name, Centred, Side by Side), so the parts
   *  styles can reuse those tops in their own type. */
  heroNameFont?: HeroNameFont;
  /** The name is in the style's own lettering until the provider picks a
   *  Business Name Font other than Classic; then it's in that font, keeping
   *  the style's size, capitals and spacing (owner, 2026-11-19). */
  nameFontPickable?: boolean;
  /** The shape of the Book buttons, when not the usual round pill. */
  buttonShape?: ButtonShape;
  /** The heading and text fonts and the heading treatment. Custom fills it
   *  from the provider's picks (constants/customPageStyle); the styles built
   *  from Custom's parts (Posy on, owner 2026-11-19) set their own. */
  custom?: {
    /** Custom only: the look its parts started from. */
    layout?: CustomLayout;
    headingFont: string;
    headingScale: number;
    textFont: string;
    headingStyle: CustomHeadingStyle;
    /** Headings sit in the middle of the page (a centred top on an open page, or Script Word). */
    centred: boolean;
    /** The handwritten face for Script Word's lead-in (Custom: Pinyon Script). */
    scriptFont?: string;
  };
}

/** Service layouts beyond the usual row (owner, 2026-11-19, the parts canvas). */
export type ServiceLayout =
  | 'tiles'      // two across: the photo on top, then the name, length and price, Book under them (Posy)
  | 'photoCards' // one across: a wide photo on top, then the name and price beside Book (Riviera)
  | 'pillMenu'   // no photos: each name in a filled accent pill, the price and length beside it (Poster)
  | 'taggedRows' // no photos: the name in a serif, the price in light type, a hairline between rows (Moodboard)
  | 'spotlight'  // a row each: the photo in a round plate, the name in condensed caps, the price, "Book now" on the right (Hibiscus)
  | 'archTiles'  // two across, each photo standing in a soft arched frame, the name and price under (Storefront)
  | 'menu';      // a printed menu: no photos, the name, a dotted leader and the price, its length under (Muse)

/** Portfolio layouts beyond the usual columns. */
export type PhotoLayout =
  | 'arches'     // three across, each photo with a round arched top (Posy, Retreat, Storefront)
  | 'portfolioWall' // three airy cover images with the middle print set higher
  | 'pins'      // two staggered columns of rounded photos with captions
  | 'polaroids'  // three across as white-bordered prints, each tilted a little (Riviera)
  | 'feature'    // one big photo beside two small, then two more under them (Ledger)
  | 'swipe'     // one row of tall photos that scrolls sideways (Muse, Noir, Hibiscus)
  | 'capsules'  // four across as tall capsules at different heights, their feet level, like a skyline (Capsule)
  | 'taped';    // two across as white-bordered prints held on by a strip of tape, tilted by hand (Poster)

export type SectionDivider =
  | 'wave'  // a fine wavy line in the accent (Posy)
  | 'line'  // a hairline across the page (Noir)
  | 'stars'  // three small stars between two fine rules (Muse)
  | 'dots'  // three small dots, centred (Retreat)
  | 'sparkles'; // a hand-drawn loop with a sparkle at each end (Poster)

export type ButtonShape =
  | 'square'    // barely rounded, the word in spaced capitals (Noir)
  | 'textLink'  // no button at all: the word underlined in the accent (Muse)
  | 'outline'   // a round outline in the ink, no fill (Retreat)
  | 'arrowPill' // a filled pill, the word then a small arrow in a circle, like "Order now" (Hibiscus)
  | 'shopBox'   // a small square outline, the word in spaced capitals, like "Shop now" (Storefront)
  | 'glowPill'  // a round outline in the accent, the word in spaced capitals, glowing on a dark page (Neon)
  | 'darkPill' // a full pill in the page's ink (dark on a pale page, pale on a dark one), the word in lowercase (Capsule)
  | 'captionPill'; // a fine outline pill in the ink, the word in thin, very widely spaced capitals (Moodboard)

export interface HeroNameFont {
  fontFamily: string;
  /** Some faces draw small for their size; this evens them out. */
  scale?: number;
  /** Line height as a multiple of the size; 1.35 unless the face needs more. */
  lineRatio?: number;
  transform?: 'uppercase' | 'lowercase';
  letterSpacing?: number;
}

export type PagePattern =
  | 'gingham' // a soft check of the accent (Posy)
  | 'glow'    // a soft wash of the accent from the top left corner (Retreat)
  | 'lined';  // ruled lines across the page, like a ledger (Ledger)

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
    key: 'apothecary', name: 'Apothecary', description: 'Your name on a ruled label, numbered treatments',
    heading: 'labelCaps', cards: 'label', policies: 'numerals', logo: 'circle',
    hero: 'labelCard', aboutInHero: false, numeralsLower: true,
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
    key: 'signature', name: 'Signature', description: 'Your name signed in pen beside a ringed logo, numbered sections',
    heading: 'indexed', cards: 'topRule', policies: 'boxes', logo: 'accentRing',
    hero: 'signed', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
    nameFontPickable: true,
  },
  {
    key: 'quiet', name: 'Quiet', description: 'Your photo left clear, your name on a calm band',
    heading: 'quietCaps', cards: 'none', policies: 'definition', logo: 'circle',
    hero: 'quietBand', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: true,
    nameFontPickable: true,
  },
  // 2026-11-15, round 4 (https://claude.ai/artifact/68xp8mxLLTCV6pVuiQHJZS):
  // a see-through black veil over their photo, like the owner's sheer-black reference.
  {
    key: 'sheer', name: 'Sheer', description: 'Your photo under a black veil down the whole page, content on see-through glass',
    heading: 'sheerCaps', cards: 'sheer', policies: 'outlined', logo: 'circle',
    hero: 'veil', aboutInHero: false, veilPage: true,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
  },
  // 2026-11-15, round 4 (https://claude.ai/artifact/68xp8mxLLTCV6pVuiQHJZS):
  // blind emboss, everything tone on tone, after the owner's embossed
  // "BOOKING for September" reference.
  {
    key: 'embossed', name: 'Embossed', description: 'Pressed paper: your name raised in the page, your photos in plate marks',
    heading: 'embossCaps', cards: 'raised', policies: 'recessed', logo: 'stamped',
    hero: 'pressed', aboutInHero: false, plateMarkPhotos: true,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: true,
  },
  // 2026-11-15, round 4 (https://claude.ai/artifact/68xp8mxLLTCV6pVuiQHJZS,
  // board 23): satin and a calling card held by a clip, both in the theme colours.
  {
    key: 'callingCard', name: 'Calling Card', description: 'Your name on a cream card held by a clip, over satin in your colours',
    heading: 'engravedCaps', cards: 'clipped', policies: 'ribbon', logo: 'circle',
    hero: 'callingCard', aboutInHero: false, clippedPhotos: true,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
  },
  // 2026-11-15, round 4 (https://claude.ai/artifact/68xp8mxLLTCV6pVuiQHJZS,
  // board 24): "shopping cart vibes", the logo printed on the bag.
  {
    key: 'boutique', name: 'Boutique', description: 'Your page as a product page: your logo up top, Add to basket',
    heading: 'shopSerif', cards: 'product', policies: 'accordion', logo: 'circle',
    hero: 'productPage', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
    bookLabel: 'Add to basket',
  },
  // 2026-11-15, round 4 (https://claude.ai/artifact/68xp8mxLLTCV6pVuiQHJZS, board 25).
  {
    key: 'gazette', name: 'Gazette', description: 'A newspaper front page: blackletter masthead, headlines, printed rules',
    heading: 'newsRule', cards: 'ruled', policies: 'columns', logo: 'square',
    hero: 'gazette', aboutInHero: false, halftonePhotos: true,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: true,
  },
  // 2026-11-15, round 4 (https://claude.ai/artifact/68xp8mxLLTCV6pVuiQHJZS):
  // a book's type and chapters round the provider's own content. The
  // cloth-bound cover hero and the bookish section names (The Author, House
  // Rules, Praise, Plates) were dropped at the owner's request on 2026-11-15.
  {
    key: 'novel', name: 'Novel', description: 'A book\'s title page with your name set in old type, sections as chapters',
    heading: 'chapter', cards: 'pages', policies: 'numberedRules', logo: 'circle',
    hero: 'titlePage', aboutInHero: false, pagePhotos: true,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
  },
  // 2026-11-16: from the owner's references, a burgundy-and-blush studio
  // website ("TURN UP the HEAT.") and an embossed lowercase wordmark ("imani.").
  {
    key: 'studio', name: 'Studio', description: 'A studio website: what you do in chunky caps, your name pressed in below your logo',
    heading: 'chunkyCaps', cards: 'tabbed', policies: 'membership', logo: 'circle',
    hero: 'studio', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
  },
  // 2026-11-16, the demure set (https://claude.ai/artifact/LPquiWNrboArq6NjcZi9ny,
  // boards 28–32), from the owner's Acuity "lash lounge" booking sites and a
  // lilac beauty-app mockup. Hush opens on three photos the provider picks in
  // Branding (portfolio_items.is_featured; see heroPhotos.ts). 2026-11-17
  // (https://claude.ai/artifact/L6KZ2rjSqidNWQ7r9sd8ee): Lounge lost its photo
  // and got ruled section tabs, and Pearl's fan was replaced by colour strips
  // and outlined boxes and renamed Stripes.
  {
    key: 'lounge', name: 'Lounge', description: 'Your name in tall caps on your colour, outlined round boxes',
    heading: 'loungeCaps', cards: 'outlineRound', policies: 'loungeGrid', logo: 'circle',
    hero: 'lounge', aboutInHero: false, roundedPhotos: true,
    heroPills: false, jumpBar: true, jumpBarRuled: true, separateAboutAndPolicies: true, numberedServices: false,
  },
  {
    key: 'softFocus', name: 'Soft Focus', description: 'Soft tinted cards, your logo on a wave, heavy caps',
    heading: 'softCaps', cards: 'soft', policies: 'softTiles', logo: 'circle',
    hero: 'softCard', aboutInHero: false, roundedPhotos: true,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: true,
  },
  {
    key: 'hush', name: 'Hush', description: 'Very quiet: a light italic name and three of your favourite photos',
    heading: 'hushRule', cards: 'open', policies: 'gentleNotes', logo: 'doubleRing',
    hero: 'hushFan', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
    nameFontPickable: true,
  },
  {
    key: 'stripes', name: 'Stripes', description: 'Each section on a strip of your colour, everything in fine outlined boxes',
    heading: 'stripeCaps', cards: 'stripes', policies: 'pearlNotes', logo: 'circle',
    hero: 'stripes', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
  },
  {
    key: 'bow', name: 'Bow', description: 'A satin bow tied over your photo, soft italic headings',
    heading: 'bowSerif', cards: 'bow', policies: 'ribbonBand', logo: 'circle',
    hero: 'bow', aboutInHero: false, roundedPhotos: true,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
  },
  // 2026-11-18: two simple, clean templates the owner picked (2 and 6) from
  // https://claude.ai/artifact/CouRMrARqSAzAiqF73dtYe. No ornaments: the
  // provider's colours do the work.
  {
    key: 'pure', name: 'Pure', description: 'Clean and modern: your logo beside your name, tidy grouped rows',
    heading: 'appBold', cards: 'grouped', policies: 'settingsRows', logo: 'rounded',
    hero: 'appHeader', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
  },
  {
    key: 'grid', name: 'Grid', description: 'Neat and graphic: fine lines box everything in, numbered sections',
    heading: 'gridIndex', cards: 'gridBox', policies: 'gridCells', logo: 'sharp',
    hero: 'gridHeader', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: true,
  },
  // Clean, category-neutral looks. Both use the provider's colours, name font
  // and category labels rather than beauty-service-specific artwork or copy.
  {
    key: 'slate', name: 'Slate', description: 'A bold name, fine accent line and clean service cards',
    heading: 'quietCaps', cards: 'flat', policies: 'settingsRows', logo: 'rounded',
    hero: 'slateHeader', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
    buttonShape: 'outline', photoLayout: 'swipe', divider: 'line',
  },
  {
    key: 'halo', name: 'Halo', description: 'A centred logo and name with soft framing and airy sections',
    heading: 'spacedCaps', cards: 'sheer', policies: 'outlined', logo: 'circle',
    hero: 'haloHeader', aboutInHero: false, roundedPhotos: true,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
    buttonShape: 'outline', divider: 'dots',
  },
  // 2026-11-19: styles built from Custom's parts, each its own fixed mix
  // (owner picked all eight on https://claude.ai/artifact/3kCvU1EuLzUqpUaH9jBsCd).
  {
    key: 'posy', name: 'Posy', description: 'Fresh and garden-sweet: your photo beside your name, soft round cards on gingham',
    heading: 'custom', cards: 'soft', policies: 'softTiles', logo: 'circle',
    hero: 'split', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
    serviceLayout: 'tiles', photoLayout: 'arches', divider: 'wave', pagePattern: 'gingham', portfolioFirst: true,
    custom: {
      headingFont: 'YoungSerif-Regular', headingScale: 0.95, textFont: 'Figtree-SemiBold',
      headingStyle: 'script', centred: true, scriptFont: 'Ephesis-Regular',
    },
  },
  {
    key: 'riviera', name: 'Riviera', description: 'A holiday postcard: your name on a block of your colour, stripes and polaroids',
    heading: 'custom', cards: 'stripes', policies: 'gentleNotes', logo: 'circle',
    hero: 'colourBlock', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
    openStrips: true, serviceLayout: 'photoCards', photoLayout: 'polaroids', pinnedBookBar: true,
    custom: { headingFont: 'Jost-Light', headingScale: 1, textFont: 'Jost-Light', headingStyle: 'caps', centred: true },
  },
  {
    key: 'noir', name: 'Noir', description: 'Moody and photo-led: your photo fills the top, sharp outlined boxes, numbered services',
    heading: 'custom', cards: 'outline', policies: 'accordion', logo: 'circle',
    hero: 'cover', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: true,
    nameFontPickable: true,
    heroNameFont: { fontFamily: 'Gloock-Regular' },
    // No pinned Book bar, and the portfolio scrolls sideways (user, 2026-11-19).
    photoLayout: 'swipe', divider: 'line', buttonShape: 'square', portfolioFirst: true,
    custom: { headingFont: 'Gloock-Regular', headingScale: 1, textFont: 'HankenGrotesk-Medium', headingStyle: 'underlined', centred: false },
  },
  {
    key: 'muse', name: 'Muse', description: 'Wedding stationery: your name very large, a printed menu on paper cards, stars between',
    heading: 'custom', cards: 'paper', policies: 'gentleNotes', logo: 'circle',
    hero: 'customBig', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
    nameFontPickable: true,
    heroNameFont: { fontFamily: 'Italiana_400Regular', scale: 1.05 },
    serviceLayout: 'menu', photoLayout: 'swipe', divider: 'stars', buttonShape: 'textLink',
    custom: {
      headingFont: 'Bellefair-Regular', headingScale: 1.05, textFont: 'Bellefair-Regular',
      headingStyle: 'script', centred: true, scriptFont: 'Italianno-Regular',
    },
  },
  {
    key: 'retreat', name: 'Retreat', description: 'Calm and open: your photo in an arched window, no boxes, a soft glow',
    heading: 'custom', cards: 'open', policies: 'hairline', logo: 'circle',
    hero: 'archWindow', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
    divider: 'dots', buttonShape: 'outline', pagePattern: 'glow', photoLayout: 'arches',
    custom: { headingFont: 'Marcellus-Regular', headingScale: 1, textFont: 'DidactGothic-Regular', headingStyle: 'typed', centred: true },
  },
  {
    key: 'bonbon', name: 'Bonbon', description: 'Sweet and playful: chunky rounded type, soft cards, tilted polaroids',
    heading: 'custom', cards: 'soft', policies: 'softTiles', logo: 'circle',
    hero: 'stacked', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
    heroNameFont: { fontFamily: 'Sniglet_800ExtraBold', scale: 0.95, lineRatio: 1.4 },
    serviceLayout: 'tiles', photoLayout: 'polaroids', divider: 'wave',
    custom: { headingFont: 'Fredoka_600SemiBold', headingScale: 1, textFont: 'VarelaRound_400Regular', headingStyle: 'typed', centred: false },
  },
  {
    key: 'ledger', name: 'Ledger', description: 'An old shop ledger: your name in engraved capitals, a ruled page, a dotted price list',
    heading: 'custom', cards: 'paper', policies: 'hairline', logo: 'circle',
    hero: 'stacked', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
    nameFontPickable: true,
    heroNameFont: { fontFamily: 'LibreCaslonDisplay-Regular', scale: 0.8, transform: 'uppercase', letterSpacing: 2 },
    serviceLayout: 'menu', photoLayout: 'feature', divider: 'line', buttonShape: 'square', pagePattern: 'lined',
    custom: { headingFont: 'Oswald-Medium', headingScale: 1, textFont: 'OldStandardTT-Regular', headingStyle: 'caps', centred: true },
  },
  {
    key: 'pinboard', name: 'Pinboard', description: 'Your work as a board of rounded pins, with bold headings and soft cards',
    heading: 'custom', cards: 'soft', policies: 'softTiles', logo: 'circle',
    hero: 'pinboardHeader', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
    serviceLayout: 'tiles', photoLayout: 'pins', portfolioFirst: true, roundedPhotos: true,
    nameFontPickable: true,
    custom: { headingFont: 'Manrope-Bold', headingScale: 1, textFont: 'HankenGrotesk-Medium', headingStyle: 'typed', centred: false },
  },
  {
    key: 'poster', name: 'Poster', description: 'Bold two-tone capitals, taped prints and your services as pink pills',
    heading: 'twoToneCaps', cards: 'open', policies: 'stickers', logo: 'circle',
    hero: 'posterCover', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
    serviceLayout: 'pillMenu', photoLayout: 'taped', divider: 'sparkles',
    nameFontPickable: true,
  },
  {
    key: 'hibiscus', name: 'Hibiscus', description: 'Your name echoing behind your work, round panels and "Book now" pills',
    heading: 'enjoyStack', cards: 'soft', policies: 'bubbles', logo: 'rounded',
    hero: 'echoName', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
    serviceLayout: 'spotlight', photoLayout: 'swipe', buttonShape: 'arrowPill',
    nameFontPickable: true,
  },
  {
    key: 'storefront', name: 'Storefront', description: 'A full-width photo, bold slanted headings and services in arches, like a shop',
    heading: 'slantCaps', cards: 'stripes', policies: 'accordion', logo: 'circle',
    hero: 'storefrontBanner', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
    openStrips: true, serviceLayout: 'archTiles', photoLayout: 'arches', buttonShape: 'shopBox',
    nameFontPickable: true,
  },
  {
    key: 'orbit', name: 'Orbit', description: 'Concentric rings, a floating mark and spacious modern lettering',
    heading: 'custom', cards: 'outline', policies: 'divided', logo: 'circle',
    hero: 'orbitMark', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
    divider: 'dots', nameFontPickable: true,
    custom: { headingFont: 'PoiretOne_400Regular', headingScale: 1.25, textFont: 'HankenGrotesk-Medium', headingStyle: 'caps', centred: true },
  },
  {
    key: 'typeblock', name: 'Typeblock', description: 'An offset colour rail, oversized name and graphic section rhythm',
    heading: 'custom', cards: 'block', policies: 'columns', logo: 'square',
    hero: 'typeblockMark', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: true,
    serviceLayout: 'menu', photoLayout: 'feature', buttonShape: 'square', nameFontPickable: true,
    custom: { headingFont: 'BebasNeue_400Regular', headingScale: 1.3, textFont: 'HankenGrotesk-Medium', headingStyle: 'typed', centred: false },
  },
  {
    key: 'filmstrip', name: 'Filmstrip', description: 'Two frames of your work, numbered like a contact sheet',
    heading: 'custom', cards: 'topRule', policies: 'numberedRules', logo: 'sharp',
    hero: 'filmstripMark', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
    photoLayout: 'swipe', portfolioFirst: true, nameFontPickable: true,
    custom: { headingFont: 'TenorSans_400Regular', headingScale: 1.05, textFont: 'HankenGrotesk-Medium', headingStyle: 'caps', centred: false },
  },
  {
    key: 'portfolio', name: 'Portfolio', description: 'A chosen cover photo, your image and a calm gallery of your work',
    heading: 'custom', cards: 'open', policies: 'hairline', logo: 'circle',
    hero: 'portfolioFront', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
    photoLayout: 'portfolioWall', portfolioFirst: true,
    heroNameFont: { fontFamily: 'GildaDisplay-Regular', scale: 1.1, lineRatio: 1.2 },
    custom: { headingFont: 'GildaDisplay-Regular', headingScale: 1.1, textFont: 'HankenGrotesk-Medium', headingStyle: 'typed', centred: false },
  },
  {
    key: 'atelier', name: 'Atelier', description: 'Tall elegant lettering, fine rules and plenty of breathing room',
    heading: 'custom', cards: 'open', policies: 'definition', logo: 'circle',
    hero: 'atelierLetterhead', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
    divider: 'line',
    custom: { headingFont: 'Bellefair-Regular', headingScale: 1.2, textFont: 'HankenGrotesk-Medium', headingStyle: 'typed', centred: false },
  },
  {
    key: 'neon', name: 'Neon', description: 'Your name as a glowing neon sign on a dark wall, lit outlines round your services',
    heading: 'neonScript', cards: 'lit', policies: 'outlined', logo: 'circle',
    hero: 'neonSign', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
    roundedPhotos: true, buttonShape: 'glowPill', nameFontPickable: true,
  },
  // 2026-11-23: the clean-girl round of the same canvas (owner picked 14
  // Capsule, 13 Moodboard and 11 Latte).
  {
    key: 'capsule', name: 'Capsule', description: 'Pilates-studio calm: your photo in a tall capsule, everything a soft pill in your colours',
    heading: 'pillMark', cards: 'capsule', policies: 'softTiles', logo: 'circle',
    hero: 'tallCapsule', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
    photoLayout: 'capsules', buttonShape: 'darkPill',
  },
  {
    key: 'moodboard', name: 'Moodboard', description: 'A soft Pinterest board: your photos layered as captioned prints, your name huge and thin across them',
    heading: 'captionCaps', cards: 'print', policies: 'hairline', logo: 'circle',
    hero: 'collage', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
    serviceLayout: 'taggedRows', photoLayout: 'polaroids', buttonShape: 'captionPill', nameFontPickable: true,
  },
  {
    key: 'latte', name: 'Latte', description: 'A tonal pour: each section a shade deeper than the last, milk to espresso, soft pill services',
    heading: 'pourSerif', cards: 'pour', policies: 'gentleNotes', logo: 'circle',
    hero: 'pourTop', aboutInHero: false,
    heroPills: false, jumpBar: false, separateAboutAndPolicies: true, numberedServices: false,
    roundedPhotos: true,
  },
];

/** How many portfolio photos this style's hero shows, from the ones the
 *  provider picks in Branding → Your Photos (heroPhotos.ts); 0 when it has
 *  nothing to pick (owner, 2026-11-17: "any template with images should be
 *  able to select the image"). */
export function heroPhotoPickLimit(style: PageStyle): number {
  switch (style.hero) {
    case 'editorial': return 1; // the tilted card
    case 'blockName': return 3; // Snapshot's strip
    case 'hushFan': return 3;   // three boxes
    // The photo under the ribbon. Owner, 2026-11-19: every template that
    // needs a photo lets the provider pick it (the design itself is unchanged).
    case 'bow': return 1;
    case 'split': return 1;    // Posy's left half
    case 'archWindow': return 1; // Retreat's window
    case 'portfolioFront': return 1; // Portfolio's cover image
    case 'pinboardHeader': return 3; // Pinboard's board of pins
    case 'roseCampaign': return 1; // Custom's Rose top: the photo beside the name
    case 'posterCover': return 1;  // Poster's taped print
    case 'echoName': return 1;     // Hibiscus's photo in front of the echoed name
    case 'storefrontBanner': return 1; // Storefront's full-width photo
    case 'filmstripMark': return 2;
    case 'tallCapsule': return 1;  // Capsule's tall capsule
    case 'collage': return 4;  // Moodboard's four prints
    default: return 0;
  }
}

/** The shape (width ÷ height) of the hero's slot for its `index`th photo of
 *  `count`, roughly as drawn on a phone. Branding's adjust sheet frames the
 *  photo in this shape, so what the provider lines up is what the hero shows. */
export function heroPhotoSlotAspect(hero: PageHero, index: number, count: number): number {
  switch (hero) {
    case 'editorial': return 84 / 118;      // the tilted back card
    case 'blockName': return 130 / 220;     // a third of Snapshot's strip
    case 'hushFan': return 0.72;            // inside Hush's matted box
    case 'bow': return 1.15;                // under the ribbon
    case 'split': return 0.62;              // Posy's left half
    case 'archWindow': return 196 / 236;    // Retreat's window
    case 'portfolioFront': return 358 / 230; // Portfolio's cover
    case 'roseCampaign': return 156 / 248;  // Rose's photo, beside the name panel
    case 'posterCover': return 138 / 168;   // Poster's taped print
    case 'echoName': return 190 / 230;      // Hibiscus's photo
    case 'storefrontBanner': return 390 / 300; // Storefront's full-width photo
    case 'filmstripMark': return 158 / 190;
    case 'tallCapsule': return 142 / 232;  // Capsule's tall capsule
    // Moodboard's prints, inside their white borders; the fourth is round.
    case 'collage': return index === 3 ? 1 : ([138 / 164, 128 / 124, 108 / 114][index] ?? 1);
    case 'pinboardHeader': {
      // Side by side at uneven heights (150, 124, 138); one photo is 156 across.
      if (count <= 1) return 358 / 156;
      const width = count === 2 ? 175 : 114;
      return width / ([150, 124, 138][index] ?? 150);
    }
    default: return 0.8;
  }
}

export function isPageStyleKey(value: string | null | undefined): value is PageStyleKey {
  return value === 'custom' || PAGE_STYLES.some(style => style.key === value);
}

/** The style for a stored key; anything unknown is Classic. Custom isn't in
 *  PAGE_STYLES (it has no fixed design): pass the provider's picks, or it
 *  shows with the default ones. */
export function getPageStyle(key: string | null | undefined, custom?: CustomChoices): PageStyle {
  if (key === 'custom') return customPageStyle(custom ?? DEFAULT_CUSTOM_CHOICES);
  return PAGE_STYLES.find(style => style.key === key) ?? PAGE_STYLES[0]!;
}

/** Which section a heading belongs to, so a two-part heading can say something better than the bare title. */
export type PageSectionKey =
  | 'about' | 'policies' | 'services' | 'reviews' | 'hours' | 'contact'
  | 'info' | 'portfolio' | 'specialities' | 'policyPages'
  // The provider's own sections (features/providers/ownSections.ts), under Additional Information.
  | 'keyInfo' | 'faq' | 'aftercare' | 'custom' | 'disclaimer';

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
  keyInfo: 'Key Information',
  faq: 'FAQs',
  aftercare: 'Aftercare',
  // Only a fallback: a Custom section is headed with its own name (customHeading).
  custom: 'More Information',
  disclaimer: 'Disclaimer',
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
  keyInfo: ['Key', 'Information'],
  faq: ['Common', 'Questions'],
  aftercare: ['Your', 'Aftercare'],
  custom: ['More', 'Information'],
  disclaimer: ['The', 'Disclaimer'],
};

/** Styles whose About heading isn't "Meet the Artist" (owner, 2026-11-19).
 *  A one-word heading has no lead-in. */
const ABOUT_HEADING_BY_STYLE: Partial<Record<PageStyleKey, [string, string]>> = {
  sheer: ['', 'About'],
  signature: ['', 'About'],
  snapshot: ['', 'About'],
  softFocus: ['', 'About'],
  bow: ['', 'About'],
  quiet: ['Meet', 'the Provider'],
  boutique: ['Meet', 'the Provider'],
};

export function headingPair(section: PageSectionKey, styleKey?: PageStyleKey): [string, string] {
  if (section === 'about' && styleKey) return ABOUT_HEADING_BY_STYLE[styleKey] ?? HEADING_PAIRS.about;
  return HEADING_PAIRS[section];
}

/** A Custom section's name split the way the two-part headings need it: the
 *  first word as the lead-in, the rest as the name ("Before" / "you arrive").
 *  A one-word name is all name, with no lead-in. */
export function customHeadingPair(title: string): [string, string] {
  const words = title.trim().split(/\s+/);
  return words.length > 1 ? [words[0]!, words.slice(1).join(' ')] : ['', words[0] ?? ''];
}

/** Hush's section titles: small quiet words, drawn in spaced caps between hairlines. */
export const HUSH_TITLES: Record<PageSectionKey, string> = {
  about: 'hello',
  policies: 'a few gentle notes',
  services: 'services',
  reviews: 'reviews',
  hours: 'opening hours',
  contact: 'say hello',
  info: 'good to know',
  portfolio: 'my work',
  specialities: 'what I love',
  policyPages: 'before you book',
  keyInfo: 'key information',
  faq: 'questions',
  aftercare: 'aftercare',
  custom: 'more information',
  disclaimer: 'disclaimer',
};

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
  keyInfo: '11',
  faq: '12',
  aftercare: '13',
  disclaimer: '14',
  custom: '15',
};

/** Novel's chapter titles: plain section names under each "Chapter" line. */
const CHAPTER_TITLES: Record<PageSectionKey, string> = {
  about: 'About Me',
  policies: 'Booking Policies',
  services: 'The Services',
  policyPages: 'Before You Book',
  portfolio: 'My Portfolio',
  reviews: 'Client Reviews',
  hours: 'Opening Hours',
  contact: 'Get in Touch',
  info: 'Good to Know',
  specialities: 'My Specialities',
  keyInfo: 'Key Information',
  faq: 'Common Questions',
  aftercare: 'Your Aftercare',
  custom: 'More Information',
  disclaimer: 'Disclaimer',
};

/** Novel's heading for a section: ["Chapter III", "The Services"], numbered in page order. */
export function chapterHeading(section: PageSectionKey): [string, string] {
  return [`Chapter ${romanNumeral(Number(SECTION_NUMBERS[section]) - 1)}`, CHAPTER_TITLES[section]];
}

/** Roman numerals for the numbered policy rows (Heritage, Apothecary). */
export function romanNumeral(index: number, lower = false): string {
  const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];
  const value = numerals[index] ?? String(index + 1);
  return lower ? `${value.toLowerCase()}.` : value;
}

/** Two-digit menu numbers for the Spa style: 1 → "01". */
export function menuNumber(index: number): string {
  return String(index + 1).padStart(2, '0');
}

// ── Policy pictures ──────────────────────────────────────────────────────────
// Branding → Policy Pictures: how a provider's uploaded policy pages sit in
// their profile. Melt in and Bleed (owner's picks A and B on the 2026-11-13
// canvas) run the pages full size after the services, in their own edge
// colours. The owner asked on 2026-11-16 for the story circles (pick D) to be
// a choice of their own rather than always on, and for subtler choices for
// providers who don't want their pages full size in the page: a row of small
// thumbnails, or just a button. Then for more designs of the pages in the page:
// framed prints, a swipe-through, a fanned stack and a peek at the top page.
// Stored as the sixth `|` part of profile_theme.

export type PolicyPictureLook =
  | 'melt' | 'bleed' | 'framed' | 'swipe' | 'fan' | 'peek'
  | 'story' | 'thumbs' | 'button';

export const DEFAULT_POLICY_PICTURE_LOOK: PolicyPictureLook = 'melt';

export const POLICY_PICTURE_LOOKS: readonly { key: PolicyPictureLook; name: string; description: string }[] = [
  { key: 'melt', name: 'Melt in', description: 'Full size, fading into your page' },
  { key: 'bleed', name: 'Bleed', description: 'Full size, on a wavy band of their own colour' },
  { key: 'framed', name: 'Framed', description: 'Each page as a framed print on your page' },
  { key: 'swipe', name: 'Swipe', description: 'Full width, one page at a time, swipe through' },
  { key: 'fan', name: 'Fanned', description: 'Your pages fanned out like cards, tap to read' },
  { key: 'peek', name: 'Peek', description: 'The top of your policy, then Read the full policy' },
  { key: 'story', name: 'Story', description: 'A circle near the top that opens full screen' },
  { key: 'thumbs', name: 'Thumbnails', description: 'A small row of pages after your services' },
  { key: 'button', name: 'Button', description: 'Just a "Read my policy" button' },
];

/** Where a look puts the pages: story circles near the top of the profile,
 *  or (every other look) their own section after the services. */
export function policyPicturePlacement(look: PolicyPictureLook): 'top' | 'afterServices' {
  return look === 'story' ? 'top' : 'afterServices';
}

export function isPolicyPictureLook(value: string | null | undefined): value is PolicyPictureLook {
  return POLICY_PICTURE_LOOKS.some(look => look.key === value);
}
