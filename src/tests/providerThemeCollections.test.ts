// Pins the colour collections and the hero finish added to Branding & Style
// on 2026-11-03: every set sits in a listed collection, the finish survives a
// save and reload inside profile_theme, and keys saved before it still read.
import {
  DEFAULT_PROVIDER_THEME,
  NEUTRAL_CARD,
  PROVIDER_THEMES,
  SHEET_BG,
  SHEET_OPTIONS,
  THEME_COLLECTIONS,
  encodeCustomTheme,
  encodeThemeKey,
  parseThemeKey,
  resolveProviderTheme,
} from '../constants/providerThemes';
import { finishHeightShare, sheenColors } from '../components/ProfileHeroBackdrop';

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe('theme collections', () => {
  it('puts every set in a collection the picker lists, with a content area that exists', () => {
    const collections = new Set(THEME_COLLECTIONS.map(c => c.key));
    const sheets = new Set(SHEET_OPTIONS.map(o => o.key));
    for (const theme of PROVIDER_THEMES) {
      expect(collections.has(theme.collection)).toBe(true);
      expect(sheets.has(theme.suggestedSheet)).toBe(true);
    }
  });

  it('gives every set its own key', () => {
    const keys = PROVIDER_THEMES.map(t => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('carries the owner’s fifteen picks, plus the eight Clean Girl and Gilded ones', () => {
    const picked = PROVIDER_THEMES.filter(t => t.collection !== 'classics').map(t => t.name);
    expect(picked).toHaveLength(23);
    expect(picked).toEqual(expect.arrayContaining(['Tangerine & Navy', 'Emerald & Gold', 'Oat Milk', 'Desert Rose']));
    const second = PROVIDER_THEMES.filter(t => t.collection === 'clean' || t.collection === 'gilded').map(t => t.name);
    expect(second).toEqual([
      'Milk Glaze', 'Glazed Rose', 'Coconut & Ink', 'Almond Silk', 'Cloud',
      'White & Gold', 'Black & Gold', 'Antique Bronze',
    ]);
  });

  // Clean Girl and Gilded only: several of their content areas are new.
  // (Deep Teal & Coral's coral sits under 3:1 on its Mist, from before.)
  it('keeps the Clean Girl and Gilded accents readable on their own content area', () => {
    for (const theme of PROVIDER_THEMES.filter(t => t.collection === 'clean' || t.collection === 'gilded')) {
      const sheet = SHEET_OPTIONS.find(o => o.key === theme.suggestedSheet)!.color;
      expect({ theme: theme.key, ok: contrast(theme.tokens.accent, sheet) >= 3 }).toEqual({ theme: theme.key, ok: true });
    }
  });

  it('keeps every collection accent readable as small text on the pale cards', () => {
    for (const theme of PROVIDER_THEMES.filter(t => t.collection !== 'classics')) {
      expect({ theme: theme.key, ok: contrast(theme.tokens.accent, NEUTRAL_CARD) >= 3 }).toEqual({ theme: theme.key, ok: true });
    }
  });

  it('still falls back to the App set for an unknown key, though it is no longer listed first', () => {
    expect(resolveProviderTheme('no-such-theme')).toEqual(resolveProviderTheme(DEFAULT_PROVIDER_THEME));
    expect(PROVIDER_THEMES[0]!.key).not.toBe(DEFAULT_PROVIDER_THEME);
  });
});

describe('hero finish in profile_theme', () => {
  it('leaves the stored value as it was when the finish is the default blend', () => {
    expect(encodeThemeKey('clay', SHEET_BG)).toBe('clay');
    expect(encodeThemeKey('clay', '#F8ECF0')).toBe('clay|#F8ECF0');
    expect(encodeThemeKey('clay', '#F8ECF0', 'blend')).toBe('clay|#F8ECF0');
  });

  it('round-trips a finish, writing the sheet out so the parts never shift', () => {
    expect(encodeThemeKey('emeraldgold', SHEET_BG, 'glow')).toBe(`emeraldgold|${SHEET_BG}|glow`);
    expect(parseThemeKey(encodeThemeKey('emeraldgold', '#FBF6EC', 'split'))).toEqual({
      base: 'emeraldgold',
      sheet: '#FBF6EC',
      finish: 'split',
    });
  });

  it('reads keys saved before the finish existed as a blend', () => {
    expect(parseThemeKey('clay|#F8ECF0')).toEqual({ base: 'clay', sheet: '#F8ECF0', finish: 'blend' });
    expect(parseThemeKey('app')).toEqual({ base: 'app', sheet: SHEET_BG, finish: 'blend' });
    expect(parseThemeKey(null)).toEqual({ base: null, sheet: SHEET_BG, finish: 'blend' });
  });

  it('round-trips Sheen, which builds before it read as a blend', () => {
    expect(parseThemeKey(encodeThemeKey('blackgold', '#EBEBEA', 'sheen'))).toEqual({
      base: 'blackgold',
      sheet: '#EBEBEA',
      finish: 'sheen',
    });
  });

  it('ignores a finish it does not know', () => {
    expect(parseThemeKey('clay|#F8ECF0|sparkle').finish).toBe('blend');
  });

  it('keeps a custom set readable with a finish on the end', () => {
    const base = encodeCustomTheme('#1D4A3C', '#FCFBFA', '#A98235');
    const key = encodeThemeKey(base, '#FBF6EC', 'solid');
    expect(parseThemeKey(key)).toEqual({ base, sheet: '#FBF6EC', finish: 'solid' });
    expect(resolveProviderTheme(key).accent).toBe('#A98235');
  });

  it('resolves the same colours whatever the finish', () => {
    expect(resolveProviderTheme(encodeThemeKey('cobaltblush', '#F8ECF0', 'glow'))).toEqual(
      resolveProviderTheme(encodeThemeKey('cobaltblush', '#F8ECF0')),
    );
  });
});

describe('Sheen', () => {
  it('runs first colour, second, a lighter band, second, first', () => {
    const [a, b, light, c, d] = sheenColors('#FFFFFF', '#F2E7D2');
    expect([a, b, c, d]).toEqual(['#FFFFFF', '#F2E7D2', '#F2E7D2', '#FFFFFF']);
    expect(lum(light)).toBeGreaterThan(lum('#F2E7D2'));
  });

  it('keeps the band softer on a dark hero', () => {
    const pale = sheenColors('#F2E6CC', '#2A2418')[2];
    const dark = sheenColors('#0D0C0A', '#2A2418')[2];
    expect(lum(dark)).toBeLessThan(lum(pale));
  });
});

describe('Split and Sheen placement', () => {
  it('lays them over the top of a full-screen backdrop, where the hero shows', () => {
    // iPhone 15: 393 x 852. The hero is the top ~490pt, not the whole screen.
    expect(finishHeightShare(393, 852)).toBeCloseTo((393 * 1.25) / 852);
    expect(finishHeightShare(393, 852)).toBeLessThan(0.6);
  });

  it('leaves the Branding swatches and preview drawn over their whole height', () => {
    expect(finishHeightShare(64, 80)).toBe(1); // swatch, aspect 0.8
    expect(finishHeightShare(350, 180)).toBe(1); // live preview
    expect(finishHeightShare(0, 0)).toBe(1);
  });
});

describe('content areas', () => {
  it('keeps even the darkest grey readable for the grey text on it', () => {
    const smoke = SHEET_OPTIONS.find(o => o.key === 'smoke')!.color;
    expect(contrast('#655A57', smoke)).toBeGreaterThanOrEqual(4);
    expect(lum(smoke)).toBeLessThan(lum(SHEET_OPTIONS.find(o => o.key === 'dove')!.color));
  });
});
