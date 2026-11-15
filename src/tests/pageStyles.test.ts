import {
  DEFAULT_PAGE_STYLE,
  romanNumeral,
  SECTION_NUMBERS,
  getPageStyle,
  headingPair,
  menuNumber,
  PAGE_SECTION_TITLES,
  PAGE_STYLES,
  type PageSectionKey,
} from '../constants/pageStyles';
import { encodeThemeKey, parseThemeKey, SHEET_BG } from '../constants/providerThemes';
import { sealLetter, waxColour } from '../features/providers/WaxSeal';
import {
  policiesBringOwnSurface,
  sectionsSitOnPage,
  serviceCardSurface,
  sheetInk,
} from '../features/providers/ProfilePageStyle';
import { kickerPhrase } from '../features/providers/ProfileHero';

describe('page style in the stored theme key', () => {
  it('reads keys saved before page styles existed as Classic', () => {
    expect(parseThemeKey('blush').pageStyle).toBe('classic');
    expect(parseThemeKey('blush|#F8ECF0|glow|square').pageStyle).toBe('classic');
    expect(parseThemeKey(null).pageStyle).toBe('classic');
  });

  it('round-trips a page style as the fifth part', () => {
    const key = encodeThemeKey('blush', '#F8ECF0', 'glow', 'square', 'arch');
    expect(key).toBe('blush|#F8ECF0|glow|square|arch');
    expect(parseThemeKey(key)).toEqual({
      base: 'blush', sheet: '#F8ECF0', finish: 'glow', shape: 'square', pageStyle: 'arch', policyLook: 'melt',
    });
  });

  it('writes every earlier part out so the style never shifts position', () => {
    expect(encodeThemeKey('app', undefined, undefined, undefined, 'spa')).toBe(`app|${SHEET_BG}|blend|rounded|spa`);
    expect(parseThemeKey(`app|${SHEET_BG}|blend|rounded|spa`).pageStyle).toBe('spa');
  });

  it('leaves Classic off the key, so older builds keep reading it unchanged', () => {
    expect(encodeThemeKey('app', SHEET_BG, 'blend', 'rounded', DEFAULT_PAGE_STYLE)).toBe('app');
    expect(encodeThemeKey('app', SHEET_BG, 'blend', 'square', 'classic')).toBe(`app|${SHEET_BG}|blend|square`);
  });

  it('falls back to Classic for a style it does not know', () => {
    expect(parseThemeKey('app|#F5F1EC|blend|rounded|neon').pageStyle).toBe('classic');
    expect(getPageStyle('neon').key).toBe('classic');
  });
});

