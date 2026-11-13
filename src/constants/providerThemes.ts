// ── Provider profile themes ──────────────────────────────────────────────────
// Each theme is a curated 3-colour set: accent + card colour + backdrop colour.
// The backdrop colour drives the hero gradient behind the profile top; the
// content sheet itself is ALWAYS the permanent beige (SHEET_BG) — it never
// changes with the theme. Cards and accents adapt per theme.
//
// The provider picks a set (or builds a custom one) in Branding & Style; the
// key is stored in providers.profile_theme.
//
// Custom sets are stored in the same column, colon-encoded:
//   custom:#RRGGBB:#RRGGBB:#RRGGBB   (backdrop : card : accent)
//
// The whole stored value is  base[|#sheet[|finish[|shape[|pageStyle[|policyLook]]]]]  — the content-area colour
// and the hero finish ride along as suffixes (see encodeThemeKey), so neither
// needs a column of its own. Builds that predate the finish read only the
// first two parts and show the plain blend.


import {
  DEFAULT_PAGE_STYLE,
  DEFAULT_POLICY_PICTURE_LOOK,
  isPageStyleKey,
  isPolicyPictureLook,
  type PageStyleKey,
  type PolicyPictureLook,
} from './pageStyles';
// Default beige content backdrop — matches the app background.
export const SHEET_BG = '#F5F1EC';

// Shared neutral card tone. Content cards (About / Services / Reviews) use this
// pale near-white on EVERY theme — only the hero gradient and accent carry the
// colour, so the content area never looks tinted or "off" against a bold hero.
export const NEUTRAL_CARD = '#FCFBFA';

// Content-area (sheet) choices. Stored as a `|#RRGGBB` suffix on the theme key
// when not the default beige. Kept pale/neutral regardless of hue so the
// content sheet's dark text always stays readable — pick whichever tone
// best complements the chosen theme's palette (see SUGGESTED_SHEET_BY_THEME).
export const SHEET_OPTIONS: { key: string; name: string; color: string }[] = [
  { key: 'beige',    name: 'Beige',     color: SHEET_BG },
  { key: 'blush',    name: 'Blush',     color: '#F8ECF0' },
  { key: 'ivory',    name: 'Ivory',     color: '#FBF6EC' },
  { key: 'mist',     name: 'Mist',      color: '#EEF1F4' },
  { key: 'sagemist', name: 'Sage Mist', color: '#EEF3EC' },
  { key: 'oat',      name: 'Oat',       color: '#F3ECE2' },
  { key: 'shell',    name: 'Shell',     color: '#F9EEEA' },
  { key: 'butter',   name: 'Butter',    color: '#FBF6E7' },
  { key: 'milk',      name: 'Milk',      color: '#FFFFFF' },
  { key: 'champagne', name: 'Champagne', color: '#F7EFE0' },
  // A true neutral grey (Mist leans blue) for the black and ink sets.
  { key: 'dove',      name: 'Dove',      color: '#EBEBEA' },
  // A deeper grey beside Dove, the darkest content area: the cards' grey
  // text still reads at about 4.3:1 on it.
  { key: 'smoke',     name: 'Smoke',     color: '#CFCFCE' },
];

// ── Hero finish ───────────────────────────────────────────────────────────────
// How the two hero colours are drawn behind the top of the profile. Only
// matters without a background photo. Picked in Branding & Style (owner's
// call, 2026-11-03). Drawn by components/ProfileHeroBackdrop.

export type HeroFinish = 'blend' | 'solid' | 'glow' | 'split' | 'sheen';

export const DEFAULT_HERO_FINISH: HeroFinish = 'blend';

export const HERO_FINISHES: { key: HeroFinish; name: string; description: string }[] = [
  { key: 'blend', name: 'Blend', description: 'One colour melting into the other' },
  { key: 'solid', name: 'Solid', description: 'Just the first colour' },
  { key: 'glow',  name: 'Glow',  description: 'The second colour glowing from the top corner' },
  { key: 'split', name: 'Split', description: 'Both colours, side by side on a diagonal' },
  { key: 'sheen', name: 'Sheen', description: 'A soft band of light across both colours, like metal' },
];

function isHeroFinish(value: string | undefined): value is HeroFinish {
  return HERO_FINISHES.some(f => f.key === value);
}

