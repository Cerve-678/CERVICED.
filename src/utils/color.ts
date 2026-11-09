/**
 * Colour-format conversion for APIs that don't speak CSS.
 *
 * The app's palettes (src/constants/theme.ts) express translucent tokens —
 * `sub`, `border`, `sep`, `iconBg`, `accentDim` — as CSS `rgba(...)` strings,
 * because that's what React Native style props take. Some native SDKs only
 * accept hex, so a palette value handed straight to one of them throws at
 * runtime rather than falling back to a default.
 */

/**
 * Any app palette colour → '#AARRGGBB'.
 *
 * Stripe's Payment Sheet appearance API parses colours as 6-digit `RRGGBB` or
 * 8-digit **`AARRGGBB`** — alpha leads, which is the opposite of the `#RRGGBBAA`
 * CSS ordering — and throws `Expected hex string of length 6 or 8` on anything
 * else, `rgba()` included. See stripe-react-native's `UIColorExtension.swift`
 * (case 8: ARGB) and `PaymentSheetAppearance.kt`'s `colorFromHex`.
 *
 * Accepts '#RGB', '#RRGGBB', '#RRGGBBAA', 'rgb(...)' and 'rgba(...)'.
 * Throws on anything it can't parse — a silently wrong colour in a payment
 * sheet is harder to notice than a loud failure at development time.
 */
export function toArgbHex(color: string): string {
  const value = color.trim();
  const byte = (n: number): string => Math.round(n).toString(16).padStart(2, '0').toUpperCase();
  const argb = (r: number, g: number, b: number, a: number): string =>
    `#${byte(a * 255)}${byte(r)}${byte(g)}${byte(b)}`;

  const rgbMatch = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(value);
  if (rgbMatch) {
    const [, r, g, b, a] = rgbMatch;
    return argb(Number(r), Number(g), Number(b), a === undefined ? 1 : Number(a));
  }

  const hex = value.startsWith('#') ? value.slice(1) : '';
  // '#RGB' shorthand: each nibble doubles ('#F0A' → 'FF00AA').
  if (/^[\da-f]{3}$/i.test(hex)) {
    const nibble = (i: number): number => parseInt(hex.slice(i, i + 1).repeat(2), 16);
    return argb(nibble(0), nibble(1), nibble(2), 1);
  }
  // '#RRGGBB', or '#RRGGBBAA' with CSS's trailing alpha moved to the front.
  if (/^[\da-f]{6}([\da-f]{2})?$/i.test(hex)) {
    const alpha = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return argb(
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
      alpha,
    );
  }

  throw new Error(`toArgbHex: unsupported colour format "${color}"`);
}

// ── Free colour picking (Branding → Custom) ─────────────────────────────────

/** Hue 0–360, saturation and value 0–1. */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

/**
 * What someone typed into a hex box → '#RRGGBB', or null while it isn't a
 * whole colour yet. Takes it with or without the '#', in either case, and the
 * three-digit shorthand.
 */
export function parseHexInput(input: string): string | null {
  const raw = input.trim().replace(/^#/, '');
  if (/^[\da-f]{3}$/i.test(raw)) {
    return `#${raw.split('').map(c => c + c).join('')}`.toUpperCase();
  }
  if (/^[\da-f]{6}$/i.test(raw)) return `#${raw}`.toUpperCase();
  return null;
}

/** '#RRGGBB' → HSV. Anything unreadable reads as black. */
export function hexToHsv(hex: string): Hsv {
  const parsed = parseHexInput(hex) ?? '#000000';
  const r = parseInt(parsed.slice(1, 3), 16) / 255;
  const g = parseInt(parsed.slice(3, 5), 16) / 255;
  const b = parseInt(parsed.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let h = 0;
  if (delta > 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

/** HSV → '#RRGGBB'. Out-of-range parts are clamped. */
export function hsvToHex({ h, s, v }: Hsv): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.min(1, Math.max(0, s));
  const val = Math.min(1, Math.max(0, v));
  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;
  const [r, g, b] =
    hue < 60 ? [c, x, 0] :
    hue < 120 ? [x, c, 0] :
    hue < 180 ? [0, c, x] :
    hue < 240 ? [0, x, c] :
    hue < 300 ? [x, 0, c] : [c, 0, x];
  const byte = (n: number): string =>
    Math.round((n + m) * 255).toString(16).padStart(2, '0').toUpperCase();
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

/**
 * The main colours in an image, most common first, as '#RRGGBB'.
 *
 * `rgba` is raw pixel data, four bytes a pixel. Pixels are grouped into
 * coarse colour bins (16 levels a channel), each bin's real average is the
 * colour it offers, and a bin too close to one already picked is skipped, so
 * a photo that is mostly one colour still offers a few different ones.
 * Mostly-transparent pixels (a logo's empty corners) are ignored.
 */
export function paletteFromPixels(rgba: Uint8Array, count = 6): string[] {
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3]! < 128) continue;
    const r = rgba[i]!;
    const g = rgba[i + 1]!;
    const b = rgba[i + 2]!;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bin = bins.get(key);
    if (bin) {
      bin.n += 1;
      bin.r += r;
      bin.g += g;
      bin.b += b;
    } else {
      bins.set(key, { n: 1, r, g, b });
    }
  }

  const byCount = [...bins.values()].sort((a, b) => b.n - a.n);
  const picked: [number, number, number][] = [];
  // Squared RGB distance below which two colours read as the same one.
  const SAME_COLOUR = 48 * 48;
  for (const bin of byCount) {
    const colour: [number, number, number] = [bin.r / bin.n, bin.g / bin.n, bin.b / bin.n];
    const tooClose = picked.some(p =>
      (p[0] - colour[0]) ** 2 + (p[1] - colour[1]) ** 2 + (p[2] - colour[2]) ** 2 < SAME_COLOUR,
    );
    if (tooClose) continue;
    picked.push(colour);
    if (picked.length === count) break;
  }

  const byte = (n: number): string => Math.round(n).toString(16).padStart(2, '0').toUpperCase();
  return picked.map(([r, g, b]) => `#${byte(r)}${byte(g)}${byte(b)}`);
}
