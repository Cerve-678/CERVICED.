import type { PageHero } from "../../../constants/pageStyles";

/** Where every page's top starts: clear of the status bar and the buttons on
 *  most phones, with a centred logo or name in the gap between them. */
export const HERO_TOP_PADDING = 100;

/** How far under the back, bookmark and share buttons a top that reaches them starts. */
export const HERO_GAP_UNDER_BUTTONS = 16;

/** The tops whose first edge runs out to the sides of the page (a photo, a
 *  block or strip of colour, an outlined card, prints, an echoed name), so
 *  at the usual 100pt they sat right against the buttons over the page,
 *  or just under them on the taller iPhones (user, 2026-11-23). Measured
 *  in the dev web preview against an iPhone header; every other top opens
 *  on a centred logo or name, or already sits lower. */
const TOPS_THAT_REACH_THE_BUTTONS: ReadonlySet<PageHero> = new Set<PageHero>([
  "blockName",        // Snapshot
  "split",            // Posy
  "colourBlock",      // Riviera
  "storefrontBanner", // Storefront
  "stripes",          // Stripes
  "portfolioFront",   // Portfolio
  "echoName",         // Hibiscus, and Custom's Hibiscus top
  "collage",          // Moodboard
  "hushFan",          // Hush
  "tallCapsule",      // Capsule
  "posterCover",      // Poster
]);

/**
 * How far down the screen the top of a provider's page starts.
 *
 * `headerBottom` is where the app's back, bookmark and share buttons end,
 * measured from the top of the screen; leave it out where nothing sits over
 * the page (the website, Branding's preview, the owner's own preview).
 * Only a top that reaches the buttons moves, and only by what the phone
 * needs, so a small-notch phone keeps the usual start.
 */
export function heroTopPadding(
  hero: PageHero,
  hasHeroPhotos: boolean,
  headerBottom: number | undefined,
): number {
  if (headerBottom === undefined) return HERO_TOP_PADDING;
  // Pinboard opens on its pins (full width, 12pt down) only when it has photos.
  const reaches = TOPS_THAT_REACH_THE_BUTTONS.has(hero) || (hero === "pinboardHeader" && hasHeroPhotos);
  if (!reaches) return HERO_TOP_PADDING;
  return Math.max(HERO_TOP_PADDING, headerBottom + HERO_GAP_UNDER_BUTTONS);
}
