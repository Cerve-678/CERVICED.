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
});
