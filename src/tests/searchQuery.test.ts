import { buildLocationTerms, parseSearchQuery } from '../utils/searchQuery';

describe('search intent', () => {
  it('separates service alternatives from a complete location', () => {
    expect(parseSearchQuery('  nail art and manicure in  New York ')).toMatchObject({
      serviceTerms: ['nail art', 'manicure'], locationTerms: ['New York'], categoryHint: 'NAILS',
    });
  });
  it('does not split a place into individual words', () => {
    expect(buildLocationTerms('New York')).toEqual(['New York']);
  });
  it('falls back from a directional location to its city', () => {
    const terms = buildLocationTerms('East Manchester');
    expect(terms[0]).toBe('East Manchester');
    expect(terms[terms.length - 1]).toBe('Manchester');
  });
  it('does not infer a category from a substring or a place name', () => {
    expect(parseSearchQuery('Abigail').categoryHint).toBeNull();
    expect(parseSearchQuery('studio near Skin Lane').categoryHint).toBeNull();
    expect(parseSearchQuery('chair repair').categoryHint).toBeNull();
  });
  it('supports location-only intent', () => {
    expect(parseSearchQuery('near Manchester')).toMatchObject({ serviceTerms: [], locationTerms: ['Manchester'] });
  });
  it('recognises a supported city without requiring “in”', () => {
    expect(parseSearchQuery('nail art Nottingham')).toMatchObject({
      serviceTerms: ['nail art'], locationTerms: ['Nottingham'], categoryHint: 'NAILS',
    });
  });
  it('takes a budget out of the words and keeps it as a ceiling', () => {
    expect(parseSearchQuery('makeup artists for £70')).toMatchObject({
      serviceText: 'makeup artists', maxPrice: 70, raw: 'makeup artists for £70',
    });
    expect(parseSearchQuery('gel nails under £35 in Manchester')).toMatchObject({
      serviceTerms: ['gel nails'], locationTerms: ['Manchester'], maxPrice: 35,
    });
    expect(parseSearchQuery('lashes 40 quid').maxPrice).toBe(40);
    expect(parseSearchQuery('£25.50 manicure').maxPrice).toBe(25.5);
  });
  it('never reads "near me" as a place called "me"', () => {
    for (const q of ['nails near me', 'nails nearby', 'nails close to me', 'lashes around me']) {
      expect(parseSearchQuery(q)).toMatchObject({ serviceText: expect.stringMatching(/^(nails|lashes)$/), locationTerms: [] });
    }
    expect(parseSearchQuery('braids near me in London').locationTerms).toEqual(['London']);
  });
  it('fixes a slip in a compass word but never in a place name', () => {
    expect(parseSearchQuery('nails in weat london').locationTerms).toEqual(
      expect.arrayContaining(['weat london', 'west london', 'london']),
    );
    expect(buildLocationTerms('Leeds')).toEqual(['Leeds']);
  });
  it('fixes a mistyped place after "in", to a place the app knows', () => {
    expect(parseSearchQuery('nails in hackny').locationTerms).toEqual(['hackny', 'Hackney', 'London']);
    expect(parseSearchQuery('hair in lndon').locationTerms).toEqual(['lndon', 'London']);
    expect(parseSearchQuery('lashes in manchster').locationTerms).toContain('Manchester');
    // A real place is never "corrected" into a neighbouring one.
    expect(buildLocationTerms('Bath')).toEqual(['Bath']);
  });
  it('reads an area the way providers store it: area, then its city', () => {
    expect(buildLocationTerms('hackney')).toEqual(['hackney', 'London']);
    expect(parseSearchQuery('hackney')).toMatchObject({ serviceTerms: [], locationTerms: ['hackney', 'London'] });
    expect(parseSearchQuery('braids hackney')).toMatchObject({ serviceTerms: ['braids'], locationTerms: ['hackney', 'London'] });
  });
  it('widens a region to its areas, most specific first', () => {
    const terms = buildLocationTerms('east london');
    expect(terms[0]).toBe('east london');
    expect(terms).toContain('Tower Hamlets');
    expect(terms.indexOf('Tower Hamlets')).toBeLessThan(terms.indexOf('london'));
  });
  it('does not take a short area name that is also a word as a place', () => {
    expect(parseSearchQuery('lash idle').locationTerms).toEqual([]);
  });
  it('leaves numbers that are not money alone', () => {
    expect(parseSearchQuery('lip filler 2ml')).toMatchObject({ serviceText: 'lip filler 2ml', maxPrice: null });
    expect(parseSearchQuery('lace frontal 13x6').maxPrice).toBeNull();
  });
});
