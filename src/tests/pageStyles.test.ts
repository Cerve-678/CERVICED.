import {
  DEFAULT_PAGE_STYLE,
  getPageStyle,
  headingPair,
  menuNumber,
  PAGE_SECTION_TITLES,
  PAGE_STYLES,
  type PageSectionKey,
} from '../constants/pageStyles';
import { encodeThemeKey, parseThemeKey, SHEET_BG } from '../constants/providerThemes';
import {
  policiesBringOwnSurface,
  sectionsSitOnPage,
  serviceCardSurface,
  sheetInk,
} from '../features/providers/ProfilePageStyle';

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
  it('has the six picked styles plus Classic, each once', () => {
    expect(PAGE_STYLES.map(s => s.key)).toEqual(['classic', 'cover', 'arch', 'framed', 'scrapbook', 'spa', 'glossy']);
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
