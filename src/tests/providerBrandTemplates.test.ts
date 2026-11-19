import { PROVIDER_BRAND_TEMPLATES, matchingBrandTemplate } from '../constants/providerBrandTemplates';
import { PROVIDER_FONTS } from '../constants/providerFonts';
import { PROVIDER_THEMES, encodeThemeKey, parseThemeKey } from '../constants/providerThemes';
import { getPageStyle, heroPhotoPickLimit } from '../constants/pageStyles';

describe('provider brand templates', () => {
  it('uses three distinct new layouts with valid palettes and fonts', () => {
    const styles = PROVIDER_BRAND_TEMPLATES.map(template => template.pageStyle);
    expect(new Set(styles).size).toBe(3);
    expect(styles).toEqual(['shopEdit', 'shopGallery', 'shopRitual']);
    for (const template of PROVIDER_BRAND_TEMPLATES) {
      expect(PROVIDER_THEMES.some(theme => theme.key === template.theme)).toBe(true);
      expect(PROVIDER_FONTS.some(font => font.key === template.font)).toBe(true);
      expect(getPageStyle(template.pageStyle).hero).toBe(template.pageStyle);
      expect(heroPhotoPickLimit(getPageStyle(template.pageStyle))).toBeGreaterThan(0);
    }
  });

  it('round-trips each look through the saved profile theme', () => {
    for (const template of PROVIDER_BRAND_TEMPLATES) {
      const stored = encodeThemeKey(
        template.theme, template.sheet, template.finish, template.shape,
        template.pageStyle, template.policyLook,
      );
      const parsed = parseThemeKey(stored);
      expect(parsed).toMatchObject({
        base: template.theme, sheet: template.sheet, finish: template.finish,
        shape: template.shape, pageStyle: template.pageStyle, policyLook: template.policyLook,
      });
      expect(matchingBrandTemplate({ ...template, theme: parsed.base! })).toBe(template.key);
    }
  });

  it('clears the selected look after an individual design choice changes', () => {
    const template = PROVIDER_BRAND_TEMPLATES[0]!;
    expect(matchingBrandTemplate({ ...template, shape: 'rounded' })).toBeNull();
  });
});
