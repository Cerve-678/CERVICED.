import { toArgbHex } from '../../utils/color';

interface SheetPalette {
  accent: string;
  onAccent: string;
  bg: string;
  surface: string;
  border: string;
  sub: string;
}

/**
 * Stripe Payment Sheet appearance in the app's own palette, shared by checkout
 * and Payment Methods' "Add a card" so both sheets look the same.
 *
 * Flat colours rather than Stripe's light/dark pair on purpose: the palette
 * already resolves to the app's own dark mode, which is not necessarily the OS
 * setting Stripe would otherwise auto-detect. Every value goes through
 * toArgbHex: the palette's translucent tokens (sub, border) are CSS rgba()
 * strings, which Stripe rejects outright rather than falling back on.
 */
export function buildPaymentSheetAppearance(P: SheetPalette, textColor: string) {
  return {
    colors: {
      primary: toArgbHex(P.accent),
      background: toArgbHex(P.bg),
      componentBackground: toArgbHex(P.surface),
      componentBorder: toArgbHex(P.border),
      componentDivider: toArgbHex(P.border),
      primaryText: toArgbHex(textColor),
      secondaryText: toArgbHex(P.sub),
      componentText: toArgbHex(textColor),
      placeholderText: toArgbHex(P.sub),
      icon: toArgbHex(P.sub),
      error: '#FFFF3B30',
    },
    shapes: { borderRadius: 20, borderWidth: 1 },
    primaryButton: {
      colors: {
        background: toArgbHex(P.accent),
        text: toArgbHex(P.onAccent),
        border: toArgbHex(P.accent),
      },
      shapes: { borderRadius: 20 },
    },
  };
}
