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
  { key: 'butter',   name: 'Butter',    color: '#F5E8B8' },
];

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

const PRESET_DEFS: { key: string; name: string; description: string; backdrop: string; card: string; accent: string; suggestedSheet: string }[] = [
  { key: 'app',        name: 'App',         description: 'Matches the CERVICED app look',        backdrop: '#3B2A22', card: '#FFFFFF', accent: '#4A2C1E', suggestedSheet: 'beige' },
  { key: 'blush',      name: 'Blush',       description: 'Soft pink cards and backdrop',         backdrop: '#F2D4DE', card: '#FDF5F7', accent: '#E9799F', suggestedSheet: 'blush' },
  { key: 'grey',       name: 'Grey',        description: 'Clean neutral grey',                   backdrop: '#D6D6DA', card: '#F7F7F8', accent: '#5F6068', suggestedSheet: 'mist' },
  // Charcoal keeps its dark hero but uses the shared neutral card like every
  // other theme, so About/Services/Reviews read the same clean off-white.
  { key: 'charcoal',   name: 'Charcoal',    description: 'Near-black hero over clean neutral cards', backdrop: '#26262B', card: NEUTRAL_CARD, accent: '#4A4A52', suggestedSheet: 'mist' },
  { key: 'black',      name: 'Black',       description: 'Pure black hero over clean neutral cards', backdrop: '#000000', card: NEUTRAL_CARD, accent: '#000000', suggestedSheet: 'mist' },
  { key: 'butter',     name: 'Butter Yellow', description: 'Rich brown backdrop, butter-yellow content area, brown accent', backdrop: '#6B4A2F', card: NEUTRAL_CARD, accent: '#6B4A2F', suggestedSheet: 'butter' },
  { key: 'pinkolive',  name: 'Pink & Olive', description: 'Soft pink backdrop with an olive accent', backdrop: '#F9D1D9', card: '#FDF6F7', accent: '#838F58', suggestedSheet: 'blush' },
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
  // Accent is hand-picked rather than derived from `from` — a darkened grey
  // would read as just another grey, so this uses a dusty rose-mauve that
  // bridges both ends of the gradient instead.
  { key: 'greypink',  name: 'Grey & Pink', description: 'Cool grey fading into soft pink',          from: '#B9B9C0', to: '#F3D3DE', accent: '#9C6B7A', suggestedSheet: 'blush' },
];

export const PROVIDER_THEMES: ProviderThemePreset[] = [
  ...PRESET_DEFS.map(d => ({
    key: d.key,
    name: d.name,
    description: d.description,
    tokens: buildThemeTokens(d.backdrop, d.card, d.accent),
    suggestedSheet: d.suggestedSheet,
  })),
  ...MONOCHROME_DEFS.map(d => ({
    key: d.key,
    name: d.name,
    description: d.description,
    tokens: buildMonochromeTheme(d.main),
    suggestedSheet: d.suggestedSheet,
  })),
  ...GRADIENT_DEFS.map(d => ({
    key: d.key,
    name: d.name,
    description: d.description,
    // Card stays the shared neutral (NEUTRAL_CARD) regardless of the theme —
    // only the backdrop gradient and accent carry the colour. Accent defaults
    // to the richer "from" end, deepened slightly for contrast on the pale
    // card, unless a def hand-picks its own (see 'greypink').
    tokens: buildThemeTokens(d.from, NEUTRAL_CARD, d.accent ?? blend(d.from, '#000000', 0.12), SHEET_BG, [d.from, d.to]),
    suggestedSheet: d.suggestedSheet,
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

/** Compose the stored profile_theme value from a base key and a sheet colour. */
export function encodeThemeKey(base: string, sheet?: string): string {
  return sheet && sheet !== SHEET_BG ? `${base}|${sheet}` : base;
}

/** Split a stored profile_theme value into base key + sheet colour. */
export function parseThemeKey(key: string | null | undefined): { base: string | null; sheet: string } {
  if (!key) return { base: null, sheet: SHEET_BG };
  const [base, sheet] = key.split('|');
  const validSheet = /^#[0-9a-fA-F]{6}$/.test(sheet ?? '') ? sheet! : SHEET_BG;
  return { base: base ?? null, sheet: validSheet };
}

/** Resolve a stored theme key (preset or custom-encoded, with optional sheet
 *  suffix) to concrete tokens. Unknown/missing keys fall back to 'app'. */
export function resolveProviderTheme(key: string | null | undefined): ProviderThemeTokens {
  const { base, sheet } = parseThemeKey(key);
  const custom = decodeCustomTheme(base);
  if (custom) return buildThemeTokens(custom.backdrop, custom.card, custom.accent, sheet);
  const preset = PROVIDER_THEMES.find(t => t.key === base) ?? PROVIDER_THEMES[0]!;
  const d = preset.tokens;
  return sheet === SHEET_BG ? d : buildThemeTokens(d.hero, d.card, d.accent, sheet, d.gradient);
}
