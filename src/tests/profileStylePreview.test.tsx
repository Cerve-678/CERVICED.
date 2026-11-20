import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { CUSTOM_LAYOUTS, CUSTOM_PARTS, DEFAULT_CUSTOM_CHOICES, LAYOUT_PARTS, withPart } from '../constants/customPageStyle';
import { PAGE_STYLES } from '../constants/pageStyles';
import { encodeThemeKey, SHEET_BG } from '../constants/providerThemes';
import { ProfileStylePreview } from '../features/providers/ProfileStylePreview';

jest.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
jest.mock('expo-blur', () => {
  const { View } = jest.requireActual('react-native');
  return { BlurView: View };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-svg', () => ({ __esModule: true, default: () => null, Path: () => null, Polygon: () => null, Defs: () => null, Text: () => null, TextPath: () => null }));
jest.mock('../components/ProfileHeroBackdrop', () => () => null);
jest.mock('../components/FramedLogo', () => ({ LogoCircle: () => null }));

function renderPreview(
  styleKey: (typeof PAGE_STYLES)[number]['key'],
  brandFont = 'default',
  content?: React.ComponentProps<typeof ProfileStylePreview>['content'],
  full = false,
) {
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
      content={content}
      rating="5.0"
      full={full}
    />,
  );
}

describe('Branding preview', () => {
  it('shows their own About and categories, with outline cards instead of their services', () => {
    renderPreview('stripes', 'default', {
      about: 'Soft lash sets from a quiet studio.',
      categories: ['Lash extensions', 'Brows'],
      services: [{ name: 'Classic full set', minutes: 120, price: 65 }, { name: 'Infill', minutes: 45, price: 40.5 }],
    });
    expect(screen.getByText('Soft lash sets from a quiet studio.')).toBeTruthy();
    expect(screen.getByText('Lash extensions')).toBeTruthy();
    expect(screen.queryByText('Classic full set')).toBeNull();
    expect(screen.queryByText('2h · £65')).toBeNull();
  });

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

  it('puts a small logo above the name on Cover, as on Classic', () => {
    renderPreview('cover');
    expect(screen.getByText('AL')).toBeTruthy();
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

  it('puts Heritage\'s name round a seal, with what they do and their area under it', () => {
    renderPreview('heritage');
    expect(screen.getByLabelText('Amara Lashes')).toBeTruthy();
    expect(screen.getByText('Lashes')).toBeTruthy();
    // Under the seal as text, not curved round its foot.
    expect(screen.getByText('PECKHAM')).toBeTruthy();
  });

  it('welcomes on Duet\'s card without repeating what they do', () => {
    renderPreview('duet');
    expect(screen.getByText('HEY GORGEOUS, WELCOME TO')).toBeTruthy();
    expect(screen.getByText('Amara')).toBeTruthy();
    // Only in the name's caps: Additional Information lists it as Category.
    expect(screen.getAllByText('LASHES')).toHaveLength(1);
    expect(screen.queryByText('YOUR ARTIST')).toBeNull();
    // The slots pill sits inside the card.
    expect(screen.getByText('Stay updated')).toBeTruthy();
    expect(screen.getByText('PECKHAM')).toBeTruthy();
  });

  it('puts Groovy\'s name on a pill beside a rating starburst and tag stickers', () => {
    renderPreview('groovy');
    expect(screen.getByLabelText('Rated 5.0')).toBeTruthy();
    expect(screen.getByText('amara lashes')).toBeTruthy();
    expect(screen.getByText('PECKHAM')).toBeTruthy();
  });

  it('shows a new provider no rating sticker rather than a made-up one', () => {
    render(
      <ProfileStylePreview
        themeKey={encodeThemeKey('app', SHEET_BG, 'blend', 'rounded', 'groovy')}
        gradient={['#4A2C20', '#F5F1EC']} accent="#4A2C1E" backgroundImage={null} brandFont="default"
        name="Amara Lashes" logoUri={null} logoFraming={null} metaLabels={[]} pillLabels={[]} kicker="LASHES" location="Peckham"
        rating="0"
      />,
    );
    expect(screen.queryByLabelText(/^Rated /)).toBeNull();
  });

  it('in Info Reg, shows every category as the profile\'s pills, and switches services on tap', () => {
    renderPreview('stripes', 'default', {
      about: '',
      categories: ['Lashes', 'Brows', 'Lash lifts and tints'],
      services: [{ name: 'Classic set', minutes: 90, price: 45 }],
      servicesByCategory: {
        Lashes: [{ name: 'Classic set', minutes: 90, price: 45 }],
        Brows: [{ name: 'Brow lamination', minutes: 45, price: 35 }],
        'Lash lifts and tints': [{ name: 'Lift', minutes: 60, price: 40 }],
      },
    }, true);
    expect(screen.getByText('Lash lifts and tints')).toBeTruthy();
    expect(screen.getByText('Classic set')).toBeTruthy();
    fireEvent(screen.getByText('Brows'), 'pressOut');
    expect(screen.getByText('Brow lamination')).toBeTruthy();
  });

  it('leaves Gallery without a placard or wall labels', () => {
    renderPreview('gallery');
    expect(screen.queryByText('NO. 01 · THE ARTIST')).toBeNull();
    expect(screen.queryByText('ON VIEW')).toBeNull();
    expect(screen.queryByText('VISITOR BOOK')).toBeNull();
    expect(screen.getByText('Lashes.')).toBeTruthy();
  });

  it('keeps Apothecary\'s hero simple: the name, no prescription pad', () => {
    renderPreview('apothecary');
    expect(screen.getByText('Amara Lashes')).toBeTruthy();
    expect(screen.queryByText('℞')).toBeNull();
    expect(screen.queryByText('PRESCRIPTION')).toBeNull();
    expect(screen.queryByText('PRACTITIONER')).toBeNull();
  });

  it('sets the name in the style\'s own font even when the provider chose a Branding font', () => {
    renderPreview('groovy', 'great-vibes');
    expect(screen.getByText('amara lashes')).toBeTruthy();
    renderPreview('apothecary', 'great-vibes');
    const padName = screen.getAllByText('Amara Lashes')[0]!;
    expect(StyleSheet.flatten(padName.props['style']).fontFamily).toBe('MarcellusSC-Regular');
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

  it.each(CUSTOM_LAYOUTS.map(layout => layout.key))('draws a Custom %s page in the picked fonts', layout => {
    const caps = layout === 'banner';
    render(
      <ProfileStylePreview
        themeKey={encodeThemeKey('app', SHEET_BG, 'blend', 'rounded', 'custom', 'melt', { ...DEFAULT_CUSTOM_CHOICES, ...LAYOUT_PARTS[layout], layout, heading: 'gilda', text: 'castoro', headingStyle: caps ? 'caps' : 'typed' })}
        gradient={['#4A2C20', '#F5F1EC']}
        accent="#4A2C1E"
        backgroundImage={null}
        brandFont="italiana"
        name="Amara Lashes"
        logoUri={null}
        logoFraming={null}
        metaLabels={['LASHES', 'PECKHAM']}
        pillLabels={['LASHES', 'PECKHAM']}
        kicker="LASHES"
        location="Peckham"
        content={{ about: 'Soft lash sets.', categories: ['Lashes'], services: [{ name: 'Classic set', minutes: 120, price: 65 }] }}
        rating="5.0"
        // Services only list in the full preview (Info Reg's); Branding's shows outline cards.
        full
      />,
    );
    expect(StyleSheet.flatten(screen.getByText('Amara Lashes').props["style"]).fontFamily).toBe('Italiana_400Regular');
    const heading = screen.getByText(caps ? 'SERVICES' : 'Services');
    expect(StyleSheet.flatten(heading.props["style"]).fontFamily).toBe('GildaDisplay-Regular');
    expect(StyleSheet.flatten(screen.getByText('Soft lash sets.').props["style"]).fontFamily).toBe('Castoro-Regular');
    expect(StyleSheet.flatten(screen.getByText('Classic set').props["style"]).fontFamily).toBe('Castoro-Regular');
  });

  it.each(CUSTOM_PARTS.flatMap(part => part.options.map(option => [part.key, option.key] as const)))(
    'draws a Custom page with %s set to %s',
    (part, value) => {
      render(
        <ProfileStylePreview
          themeKey={encodeThemeKey('app', SHEET_BG, 'blend', 'rounded', 'custom', 'melt', withPart(DEFAULT_CUSTOM_CHOICES, part, value))}
          gradient={['#4A2C20', '#F5F1EC']}
          accent="#4A2C1E"
          backgroundImage={null}
          brandFont="italiana"
          name="Amara Lashes"
          logoUri={null}
          logoFraming={null}
          metaLabels={['LASHES', 'PECKHAM']}
          pillLabels={['LASHES', 'PECKHAM']}
          kicker="LASHES"
          location="Peckham"
          content={{ about: 'Soft lash sets.', categories: ['Lashes'], services: [{ name: 'Classic set', minutes: 120, price: 65 }] }}
          rating="5.0"
          full
        />,
      );
      expect(screen.getAllByText('Amara Lashes').length).toBeGreaterThan(0);
      expect(screen.getByText('Soft lash sets.')).toBeTruthy();
    },
  );

  it('outlines each part on Tap Your Page and says which one was tapped', () => {
    const onPress = jest.fn();
    render(
      <ProfileStylePreview
        themeKey={encodeThemeKey('app', SHEET_BG, 'blend', 'rounded', 'custom', 'melt', DEFAULT_CUSTOM_CHOICES)}
        gradient={['#4A2C20', '#F5F1EC']}
        accent="#4A2C1E"
        backgroundImage={null}
        brandFont="italiana"
        name="Amara Lashes"
        logoUri={null}
        logoFraming={null}
        metaLabels={['LASHES', 'PECKHAM']}
        pillLabels={['LASHES', 'PECKHAM']}
        kicker="LASHES"
        location="Peckham"
        rating="5.0"
        editParts={{ active: 'top', onPress, accent: '#4A2C1E' }}
      />,
    );
    for (const label of ['Top', 'Sections', 'Policies', 'Headings', 'Services']) {
      expect(screen.getByLabelText(`${label}. Tap to change`)).toBeTruthy();
    }
    fireEvent.press(screen.getByLabelText('Policies. Tap to change'));
    expect(onPress).toHaveBeenCalledWith('policies');
  });
});

describe('the portfolio and pinned bar, as on the profile', () => {
  const at = (label: string) => JSON.stringify(screen.toJSON()).indexOf(`"accessibilityLabel":"${label}"`);

  it('puts Posy\'s portfolio first, before About, as its "work first" page does', () => {
    renderPreview('posy');
    expect(at('Portfolio')).toBeGreaterThan(-1);
    expect(at('Portfolio')).toBeLessThan(at('About'));
  });

  it('keeps every other style\'s portfolio after Reviews', () => {
    renderPreview('pure');
    expect(at('Portfolio')).toBeGreaterThan(at('Reviews'));
  });

  it('shows grey photo shapes in Branding before any photo is uploaded, and none in a full preview', () => {
    renderPreview('posy');
    expect(screen.getAllByLabelText(/^Portfolio photo/).length).toBeGreaterThan(0);
    screen.unmount();
    renderPreview('posy', 'default', undefined, true);
    expect(screen.queryAllByLabelText(/^Portfolio photo/)).toHaveLength(0);
  });

  it('pins Riviera\'s Book bar with their lowest price', () => {
    renderPreview('riviera', 'default', {
      about: '',
      categories: ['Lashes'],
      services: [{ name: 'Full set', minutes: 120, price: 65 }, { name: 'Infill', minutes: 45, price: 40.5 }],
    });
    expect(screen.getByText('From £40.50')).toBeTruthy();
    screen.unmount();
    renderPreview('pure');
    expect(screen.queryByText(/^From £/)).toBeNull();
  });
});

describe('Poster, Hibiscus and Storefront in the full preview (owner, 2026-11-19)', () => {
  it.each(['poster', 'hibiscus', 'storefront'] as const)('draws %s with a hero photo, its services and their names', key => {
    render(
      <ProfileStylePreview
        themeKey={encodeThemeKey('app', SHEET_BG, 'blend', 'rounded', key)}
        gradient={['#410C20', '#6A1D36']}
        accent="#9B315F"
        backgroundImage={null}
        brandFont="default"
        name="Amara Lashes"
        logoUri={null}
        logoFraming={null}
        metaLabels={['LASHES']}
        pillLabels={['LASHES']}
        kicker="LASHES"
        location="Peckham"
        photoUris={['https://example.com/a.jpg']}
        content={{
          about: 'Soft lash sets.',
          categories: ['Lashes'],
          services: [{ name: 'Classic full set', minutes: 120, price: 65, imageUri: 'https://example.com/s.jpg' }],
        }}
        rating="5.0"
        full
      />,
    );
    expect(screen.getAllByLabelText('Amara Lashes').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/classic full set/i).length).toBeGreaterThan(0);
  });
});
