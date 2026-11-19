import { readFileSync } from 'fs';
import { join } from 'path';

import {
  CUSTOM_HEADING_FONTS,
  CUSTOM_LAYOUTS,
  CUSTOM_PARTS,
  CUSTOM_TEXT_FONTS,
  DEFAULT_CUSTOM_CHOICES,
  LAYOUT_PARTS,
  matchingLook,
  partsOf,
  withPart,
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

const picks: CustomChoices = { ...LAYOUT_PARTS.banner, layout: 'banner', heading: 'gilda', text: 'castoro', headingStyle: 'caps' };

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
    expect(parseCustomChoices('nope~zzz~jost~1')).toEqual({ ...DEFAULT_CUSTOM_CHOICES, text: 'jost', headingStyle: 'caps' });
    expect(parseCustomChoices(undefined)).toEqual(DEFAULT_CUSTOM_CHOICES);
    expect(parseThemeKey('app|#F5F1EC|blend|rounded|custom').custom).toEqual(DEFAULT_CUSTOM_CHOICES);
    expect(parseCustomChoices(encodeCustomChoices(picks))).toEqual(picks);
  });

  it('is a page style key without being in the fixed list the pickers show', () => {
    expect(isPageStyleKey('custom')).toBe(true);
    expect(PAGE_STYLES.some(style => style.key === 'custom')).toBe(false);
    expect(getPageStyle('custom', picks).custom).toMatchObject({ layout: 'banner', headingStyle: 'caps', headingFont: 'GildaDisplay-Regular', textFont: 'Castoro-Regular' });
    expect(getPageStyle('custom').custom?.layout).toBe(DEFAULT_CUSTOM_CHOICES.layout);
  });

  it('draws the name in the Business Name Font on every layout, with no hero photos to pick', () => {
    for (const layout of CUSTOM_LAYOUTS) {
      const style = customPageStyle({ ...DEFAULT_CUSTOM_CHOICES, ...LAYOUT_PARTS[layout.key], layout: layout.key });
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

  it('only offers fonts the app actually loads', () => {
    const app = readFileSync(join(__dirname, '../../App.tsx'), 'utf8');
    for (const font of [...CUSTOM_HEADING_FONTS, ...CUSTOM_TEXT_FONTS]) {
      expect(app).toContain(font.fontFamily);
    }
    expect(new Set(CUSTOM_HEADING_FONTS.map(font => font.key)).size).toBe(CUSTOM_HEADING_FONTS.length);
    expect(new Set(CUSTOM_TEXT_FONTS.map(font => font.key)).size).toBe(CUSTOM_TEXT_FONTS.length);
  });

  it('gives every font set its own three fonts', () => {
    const triples = FONT_SETS.map(fontSet => `${fontSet.nameFont}/${fontSet.heading}/${fontSet.text}`);
    expect(new Set(triples).size).toBe(FONT_SETS.length);
  });

  it('lays Soft out on round cards and Bold Boxes on round outlined boxes, both reading back', () => {
    expect(customPageStyle(parseCustomChoices('soft~prata~jura~0'))).toMatchObject({ cards: 'soft', policies: 'softTiles', hero: 'stacked', roundedPhotos: true });
    expect(customPageStyle(parseCustomChoices('bigBoxes~prata~jura~0'))).toMatchObject({ cards: 'outlineRound', policies: 'boxes', hero: 'customBig' });
    expect(parseCustomChoices('bigBoxes~cinzel~oldStandard~0')).toEqual({ ...LAYOUT_PARTS.bigBoxes, layout: 'bigBoxes', heading: 'cinzel', text: 'oldStandard', headingStyle: 'typed' });
  });

  it('knows which set three fonts make, and when they make none', () => {
    expect(matchingFontSet('italiana', 'prata', 'castoro')?.name).toBe('Old Money');
    expect(matchingFontSet('italiana', 'prata', 'jura')).toBeNull();
  });

  it('reads a page saved before parts existed exactly as it looked', () => {
    // The six old layouts, each with what they set back then.
    expect(customPageStyle(parseCustomChoices('plain~prata~jura~0'))).toMatchObject({ hero: 'stacked', cards: 'none', policies: 'hairline', logo: 'circle' });
    expect(customPageStyle(parseCustomChoices('cards~prata~jura~0'))).toMatchObject({ hero: 'customLeft', cards: 'flat', policies: 'rows', logo: 'circle' });
    expect(customPageStyle(parseCustomChoices('bigName~prata~jura~0'))).toMatchObject({ hero: 'customBig', cards: 'none', policies: 'definition' });
    expect(customPageStyle(parseCustomChoices('banner~prata~jura~1'))).toMatchObject({ hero: 'stacked', cards: 'outline', policies: 'boxes', logo: 'doubleRing' });
    expect(customPageStyle(parseCustomChoices('banner~prata~jura~1')).custom?.headingStyle).toBe('caps');
  });

  it('only writes the parts once they differ from the look, and reads every part back', () => {
    expect(encodeCustomChoices({ ...DEFAULT_CUSTOM_CHOICES, headingStyle: 'numbered' })).toBe('plain~prata~jura~n');
    for (const part of CUSTOM_PARTS) {
      for (const option of part.options) {
        const changed = withPart(DEFAULT_CUSTOM_CHOICES, part.key, option.key);
        expect(changed[part.key]).toBe(option.key);
        expect(parseCustomChoices(encodeCustomChoices(changed))).toEqual(changed);
      }
    }
    expect(encodeCustomChoices(withPart(DEFAULT_CUSTOM_CHOICES, 'top', 'arch'))).toBe('plain~prata~jura~0~arch~open~lines~list~plain');
  });

  it('ignores a part value that is not one of its choices', () => {
    expect(withPart(DEFAULT_CUSTOM_CHOICES, 'top', 'nope')).toBe(DEFAULT_CUSTOM_CHOICES);
    expect(parseCustomChoices('plain~prata~jura~0~nope~cards').surface).toBe('cards');
    expect(parseCustomChoices('plain~prata~jura~0~nope~cards').top).toBe('centred');
  });

  it('knows which look the parts make, whatever the headings', () => {
    for (const look of CUSTOM_LAYOUTS) {
      expect(matchingLook({ ...LAYOUT_PARTS[look.key], headingStyle: 'script' })).toBe(look.key);
    }
    expect(matchingLook(partsOf(withPart(DEFAULT_CUSTOM_CHOICES, 'photos', 'stamps')))).toBeNull();
  });

  it('keeps the name in the Business Name Font on every top', () => {
    for (const option of CUSTOM_PARTS.find(p => p.key === 'top')!.options) {
      expect(heroUsesBrandFont(customPageStyle(withPart(DEFAULT_CUSTOM_CHOICES, 'top', option.key)))).toBe(true);
    }
  });
});
