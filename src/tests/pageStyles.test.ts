import { DEFAULT_CUSTOM_CHOICES } from '../constants/customPageStyle';
import {
  DEFAULT_PAGE_STYLE,
  romanNumeral,
  SECTION_NUMBERS,
  getPageStyle,
  headingPair,
  heroPhotoPickLimit,
  HUSH_TITLES,
  isPageStyleKey,
  menuNumber,
  PAGE_SECTION_TITLES,
  PAGE_STYLES,
  POLICY_PICTURE_LOOKS,
  policyPicturePlacement,
  type PageSectionKey,
} from '../constants/pageStyles';
import { encodeThemeKey, isDarkColor, parseThemeKey, SHEET_BG } from '../constants/providerThemes';
import { stripeColours } from '../features/providers/heroes/demureOrnaments';
import { neonWallColour } from '../features/providers/heroes/NeonHero';
import {
  policiesBringOwnSurface,
  sectionsSitOnPage,
  serviceCardSurface,
  sheetInk,
  showsDividerAbove,
  STRIPE_TINT,
  capsuleServiceSurface,
  servicesSitOnPage,
  pourPalette,
  type PageStylePalette,
} from '../features/providers/ProfilePageStyle';
import { LATTE_POUR, latteBand, latteGlass, latteInk, latteShade, latteStops } from '../features/providers/heroes/LatteHero';
import { moodboardName, moodboardPhotoAspect, moodboardPrint, moodboardTag } from '../features/providers/heroes/MoodboardHero';
import { heroPhotoSlotAspect } from '../constants/pageStyles';
import { capsuleTones } from '../features/providers/heroes/CapsuleHero';
import { heroIsDarkForStyle, heroNameFontStyle, heroUsesBrandFont, kickerPhrase, pickedNameFont } from '../features/providers/ProfileHero';

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
      base: 'blush', sheet: '#F8ECF0', finish: 'glow', shape: 'square', pageStyle: 'arch', policyLook: 'melt', custom: DEFAULT_CUSTOM_CHOICES,
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
    expect(parseThemeKey('app|#F5F1EC|blend|rounded|disco').pageStyle).toBe('classic');
    expect(getPageStyle('disco').key).toBe('classic');
  });
});

