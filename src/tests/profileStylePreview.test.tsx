import React from 'react';
import { render, screen } from '@testing-library/react-native';

import { PAGE_STYLES } from '../constants/pageStyles';
import { encodeThemeKey, SHEET_BG } from '../constants/providerThemes';
import { ProfileStylePreview } from '../features/providers/ProfileStylePreview';

jest.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
jest.mock('expo-blur', () => {
  const { View } = jest.requireActual('react-native');
  return { BlurView: View };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-svg', () => ({ __esModule: true, default: () => null, Path: () => null, Defs: () => null, Text: () => null, TextPath: () => null }));
jest.mock('../components/ProfileHeroBackdrop', () => () => null);
jest.mock('../components/FramedLogo', () => ({ LogoCircle: () => null }));

function renderPreview(styleKey: (typeof PAGE_STYLES)[number]['key']) {
  return render(
    <ProfileStylePreview
      themeKey={encodeThemeKey('app', SHEET_BG, 'blend', 'rounded', styleKey)}
      gradient={['#4A2C20', '#F5F1EC']}
      accent="#4A2C1E"
      backgroundImage={null}
      brandFont="default"
      name="Amara Lashes"
      logoUri={null}
      logoFraming={null}
      metaLabels={['LASHES', 'PECKHAM']}
      pillLabels={['LASHES', 'PECKHAM', 'HOME STUDIO']}
      kicker="LASHES"
      location="Peckham"
    />,
  );
}

describe('Branding preview', () => {
  it.each(PAGE_STYLES.map(style => style.key))('draws the %s profile with the name and every key heading', key => {
    renderPreview(key);
    expect(screen.getByText('Amara Lashes')).toBeTruthy();
    // Every style names its sections; screen readers hear the plain title.
    for (const title of ['Services', 'Reviews']) {
      expect(screen.queryAllByLabelText(title).length + screen.queryAllByText(title).length).toBeGreaterThan(0);
    }
  });

  it('shows Cover\'s pills, with how they work, instead of the small-caps line', () => {
    renderPreview('cover');
    expect(screen.getByText('HOME STUDIO')).toBeTruthy();
    expect(screen.queryByText('LASHES · PECKHAM')).toBeNull();
  });

  it('shows the small-caps line, without the venue words, on the other styles', () => {
    renderPreview('classic');
    expect(screen.getByText('LASHES · PECKHAM')).toBeTruthy();
    expect(screen.queryByText('HOME STUDIO')).toBeNull();
  });

  it('keeps Classic\'s tabbed About / Policy card', () => {
    renderPreview('classic');
    expect(screen.getByText('About')).toBeTruthy();
    expect(screen.getByText('Policy')).toBeTruthy();
  });
});

describe('hero layouts', () => {
  it('puts the name at the top of Arch, with the welcome, the area and "Meet"', () => {
    renderPreview('arch');
    expect(screen.getByText('WELCOME TO MY BOOKING PAGE')).toBeTruthy();
    expect(screen.getByText('Located in Peckham')).toBeTruthy();
    expect(screen.getByText('Meet')).toBeTruthy();
    expect(screen.getByText('Amara')).toBeTruthy();
  });

  it('sets Framed\'s welcome beside the logo', () => {
    renderPreview('framed');
    expect(screen.getByText('WELCOME TO')).toBeTruthy();
    expect(screen.getByText('located in')).toBeTruthy();
  });

  it('leaves the logo off Cover, and keeps it on Classic', () => {
    renderPreview('cover');
    expect(screen.queryByText('AL')).toBeNull();
    screen.unmount();
    renderPreview('classic');
    expect(screen.getByText('AL')).toBeTruthy();
  });

  it('prints what they do above the name on Spa', () => {
    renderPreview('spa');
    expect(screen.getByText('LASHES')).toBeTruthy();
  });
});
