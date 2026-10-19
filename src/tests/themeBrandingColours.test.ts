import {
  DEFAULT_PROVIDER_THEME,
  SHEET_BG,
  encodeCustomTheme,
  resolveProviderTheme,
  themeBrandingColours,
} from '../constants/providerThemes';

describe('themeBrandingColours', () => {
  it('gives a new provider the default theme’s own backdrop and accent, as Branding saves them', () => {
    const app = resolveProviderTheme(DEFAULT_PROVIDER_THEME);
    expect(themeBrandingColours(DEFAULT_PROVIDER_THEME)).toEqual({
      gradient: [app.hero, SHEET_BG],
      accentColor: app.accent,
    });
  });

  it('never hands back the old coral/teal/blue placeholder', () => {
    expect(themeBrandingColours(DEFAULT_PROVIDER_THEME).gradient).not.toContain('#FF6B6B');
    expect(themeBrandingColours(null).gradient).not.toContain('#FF6B6B');
  });

  it('follows a custom set’s backdrop and accent', () => {
    const key = encodeCustomTheme('#CBDCC2', '#F7FAF3', '#2E7D32');
    expect(themeBrandingColours(key)).toEqual({
      gradient: ['#CBDCC2', SHEET_BG],
      accentColor: '#2E7D32',
    });
  });

  it('falls back to the default theme for a missing or unknown key', () => {
    expect(themeBrandingColours(undefined)).toEqual(themeBrandingColours(DEFAULT_PROVIDER_THEME));
    expect(themeBrandingColours('no-such-theme')).toEqual(themeBrandingColours(DEFAULT_PROVIDER_THEME));
  });
});
