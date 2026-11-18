import {
  CUSTOM_HEADING_FONTS,
  CUSTOM_LAYOUTS,
  CUSTOM_TEXT_FONTS,
  DEFAULT_CUSTOM_CHOICES,
  FONT_SETS,
  customPageStyle,
  encodeCustomChoices,
  matchingFontSet,
  parseCustomChoices,
  type CustomChoices,
} from '../constants/customPageStyle';
import { getPageStyle, heroPhotoPickLimit, isPageStyleKey, PAGE_STYLES } from '../constants/pageStyles';
import { PROVIDER_FONTS } from '../constants/providerFonts';
import { encodeThemeKey, parseThemeKey, SHEET_BG } from '../constants/providerThemes';
import { heroUsesBrandFont } from '../features/providers/ProfileHero';

const picks: CustomChoices = { layout: 'banner', heading: 'gilda', text: 'castoro', caps: true };

describe('Custom page style', () => {
  it('saves its picks as the seventh part of profile_theme and reads them back', () => {
    const key = encodeThemeKey('blush', '#F8ECF0', 'glow', 'square', 'custom', 'melt', picks);
    expect(key).toBe('blush|#F8ECF0|glow|square|custom|melt|banner~gilda~castoro~1');
    const parsed = parseThemeKey(key);
    expect(parsed.pageStyle).toBe('custom');
    expect(parsed.custom).toEqual(picks);
    expect(parsed.shape).toBe('square');
  });

  it('writes nothing extra for any other page style', () => {
    expect(encodeThemeKey('app', SHEET_BG, 'blend', 'rounded', 'spa', 'melt', picks)).toBe(`app|${SHEET_BG}|blend|rounded|spa`);
    expect(encodeThemeKey('app', SHEET_BG, 'blend', 'rounded', 'classic', 'melt', picks)).toBe('app');
  });

  it('falls back part by part on anything it cannot read', () => {
    expect(parseCustomChoices('nope~zzz~jost~1')).toEqual({ ...DEFAULT_CUSTOM_CHOICES, text: 'jost', caps: true });
    expect(parseCustomChoices(undefined)).toEqual(DEFAULT_CUSTOM_CHOICES);
    expect(parseThemeKey('app|#F5F1EC|blend|rounded|custom').custom).toEqual(DEFAULT_CUSTOM_CHOICES);
    expect(parseCustomChoices(encodeCustomChoices(picks))).toEqual(picks);
  });

  it('is a page style key without being in the fixed list the pickers show', () => {
    expect(isPageStyleKey('custom')).toBe(true);
    expect(PAGE_STYLES.some(style => style.key === 'custom')).toBe(false);
    expect(getPageStyle('custom', picks).custom).toMatchObject({ layout: 'banner', caps: true, headingFont: 'GildaDisplay-Regular', textFont: 'Castoro-Regular' });
    expect(getPageStyle('custom').custom?.layout).toBe(DEFAULT_CUSTOM_CHOICES.layout);
  });

  it('draws the name in the Business Name Font on every layout, with no hero photos to pick', () => {
    for (const layout of CUSTOM_LAYOUTS) {
      const style = customPageStyle({ ...DEFAULT_CUSTOM_CHOICES, layout: layout.key });
      expect(style.heading).toBe('custom');
      expect(heroUsesBrandFont(style)).toBe(true);
      expect(heroPhotoPickLimit(style)).toBe(0);
    }
  });

  it('only offers font sets made of fonts that exist', () => {
    const nameKeys = PROVIDER_FONTS.map(font => font.key);
    for (const fontSet of FONT_SETS) {
      expect(nameKeys).toContain(fontSet.nameFont);
      expect(CUSTOM_HEADING_FONTS.map(font => font.key)).toContain(fontSet.heading);
      expect(CUSTOM_TEXT_FONTS.map(font => font.key)).toContain(fontSet.text);
    }
    expect(new Set(FONT_SETS.map(fontSet => fontSet.key)).size).toBe(FONT_SETS.length);
  });

  it('knows which set three fonts make, and when they make none', () => {
    expect(matchingFontSet('italiana', 'prata', 'castoro')?.name).toBe('Old Money');
    expect(matchingFontSet('italiana', 'prata', 'jura')).toBeNull();
  });
});