describe('page styles', () => {
  it('has the sixteen picked styles plus Classic, each once', () => {
    expect(PAGE_STYLES.map(s => s.key)).toEqual([
      'classic', 'cover', 'arch', 'framed', 'scrapbook', 'spa', 'glossy',
      'editorial', 'heritage', 'duet', 'groovy', 'gallery', 'apothecary',
      'snapshot', 'signature', 'quiet', 'sealed',
    ]);
  });

  it('seals Sealed\'s envelope and policy notes with a first letter', () => {
    expect(sealLetter('Amara Okafor')).toBe('A');
    expect(sealLetter('  1st Class Lashes')).toBe('S');
    expect(sealLetter('Late arrival')).toBe('L');
    expect(sealLetter('123')).toBe('');
  });

  it('presses a pale accent darker so the wax reads as wax', () => {
    expect(waxColour('#3F1E36')).toBe('#3F1E36');
    expect(waxColour('#F4D6DC')).not.toBe('#F4D6DC');
  });

  it('gives every style but Classic and Glossy a hero of its own', () => {
    const heroes = PAGE_STYLES.filter(s => s.key !== 'classic' && s.key !== 'glossy').map(s => s.hero);
    expect(new Set(heroes).size).toBe(heroes.length);
  });

  it('gives each of the 2026-11-14 styles a hero and heading of its own', () => {
    const added = ['editorial', 'heritage', 'duet', 'groovy', 'gallery', 'apothecary'].map(getPageStyle);
    expect(new Set(added.map(s => s.hero)).size).toBe(6);
    expect(new Set(added.map(s => s.heading)).size).toBe(6);
  });

  it('keeps Classic exactly as the profile always was', () => {
    const classic = getPageStyle('classic');
    expect(classic).toMatchObject({
      heading: 'plain', cards: 'frosted', policies: 'rows', logo: 'circle', hero: 'stacked', aboutInHero: false,
      heroPills: false, jumpBar: false, separateAboutAndPolicies: false, numberedServices: false,
    });
    expect(serviceCardSurface(classic, { card: '#FFFFFF', accent: '#8A6438', sheet: SHEET_BG })).toBeNull();
  });

  it('gives every section a two-part heading', () => {
    (Object.keys(PAGE_SECTION_TITLES) as PageSectionKey[]).forEach(section => {
      const [lead, rest] = headingPair(section);
      expect(lead.length).toBeGreaterThan(0);
      expect(rest.length).toBeGreaterThan(0);
    });
  });

  it('numbers the Spa menu with two digits', () => {
    expect(menuNumber(0)).toBe('01');
    expect(menuNumber(9)).toBe('10');
  });

  it('draws card-less styles straight on the page, in the page\'s ink', () => {
    expect(sectionsSitOnPage(getPageStyle('cover'))).toBe(true);
    expect(sectionsSitOnPage(getPageStyle('spa'))).toBe(true);
    expect(sectionsSitOnPage(getPageStyle('framed'))).toBe(true);
    expect(sectionsSitOnPage(getPageStyle('arch'))).toBe(false);
    expect(sheetInk('#F5F1EC').text).toBe('#26201E');
    expect(sheetInk('#1E1613').text).toBe('#F2EDEA');
    const cover = serviceCardSurface(getPageStyle('cover'), { card: '#FFFFFF', accent: '#8A6438', sheet: SHEET_BG });
    expect(cover?.backgroundColor).toBe('transparent');
  });

  it('drops the policy card only for layouts that bring their own tiles', () => {
    expect(policiesBringOwnSurface(getPageStyle('cover'))).toBe(true);
    expect(policiesBringOwnSurface(getPageStyle('arch'))).toBe(true);
    expect(policiesBringOwnSurface(getPageStyle('glossy'))).toBe(true);
    expect(policiesBringOwnSurface(getPageStyle('scrapbook'))).toBe(true);
    expect(policiesBringOwnSurface(getPageStyle('framed'))).toBe(false);
    expect(policiesBringOwnSurface(getPageStyle('spa'))).toBe(false);
  });
});

describe('policy picture look in the stored theme key', () => {
  it('defaults to Melt in, including for keys saved before it existed', () => {
    expect(parseThemeKey('blush|#F8ECF0|glow|square|arch').policyLook).toBe('melt');
    expect(parseThemeKey(null).policyLook).toBe('melt');
  });

  it('round-trips Bleed as the sixth part, writing every earlier part out', () => {
    const key = encodeThemeKey('app', undefined, undefined, undefined, undefined, 'bleed');
    expect(key).toBe(`app|${SHEET_BG}|blend|rounded|classic|bleed`);
    expect(parseThemeKey(key)).toMatchObject({ pageStyle: 'classic', policyLook: 'bleed' });
  });
});

describe('two-part headings say what the section is', () => {
  it('calls the reviews and portfolio sections by name', () => {
    expect(headingPair('reviews')).toEqual(['Client', 'Reviews']);
    expect(headingPair('portfolio')).toEqual(['My', 'Portfolio']);
  });
});

describe('the services heading', () => {
  it('says "The Services", not "The Menu"', () => {
    expect(headingPair('services')).toEqual(['The', 'Services']);
  });
});

