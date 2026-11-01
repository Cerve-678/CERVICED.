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
    expect(buildLocationTerms('East Manchester')).toEqual(['East Manchester', 'Manchester']);
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
  it('leaves numbers that are not money alone', () => {
    expect(parseSearchQuery('lip filler 2ml')).toMatchObject({ serviceText: 'lip filler 2ml', maxPrice: null });
    expect(parseSearchQuery('lace frontal 13x6').maxPrice).toBeNull();
  });
});
