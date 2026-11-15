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

function renderPreview(styleKey: (typeof PAGE_STYLES)[number]['key'], brandFont = 'default') {
  return render(
    <ProfileStylePreview
      themeKey={encodeThemeKey('app', SHEET_BG, 'blend', 'rounded', styleKey)}
      gradient={['#4A2C20', '#F5F1EC']}
      accent="#4A2C1E"
      backgroundImage={null}
      brandFont={brandFont}
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
    // Some heroes set the name in two voices; screen readers still hear it whole.
    expect(screen.queryAllByText('Amara Lashes').length + screen.queryAllByLabelText('Amara Lashes').length).toBeGreaterThan(0);
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

describe('the 2026-11-14 heroes', () => {
  it('splits Editorial\'s name into a light word and bold caps with a full stop', () => {
    renderPreview('editorial');
    expect(screen.getByText('Amara')).toBeTruthy();
    expect(screen.getByText('LASHES.')).toBeTruthy();
  });

  it('puts Heritage\'s name round a seal, with what they do under it', () => {
    renderPreview('heritage');
    expect(screen.getByLabelText('Amara Lashes')).toBeTruthy();
    expect(screen.getByText('Lashes')).toBeTruthy();
  });

  it('welcomes on Duet\'s card and lists what they do as pills', () => {
    renderPreview('duet');
    expect(screen.getByText('HEY GORGEOUS, WELCOME TO')).toBeTruthy();
    expect(screen.getByText('Amara')).toBeTruthy();
    // Once in the name's caps, once as the pill for what they do.
    expect(screen.getAllByText('LASHES')).toHaveLength(2);
    expect(screen.queryByText('YOUR ARTIST')).toBeNull();
  });

  it('puts Groovy\'s name on a pill beside a rating starburst and tag stickers', () => {
    renderPreview('groovy');
    expect(screen.getByLabelText('Rated 5.0')).toBeTruthy();
    expect(screen.getByText('amara lashes')).toBeTruthy();
    expect(screen.getByText('PECKHAM')).toBeTruthy();
  });

  it('leaves Gallery without a placard or wall labels', () => {
    renderPreview('gallery');
    expect(screen.queryByText('NO. 01 · THE ARTIST')).toBeNull();
    expect(screen.queryByText('ON VIEW')).toBeNull();
    expect(screen.queryByText('VISITOR BOOK')).toBeNull();
    expect(screen.getByText('Lashes.')).toBeTruthy();
  });

  it('prints the name in capitals on Apothecary\'s tag', () => {
    renderPreview('apothecary');
    expect(screen.getByText('AMARA LASHES')).toBeTruthy();
    expect(screen.getByText('lashes')).toBeTruthy();
    expect(screen.getByText('PECKHAM')).toBeTruthy();
  });

  it('sets the name in the style\'s own font even when the provider chose a Branding font', () => {
    renderPreview('groovy', 'great-vibes');
    expect(screen.getByText('amara lashes')).toBeTruthy();
    renderPreview('apothecary', 'great-vibes');
    expect(screen.getAllByText('AMARA LASHES').length).toBeGreaterThan(0);
  });

});

describe('the 2026-11-15 templates', () => {
  it('puts Snapshot\'s name in caps on its colour block, with the area and square tags under it', () => {
    renderPreview('snapshot');
    expect(screen.getByText('AMARA LASHES')).toBeTruthy();
    expect(screen.getByText('PECKHAM')).toBeTruthy();
    expect(screen.getByText('LASHES')).toBeTruthy();
    expect(screen.getByText('THE SERVICES')).toBeTruthy();
  });

  it('signs the whole name across Signature\'s logo', () => {
    renderPreview('signature');
    expect(screen.getByText('WELCOME TO')).toBeTruthy();
    expect(screen.getByLabelText('Amara Lashes')).toBeTruthy();
    expect(screen.getByText('The Services')).toBeTruthy();
    expect(screen.getByText('03')).toBeTruthy();
  });

  it('puts Quiet\'s name on its band with the area above it', () => {
    renderPreview('quiet');
    expect(screen.getByText('AMARA LASHES')).toBeTruthy();
    expect(screen.getByText('PECKHAM')).toBeTruthy();
  });
});
