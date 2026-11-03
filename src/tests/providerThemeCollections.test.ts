// Pins the colour collections and the hero finish added to Branding & Style
// on 2026-11-03: every set sits in a listed collection, the finish survives a
// save and reload inside profile_theme, and keys saved before it still read.
import {
  DEFAULT_PROVIDER_THEME,
  PROVIDER_THEMES,
  SHEET_BG,
  SHEET_OPTIONS,
  THEME_COLLECTIONS,
  encodeCustomTheme,
  encodeThemeKey,
  parseThemeKey,
  resolveProviderTheme,
} from '../constants/providerThemes';

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

  it('carries the owner’s fifteen picks', () => {
    const picked = PROVIDER_THEMES.filter(t => t.collection !== 'classics').map(t => t.name);
    expect(picked).toHaveLength(15);
    expect(picked).toEqual(expect.arrayContaining(['Tangerine & Navy', 'Emerald & Gold', 'Oat Milk', 'Desert Rose']));
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