// ── Card shape ────────────────────────────────────────────────────────────────
// The corners of the service cards and category pills on the public profile,
// where the service info sits: the rounded look the profile has always had,
// or square. Picked in Branding & Style (owner's call, 2026-11-09).

export type CardShape = 'rounded' | 'square';

export const DEFAULT_CARD_SHAPE: CardShape = 'rounded';

export const CARD_SHAPES: { key: CardShape; name: string; description: string }[] = [
  { key: 'rounded', name: 'Rounded', description: 'Soft, rounded corners' },
  { key: 'square',  name: 'Square',  description: 'Straight, square corners' },
];

function isCardShape(value: string | undefined): value is CardShape {
  return CARD_SHAPES.some(s => s.key === value);
}

// ── Collections ───────────────────────────────────────────────────────────────
// The picker shows the sets in these groups, in this order. The five named
// collections came from the owner's picks on 2026-11-03
// (https://claude.ai/artifact/FDEnSYwWeAyUhw7v9dvcT2); Clean Girl and Gilded
// came from a second round the same day
// (https://claude.ai/artifact/KJsBTxUenQgKsYeS9pa9Fw). Classics holds the
// sets that were here before them.

export type ThemeCollectionKey = 'atelier' | 'sorbet' | 'terra' | 'afterdark' | 'statement' | 'clean' | 'gilded' | 'classics';

export const THEME_COLLECTIONS: { key: ThemeCollectionKey; name: string; description: string }[] = [
  { key: 'atelier',   name: 'Atelier',    description: 'Quiet, tailored neutrals' },
  { key: 'sorbet',    name: 'Sorbet',     description: 'Soft pastels with a contrasting accent' },
  { key: 'terra',     name: 'Terra',      description: 'Warm, sun-baked earth tones' },
  { key: 'afterdark', name: 'After Dark', description: 'Deep jewel tones with a light accent' },
  { key: 'statement', name: 'Statement',  description: 'Bold colour clashes' },
  { key: 'clean',     name: 'Clean Girl', description: 'Milky whites and soft neutrals' },
  { key: 'gilded',    name: 'Gilded',     description: 'Golds, from white and gold to black and gold' },
  { key: 'classics',  name: 'Classics',   description: 'The original CERVICED sets' },
];

/**
 * What a link-only provider (booking_mode 'external') can pick in Branding:
 * four colour sets (App, Blush, Grey, Charcoal) and the Blend finish. Every
 * other set, Make your own and the other finishes show locked, as part of the
 * full CERVICED experience (owner's call, 2026-11-03). The content area isn't
 * limited. Only the picker enforces this, so a set saved before the limit
 * keeps showing on the profile.
 */
export const LINK_ONLY_THEMES: readonly string[] = ['app', 'blush', 'grey', 'charcoal'];
export const LINK_ONLY_HERO_FINISHES: readonly HeroFinish[] = ['blend'];

export interface ProviderThemeTokens {
  bg: string;      // content sheet — always SHEET_BG
  hero: string;    // backdrop colour behind the profile top (gradient start)
  surface: string;
  card: string;
  accent: string;  // fallback accent — providers.accent_color still wins when set
  text: string;
  sub: string;
  border: string;
  sep: string;
  isDark: boolean; // derived from the card tone (drives blur tint etc.)
  /** Two-tone backdrop gradient. Presets that define one use it as-is (a real
   *  colour-to-colour blend, not a fade to the content sheet); presets that
   *  don't fall back to [hero, bg] like before. */
  gradient: [string, string];
}

export interface ProviderThemePreset {
  key: string;
  name: string;
  description: string;
  tokens: ProviderThemeTokens;
  /** Content-backdrop colour (a SHEET_OPTIONS key) that best complements this
   *  palette — used to default the sheet picker when a provider selects this
   *  theme, without overriding a sheet colour they already chose manually. */
  suggestedSheet: string;
  collection: ThemeCollectionKey;
}

// ── Colour helpers ────────────────────────────────────────────────────────────