describe('the 2026-11-14 styles', () => {
  const colours = { card: '#FFFFFF', accent: '#8A6438', sheet: SHEET_BG };

  it('draws Editorial and Heritage straight on the page, the rest on their own cards', () => {
    expect(sectionsSitOnPage(getPageStyle('editorial'))).toBe(true);
    expect(sectionsSitOnPage(getPageStyle('heritage'))).toBe(true);
    expect(sectionsSitOnPage(getPageStyle('duet'))).toBe(false);
    expect(sectionsSitOnPage(getPageStyle('apothecary'))).toBe(false);
  });

  it('lets Duet and Groovy service cards show their hard shadow', () => {
    for (const key of ['duet', 'groovy']) {
      const surface = serviceCardSurface(getPageStyle(key), colours);
      expect(surface).toMatchObject({ shadowRadius: 0, shadowOpacity: 1, overflow: 'visible' });
    }
    expect(serviceCardSurface(getPageStyle('apothecary'), colours)).toMatchObject({ borderRadius: 0, borderWidth: 1 });
  });

  it('drops the policy card for the tiled layouts only', () => {
    expect(policiesBringOwnSurface(getPageStyle('editorial'))).toBe(true);
    expect(policiesBringOwnSurface(getPageStyle('duet'))).toBe(true);
    expect(policiesBringOwnSurface(getPageStyle('groovy'))).toBe(true);
    expect(policiesBringOwnSurface(getPageStyle('heritage'))).toBe(false);
    expect(policiesBringOwnSurface(getPageStyle('gallery'))).toBe(false);
    expect(policiesBringOwnSurface(getPageStyle('apothecary'))).toBe(false);
  });

  it('numbers Heritage\'s rules in capitals and Apothecary\'s in lower case', () => {
    expect(romanNumeral(0)).toBe('I');
    expect(romanNumeral(3)).toBe('IV');
    expect(romanNumeral(1, true)).toBe('ii.');
    expect(getPageStyle('apothecary').numeralsLower).toBe(true);
    expect(getPageStyle('heritage').numeralsLower).toBeFalsy();
  });

  it('gives Gallery\'s sections a plain serif title with nothing above it', () => {
    expect(getPageStyle('gallery').heading).toBe('serifTitle');
  });

  it('only puts Editorial\'s About on a band', () => {
    expect(PAGE_STYLES.filter(s => s.aboutOnBand).map(s => s.key)).toEqual(['editorial']);
  });


  it('turns what they do into a phrase', () => {
    expect(kickerPhrase('LASHES')).toBe('Lashes');
    expect(kickerPhrase('BRAIDS · LOCS')).toBe('Braids & locs');
    expect(kickerPhrase('FACIALS · MASSAGE · BROWS')).toBe('Facials, massage & brows');
    expect(kickerPhrase('')).toBe('');
  });
});

describe('the 2026-11-15 heroes', () => {
  it('gives Heritage, Groovy and Apothecary a plain round logo, and keeps Duet\'s About as its own section', () => {
    expect(getPageStyle('heritage').logo).toBe('circle');
    expect(getPageStyle('groovy').logo).toBe('circle');
    expect(getPageStyle('apothecary').logo).toBe('circle');
    expect(getPageStyle('duet').aboutInHero).toBe(false);
  });
});

describe('Signature', () => {
  it('numbers its sections in the order the profile shows them', () => {
    expect(getPageStyle('signature').heading).toBe('indexed');
    expect(SECTION_NUMBERS.about).toBe('01');
    expect(SECTION_NUMBERS.services).toBe('03');
    expect(new Set(Object.values(SECTION_NUMBERS)).size).toBe(Object.keys(SECTION_NUMBERS).length);
  });

  it('puts a heavy rule along the top of its square service cards', () => {
    expect(serviceCardSurface(getPageStyle('signature'), { card: '#FFFFFF', accent: '#8A6438', sheet: SHEET_BG }))
      .toMatchObject({ borderRadius: 0, borderTopWidth: 3 });
  });
});

describe('Snapshot', () => {
  it('is the bold one: condensed headings, square outlined cards and a square logo', () => {
    const snapshot = getPageStyle('snapshot');
    expect(snapshot).toMatchObject({ hero: 'blockName', heading: 'condensed', cards: 'block', logo: 'square', numberedServices: true });
    expect(serviceCardSurface(snapshot, { card: '#FFFFFF', accent: '#D43F2B', sheet: SHEET_BG }))
      .toMatchObject({ borderRadius: 0, borderWidth: 2 });
  });
});
