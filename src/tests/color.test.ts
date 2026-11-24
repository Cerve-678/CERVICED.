import { toArgbHex } from '../utils/color';
import { lightTheme, darkTheme, clientLightTheme, clientDarkTheme } from '../constants/theme';

describe('toArgbHex', () => {
  it('converts the rgba() palette tokens Stripe rejects', () => {
    // The exact value that threw "Expected hex string of length 6 or 8".
    expect(toArgbHex('rgba(63,30,54,0.62)')).toBe('#9E3F1E36');
  });

  it('puts alpha first, not last — Stripe parses AARRGGBB, CSS writes RRGGBBAA', () => {
    expect(toArgbHex('#3F1E3699')).toBe('#993F1E36');
  });

  it('treats a colour with no alpha as fully opaque', () => {
    expect(toArgbHex('#3F1E36')).toBe('#FF3F1E36');
    expect(toArgbHex('rgb(63, 30, 54)')).toBe('#FF3F1E36');
  });

  it('expands #RGB shorthand', () => {
    expect(toArgbHex('#F0A')).toBe('#FFFF00AA');
  });

  it('tolerates surrounding whitespace', () => {
    expect(toArgbHex('  #FBF7F8  ')).toBe('#FFFBF7F8');
  });

  it('throws rather than silently mis-colouring a payment sheet', () => {
    expect(() => toArgbHex('plum')).toThrow(/unsupported colour format/);
    expect(() => toArgbHex('#12345')).toThrow(/unsupported colour format/);
  });

  it('converts every client palette token fed to the Payment Sheet', () => {
    // The appearance config in CartScreen's StripePaymentModal reads exactly
    // these tokens; any of them growing an unparseable format breaks checkout.
    const used = ['accent', 'bg', 'surface', 'border', 'sub', 'onAccent'] as const;
    for (const palette of [clientLightTheme, clientDarkTheme]) {
      for (const token of used) {
        expect(toArgbHex(palette[token])).toMatch(/^#[0-9A-F]{8}$/);
      }
    }
  });
});

describe('text on a solid accent fill', () => {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  };

  it.each([
    ['provider light', lightTheme],
    ['provider dark', darkTheme],
    ['client light', clientLightTheme],
    ['client dark', clientDarkTheme],
  ])('is readable on the %s palette', (_name, palette) => {
    expect(contrast(palette.onAccent, palette.accent)).toBeGreaterThanOrEqual(4.5);
  });
});
