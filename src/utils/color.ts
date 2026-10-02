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
