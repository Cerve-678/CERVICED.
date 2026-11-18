import { buildProviderPagePalette } from '../features/providers/page/providerPagePalette';
import type { ProviderProfileData } from '../features/providers/profileTypes';

/** A provider with only the branding fields the palette reads. */
function provider(overrides: Partial<ProviderProfileData>): ProviderProfileData {
  return {
    profileTheme: null,
    accentColor: null,
    hasCustomGradient: false,
    gradient: [],
    backgroundImage: null,
    serviceTypes: ['LASHES'],
    providerService: 'LASHES',
    customServiceType: '',
    location: 'Hackney, London',
    businessType: null,
    ...overrides,
  } as unknown as ProviderProfileData;
}

describe('buildProviderPagePalette', () => {
  it('shows the App theme and Classic before the provider loads', () => {
    const palette = buildProviderPagePalette(null);
    expect(palette.pageStyle.key).toBe('classic');
    expect(palette.OP.hero).toBe('#4A2C20');
    expect(palette.adaptiveAccentColor).toBe('#4A2C1E');
    expect(palette.heroKicker).toBe('');
    expect(palette.heroPillLabels).toEqual([]);
  });

  it('inks the hero white over the dark App backdrop and dark over a pale one', () => {
    expect(buildProviderPagePalette(provider({ profileTheme: 'app' })).heroText).toBe('#FFFFFF');
    const blush = buildProviderPagePalette(provider({ profileTheme: 'blush' }));
    expect(blush.heroIsDark).toBe(false);
    expect(blush.heroText).toBe('#26201E');
  });

  it('always treats a background photo as dark', () => {
    const palette = buildProviderPagePalette(provider({ profileTheme: 'blush', backgroundImage: 'https://x/y.jpg' } as Partial<ProviderProfileData>));
    expect(palette.heroIsDark).toBe(true);
  });

  it("prefers the provider's saved accent over the theme's", () => {
    const palette = buildProviderPagePalette(provider({ profileTheme: 'app', accentColor: '#123456' }));
    expect(palette.adaptiveAccentColor).toBe('#123456');
    expect(palette.sectionPalette.accent).toBe('#123456');
    expect(palette.recommendBadgeTheme.accent).toBe('#123456');
  });

  it('names every service type in the kicker, with a custom name for OTHER', () => {
    const palette = buildProviderPagePalette(provider({
      serviceTypes: ['LASHES', 'OTHER', 'LASHES'],
      customServiceType: 'Henna',
    } as Partial<ProviderProfileData>));
    expect(palette.heroKicker).toBe('LASHES · HENNA');
  });

  it('frosts cards from the theme card colour', () => {
    const palette = buildProviderPagePalette(provider({ profileTheme: 'app' }));
    expect(palette.cardBlurTint).toBe('light');
    expect(palette.cardBlurIntensity).toBe(25);
    expect(palette.sectionPalette.cardBackground).toBe(palette.cardBg);
  });
});
