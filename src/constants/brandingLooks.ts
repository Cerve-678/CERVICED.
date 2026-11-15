// ── Branding Looks ───────────────────────────────────────────────────────────
// Branding → Looks: finished combinations a provider can start from. One tap
// sets the page style, colour set, content colour, hero finish, card shape and
// business-name font together; every section below still fine-tunes it.
//
// A Look is only a shortcut. Nothing stores which Look was picked: the profile
// saves the individual choices exactly as before, and a Look shows as chosen
// while every one of its parts still matches what's on screen.
//
// Looks leave the background photo and the policy-picture look alone, since
// those belong to the provider rather than to a style.

import {
  DEFAULT_CARD_SHAPE,
  DEFAULT_HERO_FINISH,
  LINK_ONLY_HERO_FINISHES,
  LINK_ONLY_THEMES,
  PROVIDER_THEMES,
  SHEET_BG,
  SHEET_OPTIONS,
  type CardShape,
  type HeroFinish,
} from './providerThemes';
import { DEFAULT_PAGE_STYLE, type PageStyleKey } from './pageStyles';
import { LINK_ONLY_FONTS } from './providerFonts';

export interface BrandingLook {
  key: string;
  name: string;
  /** Who or what it suits, in a few words. */
  description: string;
  /** A PROVIDER_THEMES key. */
  theme: string;
  /** A SHEET_OPTIONS key. Leave it out to use the colour set's own suggestion. */
  sheet?: string;
  finish: HeroFinish;
  shape: CardShape;
  pageStyle: PageStyleKey;
  /** A PROVIDER_FONTS key. */
  font: string;
}

export const BRANDING_LOOKS: readonly BrandingLook[] = [
  {
    key: 'original', name: 'The Original', description: 'The CERVICED look',
    theme: 'app', finish: DEFAULT_HERO_FINISH, shape: DEFAULT_CARD_SHAPE, pageStyle: DEFAULT_PAGE_STYLE, font: 'default',
  },
  {
    key: 'blush', name: 'Blush', description: 'Soft pink and rounded',
    theme: 'blush', finish: DEFAULT_HERO_FINISH, shape: DEFAULT_CARD_SHAPE, pageStyle: DEFAULT_PAGE_STYLE, font: 'varela-round',
  },
  {
    key: 'clean-girl', name: 'Clean Girl', description: 'Milky whites and fine lines',
    theme: 'milkglaze', finish: 'sheen', shape: 'rounded', pageStyle: 'spa', font: 'tenor-sans',
  },
  {
    key: 'old-money', name: 'Old Money', description: 'Black, gold and a script name',
    theme: 'blackgold', sheet: 'champagne', finish: 'sheen', shape: 'square', pageStyle: 'arch', font: 'pinyon-script',
  },
  {
    key: 'magazine', name: 'Magazine', description: 'Deep red bands, a cover-story feel',
    theme: 'garnet', finish: 'solid', shape: 'square', pageStyle: 'editorial', font: 'playfair-display',
  },
  {
    key: 'white-cube', name: 'White Cube', description: 'Ink on linen, your work on show',
    theme: 'linenink', finish: 'solid', shape: 'square', pageStyle: 'gallery', font: 'italiana',
  },
  {
    key: 'lights-out', name: 'Lights Out', description: 'True black and big, bold type',
    theme: 'black', finish: 'solid', shape: 'square', pageStyle: 'cover', font: 'bebas-neue',
  },
  {
    key: 'emerald-hour', name: 'Emerald Hour', description: 'Bottle green, gold and art deco',
    theme: 'emeraldgold', finish: 'glow', shape: 'square', pageStyle: 'framed', font: 'limelight',
  },
  {
    key: 'cherry-gloss', name: 'Cherry Gloss', description: 'Glossy cherry, bubbly and fun',
    theme: 'cherrycocoa', finish: 'glow', shape: 'rounded', pageStyle: 'glossy', font: 'shrikhand',
  },
  {
    key: 'sunday-scrapbook', name: 'Sunday Scrapbook', description: 'Powder blue, apricot and a polaroid',
    theme: 'powderapricot', finish: 'split', shape: 'rounded', pageStyle: 'scrapbook', font: 'pacifico',
  },
  {
    key: 'matcha', name: 'Matcha', description: 'Calm greens for wellness',
    theme: 'matchaink', finish: 'blend', shape: 'rounded', pageStyle: 'spa', font: 'josefin-sans',
  },
];

/** The concrete values a Look puts on screen, ready to set into Branding's state. */
export interface ResolvedLook {
  themeChoice: string;
  sheetColor: string;
  accentColor: string;
  gradient: [string, string];
  finish: HeroFinish;
  shape: CardShape;
  pageStyle: PageStyleKey;
  font: string;
}

/** Resolve a Look's colour set and content colour the same way Branding's
 *  colour picker does, so applying a Look and picking its parts by hand
 *  produce the same saved profile. */
export function resolveLook(look: BrandingLook): ResolvedLook {
  const preset = PROVIDER_THEMES.find(t => t.key === look.theme);
  if (!preset) throw new Error(`Branding look "${look.key}" names an unknown colour set "${look.theme}"`);
  const sheetKey = look.sheet ?? preset.suggestedSheet;
  const sheetColor = SHEET_OPTIONS.find(o => o.key === sheetKey)?.color ?? SHEET_BG;
  return {
    themeChoice: preset.key,
    sheetColor,
    accentColor: preset.tokens.accent,
    gradient: preset.tokens.gradient,
    finish: look.finish,
    shape: look.shape,
    pageStyle: look.pageStyle,
    font: look.font,
  };
}

/** Link-only providers can use a Look only when every part of it is one they
 *  already have; otherwise it shows locked, like the parts themselves. */
export function isLookUnlockedForLinkOnly(look: BrandingLook): boolean {
  return LINK_ONLY_THEMES.includes(look.theme)
    && LINK_ONLY_HERO_FINISHES.includes(look.finish)
    && LINK_ONLY_FONTS.includes(look.font)
    && look.pageStyle === DEFAULT_PAGE_STYLE;
}

/** True while every part of the Look still matches what's on screen. */
export function lookMatches(
  look: BrandingLook,
  current: {
    themeChoice: string;
    sheetColor: string;
    finish: HeroFinish;
    shape: CardShape;
    pageStyle: PageStyleKey;
    font: string;
  },
): boolean {
  const resolved = resolveLook(look);
  return current.themeChoice === resolved.themeChoice
    && current.sheetColor.toUpperCase() === resolved.sheetColor.toUpperCase()
    && current.finish === resolved.finish
    && current.shape === resolved.shape
    && current.pageStyle === resolved.pageStyle
    && current.font === resolved.font;
}
