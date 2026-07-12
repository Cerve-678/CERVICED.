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

// Content-area (sheet) choices. Stored as a `|#RRGGBB` suffix on the theme key
// when not the default beige, e.g. 'blush|#F8ECF0'.
export const SHEET_OPTIONS: Array<{ key: string; name: string; color: string }> = [
  { key: 'beige', name: 'Beige', color: SHEET_BG },
  { key: 'blush', name: 'Blush', color: '#F8ECF0' },
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
}

export interface ProviderThemePreset {
  key: string;
  name: string;
  description: string;
  tokens: ProviderThemeTokens;
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

export function isDarkColor(hex: string): boolean {
  const [r, g, b] = hexChannels(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.45;
}

/** Blend hex colour toward a target by t (0..1), returning a solid hex. */
function blend(hex: string, target: string, t: number): string {
  const a = hexChannels(hex);
  const b = hexChannels(target);
  const mix = a.map((c, i) => Math.round(c + ((b[i] ?? 0) - c) * t));
  return `#${mix.map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Derive a full token set from a 3-colour choice (backdrop, card, accent) and
 *  an optional content-area colour (defaults to the beige). Text tones follow
 *  the card's brightness so preset and custom sets always stay readable. */
export function buildThemeTokens(backdrop: string, card: string, accent: string, sheet: string = SHEET_BG): ProviderThemeTokens {
  const dark = isDarkColor(card);
  return {
    bg: sheet,
    hero: backdrop,
    card,
    accent,
    surface: blend(sheet, '#000000', 0.05),
    text: dark ? '#F2EDEA' : '#26201E',
    sub: dark ? '#C0B4AF' : '#655A57',
    border: 'rgba(60,40,40,0.14)',
    sep: 'rgba(60,40,40,0.08)',
    isDark: dark,
  };
}

// ── Presets — accent + card + backdrop sets that complement each other ───────

const PRESET_DEFS: Array<{ key: string; name: string; description: string; backdrop: string; card: string; accent: string }> = [
  { key: 'app',        name: 'App',         description: 'Matches the CERVICED app look',        backdrop: '#C4A8AE', card: '#FFFFFF', accent: '#7A4F55' },
  { key: 'blushbeige', name: 'Blush Beige', description: 'Blush cards with a rose backdrop',     backdrop: '#E3C7CF', card: '#F9E9EE', accent: '#D98BA6' },
  { key: 'blush',      name: 'Blush',       description: 'Soft pink cards and backdrop',         backdrop: '#F2D4DE', card: '#FDF5F7', accent: '#E9799F' },
  { key: 'cream',      name: 'Cream',       description: 'Warm ivory with caramel accents',      backdrop: '#E9D9BE', card: '#FCF8F0', accent: '#C1934F' },
  { key: 'sage',       name: 'Sage',        description: 'Calm botanical green',                 backdrop: '#CBDCC2', card: '#F7FAF3', accent: '#6F9464' },
  { key: 'lavender',   name: 'Lavender',    description: 'Soft lilac with violet accents',       backdrop: '#D9CBEC', card: '#F9F6FD', accent: '#8F6FC0' },
  { key: 'sky',        name: 'Sky',         description: 'Airy blue-grey',                       backdrop: '#C2DAE8', card: '#F6FAFC', accent: '#5D93B4' },
  { key: 'grey',       name: 'Grey',        description: 'Clean neutral grey',                   backdrop: '#D6D6DA', card: '#F7F7F8', accent: '#5F6068' },
  { key: 'darkblue',   name: 'Dark Blue',   description: 'Deep navy with a moody feel',          backdrop: '#1B2740', card: '#26314A', accent: '#6C9BD1' },
];

export const PROVIDER_THEMES: ProviderThemePreset[] = PRESET_DEFS.map(d => ({
  key: d.key,
  name: d.name,
  description: d.description,
  tokens: buildThemeTokens(d.backdrop, d.card, d.accent),
}));

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
  return sheet === SHEET_BG ? d : buildThemeTokens(d.hero, d.card, d.accent, sheet);
}
