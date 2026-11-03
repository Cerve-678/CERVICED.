// Pins the business-name fonts: every one sits in a listed collection, every
// one is actually loaded at start-up (an unloaded family silently falls back
// to the system font), and the thin scripts are the only ones drawn larger.
import fs from 'fs';
import path from 'path';
import {
  DEFAULT_PROVIDER_FONT,
  FONT_COLLECTIONS,
  PROVIDER_FONTS,
  resolveProviderFontFamily,
  resolveProviderFontScale,
} from '../constants/providerFonts';

const appSource = fs.readFileSync(path.join(__dirname, '..', '..', 'App.tsx'), 'utf8');
const useFontsCall = appSource.slice(appSource.indexOf('useFonts({'), appSource.indexOf('});', appSource.indexOf('useFonts({')));

describe('provider fonts', () => {
  it('loads every font family in App.tsx', () => {
    for (const font of PROVIDER_FONTS) {
      const loaded = useFontsCall.includes(`'${font.fontFamily}'`) || new RegExp(`\\b${font.fontFamily}\\b`).test(useFontsCall);
      expect({ font: font.key, loaded }).toEqual({ font: font.key, loaded: true });
    }
  });

  it('puts every font in a collection the picker lists, under its own key', () => {
    const collections = new Set(FONT_COLLECTIONS.map(c => c.key));
    for (const font of PROVIDER_FONTS) expect(collections.has(font.collection)).toBe(true);
    const keys = PROVIDER_FONTS.map(f => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('carries the owner’s fifteen picks alongside the original nine', () => {
    expect(PROVIDER_FONTS.filter(f => f.collection !== 'classics')).toHaveLength(15);
    expect(PROVIDER_FONTS.filter(f => f.collection === 'classics')).toHaveLength(9);
  });

  it('keeps Prata as the default and the fallback for an unknown key', () => {
    expect(resolveProviderFontFamily(DEFAULT_PROVIDER_FONT)).toBe('Prata-Regular');
    expect(resolveProviderFontFamily('no-such-font')).toBe('Prata-Regular');
    expect(resolveProviderFontFamily(null)).toBe('Prata-Regular');
  });

  it('only draws the thin scripts larger', () => {
    expect(resolveProviderFontScale('sacramento')).toBeGreaterThan(1);
    expect(resolveProviderFontScale('great-vibes')).toBeGreaterThan(1);
    expect(resolveProviderFontScale('playfair-display')).toBe(1);
    expect(resolveProviderFontScale(null)).toBe(1);
  });
});