describe('page styles', () => {
  it('has every fixed style once', () => {
    expect(PAGE_STYLES.map(s => s.key)).toEqual([
      'classic', 'cover', 'arch', 'framed', 'scrapbook', 'spa', 'glossy',
      'editorial', 'heritage', 'duet', 'groovy', 'gallery', 'apothecary',
      'snapshot', 'signature', 'quiet', 'sheer', 'embossed', 'callingCard', 'boutique', 'gazette', 'novel',
      'studio', 'lounge', 'softFocus', 'hush', 'stripes', 'bow',
      'pure', 'grid', 'slate', 'halo',
      'posy', 'riviera', 'noir', 'muse', 'retreat', 'bonbon', 'ledger',
      'pinboard', 'poster', 'hibiscus', 'storefront', 'orbit', 'typeblock', 'filmstrip', 'portfolio', 'atelier', 'neon', 'capsule', 'moodboard', 'latte',
    ]);
  });

  it('gives Portfolio its own cover and quiet work gallery', () => {
    const portfolio = getPageStyle('portfolio');
    expect(portfolio.hero).toBe('portfolioFront');
    expect(portfolio.photoLayout).toBe('portfolioWall');
    expect(portfolio.portfolioFirst).toBe(true);
    expect(portfolio.heroNameFont?.fontFamily).toBe('GildaDisplay-Regular');
    expect(heroPhotoPickLimit(portfolio)).toBe(1);
  });

  it('keeps Atelier type led without a script face', () => {
    const atelier = getPageStyle('atelier');
    expect(atelier.hero).toBe('atelierLetterhead');
    expect(atelier.custom?.headingFont).toBe('Bellefair-Regular');
    expect(atelier.portfolioFirst).toBeFalsy();
  });

  it('carries Pinboard from the hero through cards, services and photo pins', () => {
    expect(getPageStyle('pinboard')).toMatchObject({
      hero: 'pinboardHeader', heading: 'custom', cards: 'soft', policies: 'softTiles',
      serviceLayout: 'tiles', photoLayout: 'pins', portfolioFirst: true, nameFontPickable: true,
    });
    // Up to three of their photos as the board at the top.
    expect(heroPhotoPickLimit(getPageStyle('pinboard'))).toBe(3);
  });

  it('presses Embossed into the page: raised cards, a recessed policy panel, photos in plate marks', () => {
    const embossed = getPageStyle('embossed');
    expect(embossed).toMatchObject({ heading: 'embossCaps', cards: 'raised', policies: 'recessed', hero: 'pressed', plateMarkPhotos: true });
    expect(policiesBringOwnSurface(embossed)).toBe(true);
    expect(sectionsSitOnPage(embossed)).toBe(false);
    expect(serviceCardSurface(embossed, { card: '#FFFFFF', accent: '#8A6438', sheet: SHEET_BG })).toMatchObject({ borderRadius: 3, borderWidth: 1 });
  });

  it('gives every style but Classic and Glossy a hero of its own', () => {
    // A style built from Custom's parts may reuse a top, but only lettered in
    // its own face (heroNameFont), so no two tops look the same.
    const heroes = PAGE_STYLES.filter(s => s.key !== 'classic' && s.key !== 'glossy')
      .map(s => `${s.hero}:${s.heroNameFont?.fontFamily ?? ''}`);
    expect(new Set(heroes).size).toBe(heroes.length);
  });

  it('gives each of the 2026-11-14 styles a hero and heading of its own', () => {
    const added = ['editorial', 'heritage', 'duet', 'groovy', 'gallery', 'apothecary'].map(key => getPageStyle(key));
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

  it('offers story circles and two subtle choices alongside the full-size ones', () => {
    expect(POLICY_PICTURE_LOOKS.map(look => look.key)).toEqual([
      'melt', 'bleed', 'framed', 'swipe', 'fan', 'peek', 'story', 'thumbs', 'button',
    ]);
  });

  it('round-trips the subtle choices', () => {
    for (const look of ['framed', 'swipe', 'fan', 'peek', 'story', 'thumbs', 'button'] as const) {
      const key = encodeThemeKey('app', undefined, undefined, undefined, 'studio', look);
      expect(parseThemeKey(key)).toMatchObject({ pageStyle: 'studio', policyLook: look });
    }
  });

  it('puts Story at the top and every other choice after the services', () => {
    expect(policyPicturePlacement('story')).toBe('top');
    for (const look of POLICY_PICTURE_LOOKS.filter(l => l.key !== 'story')) {
      expect(policyPicturePlacement(look.key)).toBe('afterServices');
    }
  });
});

describe('two-part headings say what the section is', () => {
  it('calls the reviews and portfolio sections by name', () => {
    expect(headingPair('reviews')).toEqual(['Client', 'Reviews']);
    expect(headingPair('portfolio')).toEqual(['My', 'Portfolio']);
  });
});

describe('the About heading', () => {
  it('says About, or Meet the Provider, in the styles that asked for it, and Meet the Artist elsewhere', () => {
    (['sheer', 'signature', 'snapshot', 'softFocus', 'bow'] as const).forEach(style => {
      expect(headingPair('about', style).filter(Boolean).join(' ')).toBe('About');
    });
    expect(headingPair('about', 'quiet')).toEqual(['Meet', 'the Provider']);
    expect(headingPair('about', 'boutique')).toEqual(['Meet', 'the Provider']);
    expect(headingPair('about', 'arch')).toEqual(['Meet', 'the Artist']);
    expect(headingPair('services', 'sheer')).toEqual(['The', 'Services']);
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

describe('Calling Card', () => {
  const callingCard = getPageStyle('callingCard');

  it('is satin and a clipped card: its own hero, engraved headings, clipped cards, ribbon policies', () => {
    expect(callingCard).toMatchObject({
      hero: 'callingCard', heading: 'engravedCaps', cards: 'clipped', policies: 'ribbon', clippedPhotos: true,
    });
  });

  it('draws its service cards near-square on a soft shadow, and its policies on a card of their own', () => {
    expect(serviceCardSurface(callingCard, { card: '#FFFFFF', accent: '#6E1220', sheet: SHEET_BG }))
      .toMatchObject({ borderRadius: 2, overflow: 'visible' });
    expect(policiesBringOwnSurface(callingCard)).toBe(true);
    expect(sectionsSitOnPage(callingCard)).toBe(false);
  });

  it('is the only style with clipped photos', () => {
    expect(PAGE_STYLES.filter(s => s.clippedPhotos).map(s => s.key)).toEqual(['callingCard']);
  });
});

describe('the demure set (Lounge, Soft Focus, Hush, Stripes, Bow)', () => {
  const keys = ['lounge', 'softFocus', 'hush', 'stripes', 'bow'] as const;
  const styles = keys.map(key => getPageStyle(key));
  const colours = { card: '#FFFFFF', accent: '#A58CCB', sheet: SHEET_BG };

  it('gives each a hero and a heading of its own', () => {
    expect(styles.map(s => s.key)).toEqual(keys);
    expect(new Set(styles.map(s => s.hero)).size).toBe(5);
    expect(new Set(styles.map(s => s.heading)).size).toBe(5);
  });

  it('lets every style with a photo in its hero pick it', () => {
    expect(PAGE_STYLES.filter(s => heroPhotoPickLimit(s) > 0).map(s => s.key)).toEqual(['editorial', 'snapshot', 'hush', 'bow', 'posy', 'retreat', 'pinboard', 'poster', 'hibiscus', 'storefront', 'filmstrip', 'portfolio', 'capsule', 'moodboard']);
    expect(heroPhotoPickLimit(getPageStyle('editorial'))).toBe(1);
    expect(heroPhotoPickLimit(getPageStyle('snapshot'))).toBe(3);
    expect(heroPhotoPickLimit(getPageStyle('hush'))).toBe(3);
    expect(heroPhotoPickLimit(getPageStyle('bow'))).toBe(1);
    expect(heroPhotoPickLimit(getPageStyle('stripes'))).toBe(0);
    expect(heroPhotoPickLimit(getPageStyle('lounge'))).toBe(0);
  });

  it('gives Stripes outlined service boxes in a deeper shade of the accent', () => {
    const line = stripeColours(colours.accent).line;
    expect(serviceCardSurface(getPageStyle('stripes'), colours)).toMatchObject({ borderWidth: 1, borderColor: line, borderRadius: 16 });
    expect(isDarkColor(line)).toBe(true);
  });

  it('takes turns down Stripes\' page, plain then tinted, in the order the profile draws its sections', () => {
    // ProviderPageSheet's order. Services and Portfolio never sit on a strip.
    const order = ['about', 'policies', 'services', 'reviews', 'contact', 'hours', 'portfolio', 'info'] as const;
    expect(order.map(key => STRIPE_TINT[key])).toEqual([null, 'soft', null, 'soft', null, 'soft', null, 'soft']);
    // The stronger shade is the hero's alone.
    expect(Object.values(STRIPE_TINT)).not.toContain('strong');
  });

  it('no longer knows Pearl (renamed Stripes before anyone used it)', () => {
    expect(isPageStyleKey('pearl')).toBe(false);
    expect(getPageStyle('pearl').key).toBe('classic');
  });

  it('outlines Lounge\'s cards in ink with big round corners, and puts its policies on the page', () => {
    expect(serviceCardSurface(getPageStyle('lounge'), colours)).toMatchObject({ borderWidth: 1, borderColor: '#1F1A1C', borderRadius: 24 });
    expect(policiesBringOwnSurface(getPageStyle('lounge'))).toBe(true);
    expect(getPageStyle('lounge').jumpBar).toBe(true);
    expect(getPageStyle('lounge').jumpBarRuled).toBe(true);
    expect(PAGE_STYLES.filter(s => s.jumpBarRuled).map(s => s.key)).toEqual(['lounge']);
  });

  it('keeps Soft Focus and Stripes policies inside their section box, and Bow\'s on its ribbon card', () => {
    expect(policiesBringOwnSurface(getPageStyle('softFocus'))).toBe(false);
    expect(policiesBringOwnSurface(getPageStyle('stripes'))).toBe(false);
    expect(policiesBringOwnSurface(getPageStyle('bow'))).toBe(true);
  });

  it('draws Hush straight on the page and the rest on cards', () => {
    expect(sectionsSitOnPage(getPageStyle('hush'))).toBe(true);
    expect(styles.filter(s => s.key !== 'hush').every(s => !sectionsSitOnPage(s))).toBe(true);
  });

  it('gives Hush a quiet word for every section', () => {
    (Object.keys(PAGE_SECTION_TITLES) as PageSectionKey[]).forEach(section => {
      expect(HUSH_TITLES[section].length).toBeGreaterThan(0);
      expect(HUSH_TITLES[section]).toBe(HUSH_TITLES[section].toLowerCase().replace('i love', 'I love'));
    });
  });

  it('round-trips each in the stored theme key', () => {
    keys.forEach(key => {
      expect(parseThemeKey(encodeThemeKey('app', SHEET_BG, 'blend', 'rounded', key)).pageStyle).toBe(key);
    });
  });
});

describe('which styles show the picked name font', () => {
  it('is the styles whose hero draws the name in it, and those that let it replace their own lettering', () => {
    expect(PAGE_STYLES.filter(heroUsesBrandFont).map(s => s.key).sort()).toEqual([
      'classic', 'cover', 'arch', 'framed', 'scrapbook', 'spa', 'glossy',
      'slate', 'halo',
      'noir', 'muse', 'ledger', 'hush', 'quiet', 'signature', 'pinboard',
      'poster', 'hibiscus', 'storefront',
      'orbit', 'typeblock', 'filmstrip',
      'neon', 'moodboard',
    ].sort());
  });

  it('leaves the font off the rest of the demure set, which letters the name itself', () => {
    ['lounge', 'softFocus', 'stripes', 'bow'].forEach(key => {
      expect(heroUsesBrandFont(getPageStyle(key))).toBe(false);
    });
  });
});

describe('the styles built from Custom\'s parts', () => {
  it('gives Posy its split top, soft round cards, tiles, arched photos, wave lines and gingham', () => {
    const posy = getPageStyle('posy');
    expect(posy.key).toBe('posy');
    expect(posy).toMatchObject({
      hero: 'split', cards: 'soft', policies: 'softTiles', heading: 'custom',
      serviceLayout: 'tiles', photoLayout: 'arches', divider: 'wave', pagePattern: 'gingham', portfolioFirst: true,
    });
    expect(posy.custom).toMatchObject({ headingFont: 'YoungSerif-Regular', textFont: 'Figtree-SemiBold', headingStyle: 'script', scriptFont: 'Ephesis-Regular' });
    // Its own fonts, not the Branding name font.
    expect(heroUsesBrandFont(posy)).toBe(false);
  });

  it('lets Posy pick the photo for its left half', () => {
    expect(heroPhotoPickLimit(getPageStyle('posy'))).toBe(1);
  });

  it('draws the divider above every section but the one that opens the page', () => {
    const posy = getPageStyle('posy');
    // Work first: the portfolio opens the page, so About gets the line and the portfolio doesn't.
    expect(showsDividerAbove(posy, 'portfolio')).toBe(false);
    expect(showsDividerAbove(posy, 'about')).toBe(true);
    expect(showsDividerAbove(posy, 'policies')).toBe(true);
    const plain = { ...posy, portfolioFirst: false };
    expect(showsDividerAbove(plain, 'about')).toBe(false);
    expect(showsDividerAbove(plain, 'portfolio')).toBe(true);
    // No divider set, none drawn.
    expect(showsDividerAbove(getPageStyle('pure'), 'policies')).toBe(false);
  });

  it('round-trips in the stored theme key', () => {
    expect(parseThemeKey(encodeThemeKey('app', SHEET_BG, 'blend', 'rounded', 'posy')).pageStyle).toBe('posy');
  });
});

describe('Riviera', () => {
  const riviera = getPageStyle('riviera');
  const colours = { card: '#FFFFFF', accent: '#8A6438', sheet: SHEET_BG };

  it('has its colour block top, open stripes, photo cards, polaroids and the pinned Book bar', () => {
    expect(riviera).toMatchObject({
      hero: 'colourBlock', cards: 'stripes', openStrips: true, policies: 'gentleNotes', heading: 'custom',
      serviceLayout: 'photoCards', photoLayout: 'polaroids', pinnedBookBar: true,
    });
    expect(riviera.custom).toMatchObject({ headingFont: 'Jost-Light', headingStyle: 'caps' });
    expect(heroUsesBrandFont(riviera)).toBe(false);
  });

  it('sets its content straight on the strips, and its services on plain solid cards', () => {
    expect(sectionsSitOnPage(riviera)).toBe(true);
    expect(sectionsSitOnPage(getPageStyle('stripes'))).toBe(false);
    expect(serviceCardSurface(riviera, colours)).toMatchObject({ backgroundColor: colours.card, borderWidth: 0, borderRadius: 18 });
  });

  it('has no photo to pick in its top', () => {
    expect(heroPhotoPickLimit(riviera)).toBe(0);
  });
});

describe('Noir', () => {
  const noir = getPageStyle('noir');

  it('has its photo cover in Gloock, outlined boxes, a sideways portfolio and square Book buttons, with no pinned Book bar', () => {
    expect(noir).toMatchObject({
      hero: 'cover', cards: 'outline', policies: 'accordion', numberedServices: true,
      photoLayout: 'swipe', divider: 'line', buttonShape: 'square', portfolioFirst: true,
    });
    expect(noir.pinnedBookBar).toBeFalsy();
    expect(noir.heroNameFont).toEqual({ fontFamily: 'Gloock-Regular' });
    expect(noir.custom).toMatchObject({ headingFont: 'Gloock-Regular', textFont: 'HankenGrotesk-Medium', headingStyle: 'underlined' });
  });

  it('letters the name in its own face until they pick a Business Name Font', () => {
    expect(heroUsesBrandFont(noir)).toBe(true);
    expect(pickedNameFont(noir, 'default')).toBeNull();
    // Cover itself still uses the Branding name font.
    expect(heroUsesBrandFont(getPageStyle('cover'))).toBe(true);
  });

  it('sizes its own name face from the hero size', () => {
    expect(heroNameFontStyle({ fontFamily: 'Gloock-Regular' }, 40)).toEqual({ fontFamily: 'Gloock-Regular', fontSize: 40, lineHeight: 54 });
    expect(heroNameFontStyle({ fontFamily: 'X', scale: 0.8, transform: 'uppercase', letterSpacing: 2 }, 40))
      .toEqual({ fontFamily: 'X', fontSize: 32, lineHeight: 43, textTransform: 'uppercase', letterSpacing: 2 });
  });
});

describe('Muse', () => {
  const muse = getPageStyle('muse');

  it('has its big name in Italiana, an Italianno script word, a printed menu, swiping photos, stars and text-link Book', () => {
    expect(muse).toMatchObject({
      hero: 'customBig', cards: 'paper', policies: 'gentleNotes',
      serviceLayout: 'menu', photoLayout: 'swipe', divider: 'stars', buttonShape: 'textLink',
    });
    expect(muse.heroNameFont?.fontFamily).toBe('Italiana_400Regular');
    expect(muse.custom).toMatchObject({ headingFont: 'Bellefair-Regular', textFont: 'Bellefair-Regular', headingStyle: 'script', scriptFont: 'Italianno-Regular' });
    expect(heroUsesBrandFont(muse)).toBe(true);
  });

  it('opens on its About, so the stars sit above every section after it', () => {
    expect(showsDividerAbove(muse, 'about')).toBe(false);
    expect(showsDividerAbove(muse, 'portfolio')).toBe(true);
  });
});

describe('Retreat', () => {
  const retreat = getPageStyle('retreat');

  it('has its arched photo window, open sections, dots, outline buttons and a soft glow', () => {
    expect(retreat).toMatchObject({
      hero: 'archWindow', cards: 'open', policies: 'hairline',
      divider: 'dots', buttonShape: 'outline', pagePattern: 'glow',
    });
    expect(retreat.custom).toMatchObject({ headingFont: 'Marcellus-Regular', textFont: 'DidactGothic-Regular', headingStyle: 'typed', centred: true });
    expect(heroUsesBrandFont(retreat)).toBe(false);
    expect(sectionsSitOnPage(retreat)).toBe(true);
  });

  it('lets Retreat pick the photo in its window', () => {
    expect(heroPhotoPickLimit(retreat)).toBe(1);
  });
});

describe('Bonbon', () => {
  const bonbon = getPageStyle('bonbon');

  it('has its centred top in Sniglet, soft cards, tiles, polaroids, a wave and a plain page', () => {
    expect(bonbon).toMatchObject({
      hero: 'stacked', cards: 'soft', policies: 'softTiles',
      serviceLayout: 'tiles', photoLayout: 'polaroids', divider: 'wave',
    });
    expect(bonbon.pagePattern).toBeUndefined();
    expect(bonbon.heroNameFont?.fontFamily).toBe('Sniglet_800ExtraBold');
    expect(bonbon.custom).toMatchObject({ headingFont: 'Fredoka_600SemiBold', textFont: 'VarelaRound_400Regular', headingStyle: 'typed' });
    expect(heroUsesBrandFont(bonbon)).toBe(false);
    expect(heroPhotoPickLimit(bonbon)).toBe(0);
  });
});

describe('Ledger', () => {
  const ledger = getPageStyle('ledger');

  it('has its engraved capitals, paper cards, a printed menu, a feature grid, square buttons and a ruled page', () => {
    expect(ledger).toMatchObject({
      hero: 'stacked', cards: 'paper', policies: 'hairline',
      serviceLayout: 'menu', photoLayout: 'feature', divider: 'line', buttonShape: 'square', pagePattern: 'lined',
    });
    expect(ledger.heroNameFont).toMatchObject({ fontFamily: 'LibreCaslonDisplay-Regular', transform: 'uppercase' });
    expect(ledger.custom).toMatchObject({ headingFont: 'Oswald-Medium', textFont: 'OldStandardTT-Regular', headingStyle: 'caps' });
    expect(heroUsesBrandFont(ledger)).toBe(true);
  });

  it('gives each of the seven parts styles a different mix of parts', () => {
    const keys = ['posy', 'riviera', 'noir', 'muse', 'retreat', 'bonbon', 'ledger'];
    const mixes = keys.map(key => {
      const s = getPageStyle(key);
      return [s.hero, s.heroNameFont?.fontFamily, s.cards, s.custom?.headingStyle, s.serviceLayout, s.photoLayout, s.divider, s.buttonShape, s.pagePattern].join('|');
    });
    expect(new Set(mixes).size).toBe(keys.length);
    // Each has its own pair of heading and text fonts.
    expect(new Set(keys.map(key => `${getPageStyle(key).custom?.headingFont}/${getPageStyle(key).custom?.textFont}`)).size).toBe(keys.length);
  });
});

describe('the picked name font on styles with their own lettering (owner, 2026-11-19)', () => {
  const keys = ['noir', 'muse', 'ledger', 'hush', 'quiet', 'signature', 'pinboard', 'poster', 'hibiscus', 'storefront', 'orbit', 'typeblock', 'filmstrip', 'neon', 'moodboard'] as const;

  it('opens the Business Name Font on Noir, Muse, Ledger, Hush, Quiet, Signature and Pinboard', () => {
    for (const key of keys) expect(heroUsesBrandFont(getPageStyle(key))).toBe(true);
    expect(PAGE_STYLES.filter(style => style.nameFontPickable).map(style => style.key).sort()).toEqual([...keys].sort());
  });

  it('keeps the style\'s own lettering on Classic, and uses any other picked font', () => {
    expect(pickedNameFont(getPageStyle('noir'), 'default')).toBeNull();
    expect(pickedNameFont(getPageStyle('noir'), 'syne')).toBe('syne');
    // A style without the switch never swaps its lettering.
    expect(pickedNameFont(getPageStyle('bonbon'), 'syne')).toBeNull();
  });

  it('keeps Ledger\'s capitals and spacing in the picked font', () => {
    const ledger = getPageStyle('ledger');
    const style = heroNameFontStyle(ledger.heroNameFont!, 30, pickedNameFont(ledger, 'syne'));
    expect(style).toMatchObject({ fontFamily: 'Syne_700Bold', textTransform: 'uppercase', letterSpacing: 2 });
  });
});

describe('Poster, Hibiscus and Storefront (owner, 2026-11-19: "create something new", from three reference boards)', () => {
  const NEW = ['poster', 'hibiscus', 'storefront'] as const;
  const others = PAGE_STYLES.filter(style => !(NEW as readonly string[]).includes(style.key));

  it('draws each one with a top, heading and services no other style uses', () => {
    for (const key of NEW) {
      const style = getPageStyle(key);
      for (const other of others) {
        expect(other.hero).not.toBe(style.hero);
        expect(other.heading).not.toBe(style.heading);
        expect(other.serviceLayout).not.toBe(style.serviceLayout);
      }
      expect(heroPhotoPickLimit(style)).toBe(1);
    }
  });

  // Owner, 2026-11-20: Storefront's banner and Hibiscus's phone weren't liked;
  // both now share a portfolio another style already has, and so does Retreat.
  it('shows Storefront and Retreat in arches, and Hibiscus as a swipe row', () => {
    expect(getPageStyle('storefront').photoLayout).toBe('arches');
    expect(getPageStyle('retreat').photoLayout).toBe('arches');
    expect(getPageStyle('hibiscus').photoLayout).toBe('swipe');
  });

  it('has its own divider and Book buttons where the boards had them', () => {
    expect(getPageStyle('poster').divider).toBe('sparkles');
    expect(getPageStyle('hibiscus').buttonShape).toBe('arrowPill');
    expect(getPageStyle('storefront').buttonShape).toBe('shopBox');
    for (const other of others) {
      expect(other.divider).not.toBe('sparkles');
      expect(['arrowPill', 'shopBox']).not.toContain(other.buttonShape);
    }
  });
});

describe('Neon', () => {
  const neon = getPageStyle('neon');

  it('hangs a lit sign on a dark wall, with its own headings, cards and Book button', () => {
    expect(neon.hero).toBe('neonSign');
    expect(neon.heading).toBe('neonScript');
    expect(neon.cards).toBe('lit');
    expect(neon.buttonShape).toBe('glowPill');
    for (const other of PAGE_STYLES.filter(s => s.key !== 'neon')) {
      expect(other.hero).not.toBe('neonSign');
      expect(other.heading).not.toBe('neonScript');
      expect(other.cards).not.toBe('lit');
      expect(other.buttonShape).not.toBe('glowPill');
    }
  });

  it('inks the top white whatever the theme, because the wall is dark', () => {
    expect(heroIsDarkForStyle(neon)).toBe(true);
    expect(heroPhotoPickLimit(neon)).toBe(0);
  });

  it('builds the wall from their colour but always keeps it night-dark', () => {
    for (const colour of ['#FFFFFF', '#F7E1E6', '#AF9197', '#3F1E36', '#FFD700']) {
      expect(isDarkColor(neonWallColour(colour))).toBe(true);
    }
    expect(neonWallColour('#F7E1E6')).not.toBe(neonWallColour('#E5ECF4'));
  });

  it('lets them letter the sign in their Business Name Font', () => {
    expect(neon.nameFontPickable).toBe(true);
    expect(pickedNameFont(neon, 'default')).toBeNull();
  });

  it('glows its cards only on a dark page', () => {
    const dark = serviceCardSurface(neon, { card: '#1C121B', accent: '#FF4F9A', sheet: '#140D14' });
    const light = serviceCardSurface(neon, { card: '#FFFFFF', accent: '#FF4F9A', sheet: SHEET_BG });
    expect(dark?.shadowOpacity).toBeGreaterThan(0);
    expect(light?.shadowOpacity).toBe(0);
    expect(light?.borderColor).toBe('#FF4F9A');
  });
});

describe('Capsule', () => {
  const capsule = getPageStyle('capsule');

  it('draws the page in pills, with its own top, headings, cards, photos and Book shape', () => {
    expect(capsule.hero).toBe('tallCapsule');
    expect(capsule.heading).toBe('pillMark');
    expect(capsule.cards).toBe('capsule');
    expect(capsule.photoLayout).toBe('capsules');
    expect(capsule.buttonShape).toBe('darkPill');
    for (const other of PAGE_STYLES.filter(s => s.key !== 'capsule')) {
      expect(other.hero).not.toBe('tallCapsule');
      expect(other.heading).not.toBe('pillMark');
      expect(other.cards).not.toBe('capsule');
      expect(other.photoLayout).not.toBe('capsules');
      expect(other.buttonShape).not.toBe('darkPill');
    }
  });

  it('lets the provider pick the one photo for its tall capsule', () => {
    expect(heroPhotoPickLimit(capsule)).toBe(1);
  });

  it('keeps the accent tint as light as a pale page and as dark as a dark one, so the ink reads', () => {
    for (const accent of ['#A9B49B', '#4A2C1E', '#E9799F']) {
      expect(isDarkColor(capsuleTones(accent, '#FAF8F3', '#FFFFFF')[0])).toBe(false);
      expect(isDarkColor(capsuleTones(accent, '#141512', '#1E1F1B')[0])).toBe(true);
    }
  });

  it('pairs a tint of their accent with their chosen card colour, no fixed colour of its own', () => {
    const [tint, card] = capsuleTones('#A9B49B', '#FFFFFF', '#FDF5F7');
    expect(card).toBe('#FDF5F7');
    expect(tint).not.toBe(card);
    expect(capsuleTones('#E9799F', '#FFFFFF', '#F3ECE2')[1]).toBe('#F3ECE2');
  });

  it('gives the services turns in the two tones, each a full pill', () => {
    const [tint, card] = capsuleTones('#A9B49B', '#FAF8F3', '#FDF5F7');
    expect(capsuleServiceSurface('#A9B49B', '#FAF8F3', '#FDF5F7', 0).backgroundColor).toBe(tint);
    expect(capsuleServiceSurface('#A9B49B', '#FAF8F3', '#FDF5F7', 1).backgroundColor).toBe(card);
    expect(capsuleServiceSurface('#A9B49B', '#FAF8F3', '#FDF5F7', 2).backgroundColor).toBe(tint);
    expect(serviceCardSurface(capsule, { card: '#FFFFFF', accent: '#A9B49B', sheet: '#FAF8F3' })?.borderRadius).toBe(45);
  });
});

describe('Moodboard', () => {
  const moodboard = getPageStyle('moodboard');

  it('pins the page up as a board, with its own top, headings, cards, service rows and Book shape', () => {
    expect(moodboard.hero).toBe('collage');
    expect(moodboard.heading).toBe('captionCaps');
    expect(moodboard.cards).toBe('print');
    expect(moodboard.serviceLayout).toBe('taggedRows');
    expect(moodboard.buttonShape).toBe('captionPill');
    for (const other of PAGE_STYLES.filter(s => s.key !== 'moodboard')) {
      expect(other.hero).not.toBe('collage');
      expect(other.heading).not.toBe('captionCaps');
      expect(other.cards).not.toBe('print');
      expect(other.serviceLayout).not.toBe('taggedRows');
      expect(other.buttonShape).not.toBe('captionPill');
    }
  });

  it('lets the provider pick all four prints, framed in each print\'s own shape', () => {
    expect(heroPhotoPickLimit(moodboard)).toBe(4);
    for (const index of [0, 1, 2, 3]) {
      expect(heroPhotoSlotAspect('collage', index, 4)).toBeCloseTo(moodboardPhotoAspect(index), 5);
    }
    expect(heroPhotoSlotAspect('collage', 3, 4)).toBe(1);
  });

  it('sets the first word of the name huge and the rest in the italic line, never a lone article', () => {
    expect(moodboardName('Halo Lash & Brow')).toEqual(['Halo', 'Lash & Brow']);
    expect(moodboardName('The Lash Lounge')).toEqual(['The Lash', 'Lounge']);
    expect(moodboardName('Glow')).toEqual(['Glow', '']);
  });

  it('tags a service with its type in the singular', () => {
    expect(moodboardTag('LASHES')).toBe('LASH');
    expect(moodboardTag('Brows')).toBe('BROW');
    expect(moodboardTag('NAILS')).toBe('NAIL');
    expect(moodboardTag('HAIR')).toBe('HAIR');
    expect(moodboardTag('')).toBe('');
  });

  it('keeps its sections on prints but its services on the page, in the page\'s ink', () => {
    expect(sectionsSitOnPage(moodboard)).toBe(false);
    expect(servicesSitOnPage(moodboard)).toBe(true);
    const row = serviceCardSurface(moodboard, { card: '#FFFFFF', accent: '#C8AE9A', sheet: '#F7F4EF' });
    expect(row?.backgroundColor).toBe('transparent');
    expect(row?.borderBottomColor).toBe(sheetInk('#F7F4EF').border);
  });

  it('prints on white on a pale page and on a warm dark card on a dark one', () => {
    expect(moodboardPrint('#F7F4EF').paper).toBe('#FFFFFF');
    expect(isDarkColor(moodboardPrint('#171411').paper)).toBe(true);
  });
});

describe('Latte', () => {
  const latte = getPageStyle('latte');
  const accent = '#B48F72';
  /** Rough brightness, enough to say which of two bands is deeper. */
  const lightness = (hex: string) => [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0);
  /** The order the profile draws its sections in (ProviderPageSheet). */
  const pageOrder: PageSectionKey[] = ['about', 'policies', 'services', 'policyPages', 'reviews', 'contact', 'hours', 'portfolio', 'info', 'keyInfo', 'faq', 'aftercare', 'custom', 'disclaimer'];

  it('pours the page, with its own top, headings and bands', () => {
    expect(latte.hero).toBe('pourTop');
    expect(latte.heading).toBe('pourSerif');
    expect(latte.cards).toBe('pour');
    for (const other of PAGE_STYLES.filter(s => s.key !== 'latte')) {
      expect(other.hero).not.toBe('pourTop');
      expect(other.heading).not.toBe('pourSerif');
      expect(other.cards).not.toBe('pour');
    }
    // Their logo at the top, not a photo (owner, 2026-11-23).
    expect(heroPhotoPickLimit(latte)).toBe(0);
  });

  it('sets each section a step further down the pour than the one drawn before it', () => {
    for (let i = 1; i < pageOrder.length; i += 1) {
      expect(LATTE_POUR[pageOrder[i]!]).toBeGreaterThan(LATTE_POUR[pageOrder[i - 1]!]);
    }
    for (const key of Object.keys(LATTE_POUR) as PageSectionKey[]) {
      expect(LATTE_POUR[key]).toBeGreaterThan(0);
      expect(LATTE_POUR[key]).toBeLessThan(1);
    }
  });

  it('gets deeper down a pale page, milk at the top and espresso at the foot', () => {
    const bands = pageOrder.map(section => latteBand(accent, '#FBF8F4', section));
    for (let i = 1; i < bands.length; i += 1) expect(lightness(bands[i]!)).toBeLessThan(lightness(bands[i - 1]!));
    expect(latteShade(accent, '#FBF8F4', 0)).toBe(latteStops(accent, '#FBF8F4')[0]);
    expect(isDarkColor(latteShade(accent, '#FBF8F4', 1))).toBe(true);
    expect(isDarkColor(latteShade(accent, '#FBF8F4', 0))).toBe(false);
  });

  it('pours the other way on a dark page, espresso at the top', () => {
    expect(isDarkColor(latteShade(accent, '#141110', 0))).toBe(true);
    expect(isDarkColor(latteShade(accent, '#141110', 1))).toBe(false);
    const bands = pageOrder.map(section => latteBand(accent, '#141110', section));
    for (let i = 1; i < bands.length; i += 1) expect(lightness(bands[i]!)).toBeGreaterThan(lightness(bands[i - 1]!));
  });

  it('turns the ink light on the deep bands and dark on the pale ones', () => {
    const sheet: PageStylePalette = {
      text: '#26201E', sub: '#5E5451', border: '#DDD', separator: '#EEE', background: '#FBF8F4', cardBackground: 'rgba(255,255,255,0.9)',
      accent, blurTint: 'light', blurIntensity: 25, highlightColors: ['#FFF', '#FFF'], pageStyle: latte,
    };
    const about = pourPalette(sheet, 'about');
    const deep = pourPalette(sheet, 'disclaimer');
    expect(about.background).toBe(latteBand(accent, '#FBF8F4', 'about'));
    expect(about.text).toBe(sheetInk(about.background).text);
    expect(isDarkColor(deep.background)).toBe(true);
    expect(deep.text).toBe(sheetInk(deep.background).text);
    expect(isDarkColor(deep.text)).toBe(false);
    expect(latteInk(deep.background).text).toBe('#FBF6F0');
    // Worked out from the page itself, so a band's palette gives the same band again.
    expect(pourPalette(about, 'about').background).toBe(about.background);
    expect(pourPalette(about, 'reviews').background).toBe(latteBand(accent, '#FBF8F4', 'reviews'));
    // Every other style keeps its palette as it is.
    const classic = { ...sheet, pageStyle: getPageStyle('classic') };
    expect(pourPalette(classic, 'about')).toBe(classic);
  });

  it('sets the services in soft see-through pills on their band', () => {
    const surface = serviceCardSurface(latte, { card: '#FFFFFF', accent, sheet: '#FBF8F4' });
    expect(surface?.backgroundColor).toBe(latteGlass(latteBand(accent, '#FBF8F4', 'services')));
    expect(surface?.borderRadius).toBe(28);
  });
});
