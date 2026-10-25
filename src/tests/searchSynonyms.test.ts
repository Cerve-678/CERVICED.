import { expandSearchSynonyms } from '../constants/searchSynonyms';

describe('expandSearchSynonyms', () => {
  it('expands a known alias', () => {
    expect(expandSearchSynonyms('gel nails')).toEqual(expect.arrayContaining(['biab']));
    expect(expandSearchSynonyms('LVL')).toEqual(expect.arrayContaining(['lash lift']));
    expect(expandSearchSynonyms('silk press')).toEqual(expect.arrayContaining(['dominican blowout']));
  });

  it('is case-insensitive and ignores punctuation', () => {
    expect(expandSearchSynonyms('Gel-Nails!')).toEqual(expect.arrayContaining(['biab']));
  });

  it('matches whole words/phrases only (no substring false-fires)', () => {
    // "tan" appears inside "tangle" but must not trigger the "spray tan" entry,
    // and nothing in the map is triggered by "tangle".
    expect(expandSearchSynonyms('tangle')).toEqual([]);
  });

  it('does not echo back a term the query already contains', () => {
    // "gel nails" would expand to biab/builder gel/gel manicure, but the query
    // already says biab here, so biab must be dropped from the expansion.
    const out = expandSearchSynonyms('gel nails biab');
    expect(out).not.toContain('biab');
  });

  it('returns a deduped list', () => {
    const out = expandSearchSynonyms('bridal wedding'); // both map to each other
    expect(new Set(out).size).toBe(out.length);
  });

  it('returns [] for an empty or unmatched query', () => {
    expect(expandSearchSynonyms('')).toEqual([]);
    expect(expandSearchSynonyms('   ')).toEqual([]);
    expect(expandSearchSynonyms('xyzzy plugh')).toEqual([]);
  });
});
