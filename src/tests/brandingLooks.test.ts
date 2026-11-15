import {
  BRANDING_LOOKS,
  isLookUnlockedForLinkOnly,
  lookMatches,
  resolveLook,
} from '../constants/brandingLooks';
import { PAGE_STYLES } from '../constants/pageStyles';
import { PROVIDER_FONTS } from '../constants/providerFonts';
import { PROVIDER_THEMES, SHEET_OPTIONS } from '../constants/providerThemes';

describe('Branding Looks', () => {
  it('only names colour sets, content colours, fonts and page styles that exist', () => {
    for (const look of BRANDING_LOOKS) {
      expect(PROVIDER_THEMES.some(t => t.key === look.theme)).toBe(true);
      if (look.sheet) expect(SHEET_OPTIONS.some(o => o.key === look.sheet)).toBe(true);
      expect(PROVIDER_FONTS.some(f => f.key === look.font)).toBe(true);
      expect(PAGE_STYLES.some(s => s.key === look.pageStyle)).toBe(true);
    }
  });

  it('has unique keys and no two Looks that are the same combination', () => {
    expect(new Set(BRANDING_LOOKS.map(l => l.key)).size).toBe(BRANDING_LOOKS.length);
    const combos = BRANDING_LOOKS.map(l => {
      const r = resolveLook(l);
      return [r.themeChoice, r.sheetColor, r.finish, r.shape, r.pageStyle, r.font].join('|');
    });
    expect(new Set(combos).size).toBe(combos.length);
  });

  it('resolves to the colour set’s own accent and gradient, and its suggested content colour unless one is named', () => {
    const original = BRANDING_LOOKS.find(l => l.key === 'original')!;
    const preset = PROVIDER_THEMES.find(t => t.key === original.theme)!;
    const resolved = resolveLook(original);
    expect(resolved.accentColor).toBe(preset.tokens.accent);
    expect(resolved.gradient).toEqual(preset.tokens.gradient);
    expect(resolved.sheetColor).toBe(SHEET_OPTIONS.find(o => o.key === preset.suggestedSheet)!.color);

    const oldMoney = BRANDING_LOOKS.find(l => l.key === 'old-money')!;
    expect(resolveLook(oldMoney).sheetColor).toBe(SHEET_OPTIONS.find(o => o.key === 'champagne')!.color);
  });

  it('shows a Look as chosen only while every part still matches', () => {
    const look = BRANDING_LOOKS.find(l => l.key === 'clean-girl')!;
    const r = resolveLook(look);
    const current = {
      themeChoice: r.themeChoice, sheetColor: r.sheetColor.toLowerCase(), finish: r.finish,
      shape: r.shape, pageStyle: r.pageStyle, font: r.font,
    };
    expect(lookMatches(look, current)).toBe(true);
    expect(lookMatches(look, { ...current, font: 'default' })).toBe(false);
    expect(lookMatches(look, { ...current, shape: 'square' })).toBe(false);
    // Each Look matches only itself.
    for (const other of BRANDING_LOOKS) {
      if (other.key !== look.key) expect(lookMatches(other, current)).toBe(false);
    }
  });

  it('leaves link-only providers only the Looks made entirely of parts they already have', () => {
    const unlocked = BRANDING_LOOKS.filter(isLookUnlockedForLinkOnly).map(l => l.key);
    expect(unlocked).toEqual(['original', 'blush']);
  });
});
