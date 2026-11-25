import { cityFilterKeys, matchesCityFilter } from '../utils/providerCity';
import {
  filtersAllowDirectoryListings,
  listingCategoryLabel,
  listingInitial,
  listingInstagramUrl,
  listingLink,
  listingNotice,
  listingNudgeLine,
  listingServiceKind,
} from '../features/providers/directoryListings';

describe('listingInitial', () => {
  it('uses the first letter or digit of the name', () => {
    expect(listingInitial('fshairuk')).toBe('F');
    expect(listingInitial('_hdastyless')).toBe('H');
    expect(listingInitial('26suite')).toBe('2');
    expect(listingInitial('  ')).toBe('?');
  });
});

describe('City filter on a listing\'s imported area text', () => {
  // Search builds a listing's cityKeys from its area text alone: listings
  // have no "Areas you cover" list.
  const matches = (picked: string[], area: string | null) =>
    matchesCityFilter(picked, cityFilterKeys(area, []));

  it('finds the town the area text names', () => {
    expect(matches(['London'], 'Lewisham, South London')).toBe(true);
    expect(matches(['London'], 'Camberwell, South London')).toBe(true);
    expect(matches(['Manchester'], 'Lewisham, South London')).toBe(false);
    expect(matches(['London'], null)).toBe(false);
  });
});

describe('filtersAllowDirectoryListings', () => {
  it('keeps listings with no filters, or a city filter', () => {
    expect(filtersAllowDirectoryListings({})).toBe(true);
    expect(filtersAllowDirectoryListings({ serviceType: 'all', distance: 999 })).toBe(true);
  });

  it.each([
    ['rating', { rating: 4 }],
    ['availability', { availableOnly: true }],
    ['speciality', { specialty: ['Knotless'] }],
    ['distance', { distance: 5 }],
  ])('drops them once a %s filter is on', (_label, filters) => {
    expect(filtersAllowDirectoryListings(filters)).toBe(false);
  });
});

describe('listingLink', () => {
  it('treats booking pages as booking, opened in the app', () => {
    expect(listingLink('https://fshairruk.as.me')).toEqual({
      label: 'Book on their page',
      url: 'https://fshairruk.as.me/',
      opensInApp: true,
    });
    expect(listingLink('linktr.ee/zawigs')?.opensInApp).toBe(true);
  });

  it('labels TikTok and WhatsApp links for what they are', () => {
    expect(listingLink('https://www.tiktok.com/@akkollection')).toMatchObject({
      label: 'Open their TikTok',
      opensInApp: false,
    });
    expect(listingLink('https://wa.me/447000000000')).toMatchObject({
      label: 'Message on WhatsApp',
      opensInApp: false,
    });
  });

  it('returns null when there is no usable link', () => {
    expect(listingLink(null)).toBeNull();
    expect(listingLink('javascript:alert(1)')).toBeNull();
  });
});

describe('listingInstagramUrl', () => {
  it('builds the profile URL from a handle', () => {
    expect(listingInstagramUrl('schair.uk')).toBe('https://instagram.com/schair.uk');
    expect(listingInstagramUrl('@_hdastyless')).toBe('https://instagram.com/_hdastyless');
  });

  it('refuses anything that is not a handle', () => {
    expect(listingInstagramUrl('a/b')).toBeNull();
    expect(listingInstagramUrl(null)).toBeNull();
  });
});

describe('listingCategoryLabel', () => {
  it('writes categories the way the app does elsewhere', () => {
    expect(listingCategoryLabel('MUA')).toBe('Makeup');
    expect(listingCategoryLabel('HAIR')).toBe('Hair');
    expect(listingCategoryLabel('BROWS')).toBe('Brows');
  });

  it('keeps a category the app does not know', () => {
    expect(listingCategoryLabel('PIERCING')).toBe('PIERCING');
  });
});

describe('listingServiceKind', () => {
  it('shows what they do when it adds something', () => {
    expect(listingServiceKind('Wigs', 'HAIR')).toBe('Wigs');
    expect(listingServiceKind('  Makeup artist ', 'MUA')).toBe('Makeup artist');
  });

  it('hides it when it only repeats the category', () => {
    expect(listingServiceKind('Lashes', 'LASHES')).toBeNull();
    expect(listingServiceKind('makeup', 'MUA')).toBeNull();
    expect(listingServiceKind('', 'HAIR')).toBeNull();
    expect(listingServiceKind(null, 'HAIR')).toBeNull();
  });
});

describe('listingNotice', () => {
  // Legal-adjacent (Client Terms §6): every point must survive any rewording.
  const points = [
    "hasn't joined or partnered with CERVICED",
    "you can't book it in the app",
    'may be out of date',
    'claim it below',
    'support@cerviced.co',
    'corrected or removed',
    'Press Nudge',
  ];

  it.each([true, false])('keeps every point (has a link: %s)', hasLink => {
    for (const point of points) expect(listingNotice(hasLink)).toContain(point);
  });

  it("says CERVICED doesn't run their page only when there is one", () => {
    expect(listingNotice(true)).toContain("You book on their own page, which CERVICED doesn't run.");
    expect(listingNotice(false)).not.toContain('their own page');
    expect(listingNotice(false)).toContain('get in touch with them on Instagram');
  });
});

describe('listingNudgeLine', () => {
  it('counts the people who nudged', () => {
    expect(listingNudgeLine(1)).toBe('1 beauty lover has nudged you to join CERVICED.');
    expect(listingNudgeLine(12)).toBe('12 beauty lovers have nudged you to join CERVICED.');
  });

  it('says nothing with no nudges', () => {
    expect(listingNudgeLine(0)).toBeNull();
    expect(listingNudgeLine(Number.NaN)).toBeNull();
  });
});
