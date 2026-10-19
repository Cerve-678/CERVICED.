import {
  citiesInLocation,
  filtersAllowDirectoryListings,
  listingInitial,
  listingInstagramUrl,
  listingLink,
} from '../features/providers/directoryListings';

describe('listingInitial', () => {
  it('uses the first letter or digit of the name', () => {
    expect(listingInitial('fshairuk')).toBe('F');
    expect(listingInitial('_hdastyless')).toBe('H');
    expect(listingInitial('26suite')).toBe('2');
    expect(listingInitial('  ')).toBe('?');
  });
});

describe('citiesInLocation', () => {
  it('finds the Search filter cities named in the area text', () => {
    expect(citiesInLocation('Lewisham, South London')).toEqual(['London']);
    expect(citiesInLocation('Dartford, South London')).toEqual(['London']);
    expect(citiesInLocation(null)).toEqual([]);
  });

  it('only matches whole words', () => {
    expect(citiesInLocation('Bathgate')).toEqual([]);
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