function hexChannels(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/** '#RRGGBB' + opacity → 'rgba(...)': used to tint frosted cards per theme. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexChannels(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** WCAG relative luminance (0-1) of a single sRGB channel value (0-255). */
function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance (0-1) of a '#RRGGBB' colour. */
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexChannels(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** WCAG contrast ratio (1-21) between two '#RRGGBB' colours. */
function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Whether foreground content (text/icons) drawn on this background should be
 *  light-coloured rather than dark. A single luminance threshold isn't a real
 *  contrast check — a background can sit just on the "light" side of a cutoff
 *  and still contrast better with white than with navy (or vice versa). This
 *  picks whichever of white (#fff) or the app's navy (#1B2740) actually wins
 *  more contrast against the given background, so every text-on-accent call
 *  site gets a real WCAG comparison instead of a coarse guess. */
export function isDarkColor(hex: string): boolean {
  const whiteContrast = contrastRatio(hex, '#FFFFFF');
  const navyContrast = contrastRatio(hex, '#1B2740');
  return whiteContrast >= navyContrast;
}

/** Blend hex colour toward a target by t (0..1), returning a solid hex. */
export function blend(hex: string, target: string, t: number): string {
  const a = hexChannels(hex);
  const b = hexChannels(target);
  const mix = a.map((c, i) => Math.round(c + ((b[i] ?? 0) - c) * t));
  return `#${mix.map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Derive a full token set from a 3-colour choice (backdrop, card, accent) and
 *  an optional content-area colour (defaults to the beige). Text tones follow
 *  the card's brightness so preset and custom sets always stay readable.
 *  `gradient` overrides the default hero→sheet fade with a real two-tone blend. */
export function buildThemeTokens(
  backdrop: string,
  card: string,
  accent: string,
  sheet: string = SHEET_BG,
  gradient?: [string, string]
): ProviderThemeTokens {
  const dark = isDarkColor(card);
  return {
    bg: sheet,
    hero: backdrop,
    card,
    accent,
    surface: blend(sheet, '#000000', 0.05),
    text: dark ? '#F2EDEA' : '#26201E',
    sub: dark ? '#C0B4AF' : '#655A57',
    border: dark ? 'rgba(255,255,255,0.22)' : 'rgba(60,40,40,0.14)',
    sep: dark ? 'rgba(255,255,255,0.14)' : 'rgba(60,40,40,0.08)',
    isDark: dark,
    gradient: gradient ?? [backdrop, sheet],
  };
}

/** Derive a full set from ONE main colour: the backdrop IS the colour, the
 *  accent is a deeper shade of the same hue, and the content cards stay a
 *  shared pale neutral (NEUTRAL_CARD) rather than a tint of the hue — so the
 *  colour lives in the hero, and About/Services/Reviews cards read the same
 *  clean off-white on every theme. */
export function buildMonochromeTheme(mainColor: string, sheet: string = SHEET_BG, gradient?: [string, string]): ProviderThemeTokens {
  const accent = blend(mainColor, '#000000', 0.22);
  return buildThemeTokens(mainColor, NEUTRAL_CARD, accent, sheet, gradient);
}

// ── Presets — accent + card + backdrop sets that complement each other ───────
// (The old 'blushbeige' pink-on-pink preset was removed — 'blush' below
// still covers pink for anyone who wants it.)

const PRESET_DEFS: { key: string; name: string; description: string; backdrop: string; card: string; accent: string; gradient?: [string, string]; suggestedSheet: string }[] = [
  { key: 'app',        name: 'App',         description: 'Matches the CERVICED app look',        backdrop: '#4A2C20', card: '#FFFFFF', accent: '#4A2C1E', suggestedSheet: 'beige' },
  { key: 'blush',      name: 'Blush',       description: 'Soft pink cards and backdrop',         backdrop: '#F2D4DE', card: '#FDF5F7', accent: '#E9799F', suggestedSheet: 'blush' },
  { key: 'grey',       name: 'Grey',        description: 'Clean neutral grey',                   backdrop: '#D6D6DA', card: '#F7F7F8', accent: '#5F6068', suggestedSheet: 'mist' },
  // Charcoal keeps its dark hero but uses the shared neutral card like every
  // other theme, so About/Services/Reviews read the same clean off-white.
  { key: 'charcoal',   name: 'Charcoal',    description: 'Near-black hero over clean neutral cards', backdrop: '#26262B', card: NEUTRAL_CARD, accent: '#4A4A52', suggestedSheet: 'mist' },
  // Black is the only preset meant to read as genuinely black: without its own
  // gradient it would fall back to [backdrop, sheet] and fade straight out to
  // the pale content colour, leaving a mostly-grey hero. The near-black second
  // stop keeps depth without lifting it off black.
  { key: 'black',      name: 'Black',        description: 'True black hero over clean neutral cards', backdrop: '#000000', card: NEUTRAL_CARD, accent: '#000000', gradient: ['#000000', '#0B0B0D'], suggestedSheet: 'mist' },
  { key: 'pinkolive',  name: 'Pink & Olive', description: 'Soft pink backdrop with an olive accent', backdrop: '#F9D1D9', card: '#FDF6F7', accent: '#838F58', suggestedSheet: 'blush' },
  // Burgundy carries its own wine-into-wine blend for the same reason Black
  // does: the default [backdrop, sheet] fade would wash a deep hero out to
  // the pale content colour. Blue accent is dark enough to hold white label
  // text on the pale cards (WCAG ~6.8:1) while reading as a true blue, not navy.
  { key: 'burgundyblue', name: 'Burgundy & Blue', description: 'Deep burgundy hero with a true blue accent', backdrop: '#6B2737', card: NEUTRAL_CARD, accent: '#2C5AA0', gradient: ['#5A1F2C', '#7E3644'], suggestedSheet: 'mist' },
];

// Monochrome sets — ONE main colour drives the backdrop and accent; the
// content cards stay the shared pale neutral (NEUTRAL_CARD) like every other
// theme, so only the hero carries the hue. e.g. Emerald gives a rich green
// hero with a deep green accent over clean neutral cards.
const MONOCHROME_DEFS: { key: string; name: string; description: string; main: string; suggestedSheet: string }[] = [
  { key: 'ocean',   name: 'Ocean Blue', description: 'True blue hero over clean neutral cards',      main: '#2E6F9E', suggestedSheet: 'beige' },
  { key: 'berry',   name: 'Berry',      description: 'Deep wine hero over clean neutral cards',      main: '#8E3B6B', suggestedSheet: 'beige' },
];

// Gradient sets — muted, "in-between" tones that sit just off the obvious
// colour name (off-plum, smoked mauve, dusty clay) rather than hitting a hue
// straight on. Each gradient blends two adjacent desaturated shades so the
// backdrop reads as one refined, hard-to-name colour story. The card stays
// the shared neutral; only the hero and accent carry the tone.
const GRADIENT_DEFS: { key: string; name: string; description: string; from: string; to: string; accent?: string; suggestedSheet: string }[] = [
  { key: 'clay',      name: 'Clay',       description: 'Muted terracotta into warm greyed sand',    from: '#9E6B57', to: '#CBAF98', suggestedSheet: 'beige' },
  { key: 'thyme',     name: 'Thyme',      description: 'Greyed sage into soft olive',               from: '#6C7A63', to: '#A8AE8E', suggestedSheet: 'beige' },
  { key: 'harbour',   name: 'Harbour',    description: 'Dusty slate-blue into muted teal-grey',     from: '#4F6672', to: '#8FA6A8', suggestedSheet: 'beige' },
  { key: 'garnet',    name: 'Garnet',     description: 'Deep muted red into soft brick-rose',       from: '#8E3A34', to: '#C07E6E', suggestedSheet: 'beige' },
  { key: 'fig',       name: 'Fig',        description: 'Dusty aubergine into greyed mauve',         from: '#5B4457', to: '#9B8090', suggestedSheet: 'beige' },
  { key: 'fern',      name: 'Fern',       description: 'Deep forest green into muted moss',         from: '#3E5541', to: '#8AA07E', suggestedSheet: 'beige' },
  { key: 'greypink',  name: 'Grey & Pink', description: 'Cool grey fading into soft pink',          from: '#B9B9C0', to: '#F3D3DE', accent: '#9C6B7A', suggestedSheet: 'blush' },
];

// The collections — two-tone heroes, each with an accent chosen to complement
// it rather than a deeper shade of the same hue, and a content area to match.
// Every accent holds at least 3:1 against the pale cards, where it's used for
// small text as well as buttons. Sapphire & Blush, Plum & Champagne and
// Cobalt & Blush were darkened to about 5:1 at the owner's request
// (2026-11-03); their first, lighter accents sat near 2:1.
const COLLECTION_DEFS: { key: string; name: string; description: string; from: string; to: string; accent: string; suggestedSheet: string; collection: ThemeCollectionKey }[] = [
  { key: 'oatmilk',       name: 'Oat Milk',          description: 'Toasted oat into steamed milk, with a latte-brown accent', from: '#D8C6AF', to: '#EFE3D3', accent: '#7A5A43', suggestedSheet: 'ivory',    collection: 'atelier' },
  { key: 'cashmere',      name: 'Cashmere',          description: 'Warm greige into soft camel, with a cinnamon accent',      from: '#C9B2A3', to: '#E9DCD1', accent: '#8C5647', suggestedSheet: 'shell',    collection: 'atelier' },
  { key: 'linenink',      name: 'Linen & Ink',       description: 'Pale linen with a near-black ink accent',                  from: '#E4DED3', to: '#F3EFE8', accent: '#23262E', suggestedSheet: 'beige',    collection: 'atelier' },
  { key: 'mushroom',      name: 'Mushroom',          description: 'Earthy taupe into stone, with a deep bark accent',         from: '#9C8F84', to: '#CFC5BA', accent: '#4A403A', suggestedSheet: 'oat',      collection: 'atelier' },
  { key: 'rosesage',      name: 'Rose & Sage',       description: 'Dusty rose with a soft sage accent',                       from: '#E6B3B9', to: '#F2D9D9', accent: '#66805F', suggestedSheet: 'blush',    collection: 'sorbet' },
  { key: 'powderapricot', name: 'Powder & Apricot',  description: 'Powder blue into apricot, with a burnt-orange accent',      from: '#B9CFE3', to: '#F4D6BF', accent: '#B9643F', suggestedSheet: 'mist',     collection: 'sorbet' },
  { key: 'desertrose',    name: 'Desert Rose',       description: 'Sandstone pink with a dark rosewood accent',               from: '#B4807A', to: '#DFBDB1', accent: '#6A3D3A', suggestedSheet: 'shell',    collection: 'terra' },
  { key: 'emeraldgold',   name: 'Emerald & Gold',    description: 'Bottle green with an antique-gold accent',                 from: '#1D4A3C', to: '#2E6A54', accent: '#A98235', suggestedSheet: 'ivory',    collection: 'afterdark' },
  { key: 'sapphireblush', name: 'Sapphire & Blush',  description: 'Midnight sapphire with a deep rose accent',                from: '#1D2C52', to: '#3A4B78', accent: '#B04A68', suggestedSheet: 'blush',    collection: 'afterdark' },
  { key: 'plumchampagne', name: 'Plum & Champagne',  description: 'Velvet plum with an antique-bronze accent',                from: '#3C1F3E', to: '#683C64', accent: '#8A6438', suggestedSheet: 'ivory',    collection: 'afterdark' },
  { key: 'tealcoral',     name: 'Deep Teal & Coral', description: 'Inky teal with a warm coral accent',                       from: '#113A41', to: '#1E5B62', accent: '#D9714F', suggestedSheet: 'mist',     collection: 'afterdark' },
  { key: 'cobaltblush',   name: 'Cobalt & Blush',    description: 'Electric cobalt with a raspberry-pink accent',             from: '#2747A0', to: '#4A68BE', accent: '#B8436A', suggestedSheet: 'blush',    collection: 'statement' },
  { key: 'cherrycocoa',   name: 'Cherry & Cocoa',    description: 'Glossy cherry with a dark cocoa accent',                   from: '#A92536', to: '#D95A66', accent: '#3A211C', suggestedSheet: 'shell',    collection: 'statement' },
  { key: 'matchaink',     name: 'Matcha & Ink',      description: 'Whisked matcha with a deep ink-green accent',              from: '#7F9A6E', to: '#C3D0AE', accent: '#2C3527', suggestedSheet: 'sagemist', collection: 'statement' },
  { key: 'tangerinenavy', name: 'Tangerine & Navy',  description: 'Juicy tangerine with a crisp navy accent',                 from: '#D9703A', to: '#EFA772', accent: '#1E2A4A', suggestedSheet: 'butter',   collection: 'statement' },
  { key: 'milkglaze',     name: 'Milk Glaze',        description: 'Barely-there oat into pure white, with a soft taupe accent', from: '#F3EFEA', to: '#FFFFFF', accent: '#8A7766', suggestedSheet: 'milk',      collection: 'clean' },
  { key: 'glazedrose',    name: 'Glazed Rose',       description: 'A sheer pink glaze over white, with a dusty-rose accent',    from: '#F1E4DE', to: '#FFFFFF', accent: '#9E6A66', suggestedSheet: 'shell',     collection: 'clean' },
  { key: 'coconutink',    name: 'Coconut & Ink',     description: 'All white with a near-black accent',                         from: '#FFFFFF', to: '#F1EEEA', accent: '#22201E', suggestedSheet: 'milk',      collection: 'clean' },
  { key: 'almondsilk',    name: 'Almond Silk',       description: 'Almond into silk, with a toasted-almond accent',             from: '#E6D8C6', to: '#F5EEE4', accent: '#7A664C', suggestedSheet: 'beige',     collection: 'clean' },
  { key: 'cloud',         name: 'Cloud',             description: 'Soft cloud grey into white, with a slate accent',            from: '#E8E9EB', to: '#FFFFFF', accent: '#3E4859', suggestedSheet: 'milk',      collection: 'clean' },
  { key: 'whitegold',     name: 'White & Gold',      description: 'Clean white warming into gold, with a polished-gold accent', from: '#FFFFFF', to: '#F2E7D2', accent: '#9C7633', suggestedSheet: 'milk',      collection: 'gilded' },
  { key: 'blackgold',     name: 'Black & Gold',      description: 'Near-black with an antique-gold accent',                     from: '#0D0C0A', to: '#2A2418', accent: '#98742D', suggestedSheet: 'dove',      collection: 'gilded' },
  { key: 'antiquebronze', name: 'Antique Bronze',    description: 'Dark bronze into burnished gold, with a bronze accent',      from: '#5E4424', to: '#8E6C3E', accent: '#7A5A2B', suggestedSheet: 'champagne', collection: 'gilded' },
];

export const PROVIDER_THEMES: ProviderThemePreset[] = [
  ...COLLECTION_DEFS.map(d => ({
    key: d.key,
    name: d.name,
    description: d.description,
    tokens: buildThemeTokens(d.from, NEUTRAL_CARD, d.accent, SHEET_BG, [d.from, d.to]),
    suggestedSheet: d.suggestedSheet,
    collection: d.collection,
  })),
  ...PRESET_DEFS.map(d => ({
    key: d.key,
    name: d.name,
    description: d.description,
    tokens: buildThemeTokens(d.backdrop, d.card, d.accent, SHEET_BG, d.gradient),
    suggestedSheet: d.suggestedSheet,
    collection: 'classics' as const,
  })),
  ...MONOCHROME_DEFS.map(d => ({
    key: d.key,
    name: d.name,
    description: d.description,
    tokens: buildMonochromeTheme(d.main),
    suggestedSheet: d.suggestedSheet,
    collection: 'classics' as const,
  })),
  ...GRADIENT_DEFS.map(d => ({
    key: d.key,
    name: d.name,
    description: d.description,
    // Card stays the shared neutral (NEUTRAL_CARD) regardless of the theme —
    // only the backdrop gradient and accent carry the colour. Accent is the
    // richer "from" end, deepened slightly for contrast on the pale card.
    tokens: buildThemeTokens(d.from, NEUTRAL_CARD, d.accent ?? blend(d.from, '#000000', 0.12), SHEET_BG, [d.from, d.to]),
    suggestedSheet: d.suggestedSheet,
    collection: 'classics' as const,
  })),
];

export const DEFAULT_PROVIDER_THEME = 'app';

// ── Custom set encoding ───────────────────────────────────────────────────────

export const CUSTOM_THEME_PREFIX = 'custom:';

export function encodeCustomTheme(backdrop: string, card: string, accent: string): string {
  return `${CUSTOM_THEME_PREFIX}${backdrop}:${card}:${accent}`;
}

export function decodeCustomTheme(key: string | null | undefined): { backdrop: string; card: string; accent: string } | null {
  if (!key || !key.startsWith(CUSTOM_THEME_PREFIX)) return null;
  const [backdrop, card, accent] = key.slice(CUSTOM_THEME_PREFIX.length).split(':');
  const valid = (c?: string) => /^#[0-9a-fA-F]{6}$/.test(c ?? '');
  if (!valid(backdrop) || !valid(card) || !valid(accent)) return null;
  return { backdrop: backdrop!, card: card!, accent: accent! };
}

// ── Full key encoding (base theme + optional content-area suffix) ────────────

/** Compose the stored profile_theme value from a base key, a sheet colour, a
 *  hero finish, a card shape and a page style (constants/pageStyles). Every part before a non-default one is
 *  written out, so the parts never shift position. */
export function encodeThemeKey(
  base: string,
  sheet?: string,
  finish: HeroFinish = DEFAULT_HERO_FINISH,
  shape: CardShape = DEFAULT_CARD_SHAPE,
  pageStyle: PageStyleKey = DEFAULT_PAGE_STYLE,
  policyLook: PolicyPictureLook = DEFAULT_POLICY_PICTURE_LOOK,
): string {
  if (policyLook !== DEFAULT_POLICY_PICTURE_LOOK) {
    return `${base}|${sheet || SHEET_BG}|${finish}|${shape}|${pageStyle}|${policyLook}`;
  }
  if (pageStyle !== DEFAULT_PAGE_STYLE) return `${base}|${sheet || SHEET_BG}|${finish}|${shape}|${pageStyle}`;
  if (shape !== DEFAULT_CARD_SHAPE) return `${base}|${sheet || SHEET_BG}|${finish}|${shape}`;
  if (finish !== DEFAULT_HERO_FINISH) return `${base}|${sheet || SHEET_BG}|${finish}`;
  return sheet && sheet !== SHEET_BG ? `${base}|${sheet}` : base;
}

/** Split a stored profile_theme value into base key, sheet colour, hero finish
 *  and card shape. Anything unreadable falls back to the default for that part. */
export function parseThemeKey(key: string | null | undefined): {
  base: string | null;
  sheet: string;
  finish: HeroFinish;
  shape: CardShape;
  pageStyle: PageStyleKey;
  policyLook: PolicyPictureLook;
} {
  if (!key) {
    return {
      base: null, sheet: SHEET_BG, finish: DEFAULT_HERO_FINISH, shape: DEFAULT_CARD_SHAPE,
      pageStyle: DEFAULT_PAGE_STYLE, policyLook: DEFAULT_POLICY_PICTURE_LOOK,
    };
  }
  const [base, sheet, finish, shape, pageStyle, policyLook] = key.split('|');
  const validSheet = /^#[0-9a-fA-F]{6}$/.test(sheet ?? '') ? sheet! : SHEET_BG;
  return {
    base: base ?? null,
    sheet: validSheet,
    finish: isHeroFinish(finish) ? finish : DEFAULT_HERO_FINISH,
    shape: isCardShape(shape) ? shape : DEFAULT_CARD_SHAPE,
    pageStyle: isPageStyleKey(pageStyle) ? pageStyle : DEFAULT_PAGE_STYLE,
    policyLook: isPolicyPictureLook(policyLook) ? policyLook : DEFAULT_POLICY_PICTURE_LOOK,
  };
}

/** Resolve a stored theme key (preset or custom-encoded, with optional sheet
 *  suffix) to concrete tokens. Unknown/missing keys fall back to 'app'. */
export function resolveProviderTheme(key: string | null | undefined): ProviderThemeTokens {
  const { base, sheet } = parseThemeKey(key);
  const custom = decodeCustomTheme(base);
  if (custom) return buildThemeTokens(custom.backdrop, custom.card, custom.accent, sheet);
  // By name, not position: the collections are listed ahead of the default.
  const preset = PROVIDER_THEMES.find(t => t.key === base)
    ?? PROVIDER_THEMES.find(t => t.key === DEFAULT_PROVIDER_THEME)!;
  const d = preset.tokens;
  return sheet === SHEET_BG ? d : buildThemeTokens(d.hero, d.card, d.accent, sheet, d.gradient);
}

/** The hero gradient and accent a theme key puts on the profile — the same
 *  pair a Branding save writes for it. Sign-up, the booking-link import and
 *  the profile loader start from this, so a provider who never opens Branding
 *  shows clients exactly the colours Branding shows them, rather than a
 *  placeholder gradient that nobody chose. */
export function themeBrandingColours(key: string | null | undefined): {
  gradient: [string, string];
  accentColor: string;
} {
  const tokens = resolveProviderTheme(key);
  return { gradient: [...tokens.gradient], accentColor: tokens.accent };
}
