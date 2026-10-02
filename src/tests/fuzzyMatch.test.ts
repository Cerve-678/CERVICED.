import {
  normalizeTerm,
  tokenize,
  tokensSimilar,
  matchesSpeciality,
  matchesAnySpeciality,
} from '../utils/fuzzyMatch';

describe('normalizeTerm', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    expect(normalizeTerm('Silk-Press!!')).toBe('silk press');
    expect(normalizeTerm('  Blow   Out  ')).toBe('blow out');
    expect(normalizeTerm('Gel-X')).toBe('gel x');
  });

  it('strips accents', () => {
    expect(normalizeTerm('Ombré')).toBe('ombre');
    expect(normalizeTerm('Balayagé')).toBe('balayage');
  });

  it('returns empty string for punctuation-only input', () => {
    expect(normalizeTerm('---')).toBe('');
    expect(normalizeTerm('   ')).toBe('');
  });
});

describe('tokenize', () => {
  it('splits into words and drops empties', () => {
    expect(tokenize('Dominican Blow-Out')).toEqual(['dominican', 'blow', 'out']);
    expect(tokenize('')).toEqual([]);
  });
});

describe('tokensSimilar', () => {
  it('matches identical and plural/stem forms', () => {
    expect(tokensSimilar('blowout', 'blowout')).toBe(true);
    expect(tokensSimilar('blowouts', 'blowout')).toBe(true);
    expect(tokensSimilar('braiding', 'braid')).toBe(true);
  });

  it('tolerates typos scaled to word length', () => {
    expect(tokensSimilar('balyage', 'balayage')).toBe(true); // 1 edit, len 8
    expect(tokensSimilar('dominicn', 'dominican')).toBe(true); // 1 edit, len 9
  });

  it('refuses to fuzz very short words', () => {
    expect(tokensSimilar('gel', 'gem')).toBe(false);
    expect(tokensSimilar('bob', 'bib')).toBe(false);
  });

  it('rejects genuinely different words', () => {
    expect(tokensSimilar('braids', 'facial')).toBe(false);
    expect(tokensSimilar('microblading', 'threading')).toBe(false);
  });
});

describe('matchesSpeciality', () => {
  it('matches spacing variants (chip vs service name)', () => {
    expect(matchesSpeciality(['Dominican Blow Out Special'], 'Dominican blowout')).toBe(true);
    expect(matchesSpeciality(['silk-press'], 'Silk press')).toBe(true);
  });

  it('matches a provider speciality stored verbatim', () => {
    expect(matchesSpeciality(['Knotless braids', 'Silk press'], 'Knotless braids')).toBe(true);
  });

  it('tolerates a misspelling the provider typed into a service name', () => {
    expect(matchesSpeciality(['Domincan blowout — wash & style'], 'Dominican blowout')).toBe(true);
  });

  it('requires every word of a multi-word speciality to be present', () => {
    // "blow dry" alone is not a Dominican blowout.
    expect(matchesSpeciality(['Blow dry', 'Wash and go'], 'Dominican blowout')).toBe(false);
  });

  it('does not match an unrelated provider', () => {
    expect(matchesSpeciality(['Gel manicure', 'Acrylic sets', 'Nail art'], 'Microblading')).toBe(false);
  });

  it('treats a compound "/" or "&" label as alternatives (match any)', () => {
    // A service tagged just `biab` still matches the "BIAB / builder gel" chip.
    expect(matchesSpeciality(['biab'], 'BIAB / builder gel')).toBe(true);
    // A provider with only `balayage` matches "Colour & balayage".
    expect(matchesSpeciality(['balayage'], 'Colour & balayage')).toBe(true);
    // And the "no-makeup" half of "Natural / no-makeup".
    expect(matchesSpeciality(['no-makeup glam'], 'Natural / no-makeup')).toBe(true);
  });

  it('still rejects a compound label when no alternative is present', () => {
    expect(matchesSpeciality(['Gel manicure'], 'Colour & balayage')).toBe(false);
  });

  it('ignores empty needles and empty haystacks', () => {
    expect(matchesSpeciality([], 'Silk press')).toBe(false);
    expect(matchesSpeciality(['Silk press'], '   ')).toBe(false);
  });
});

describe('matchesAnySpeciality', () => {
  const haystack = ['Silk press', 'Knotless braids', 'Wig install'];

  it('matches when any selected speciality matches (OR semantics)', () => {
    expect(matchesAnySpeciality(haystack, ['Microblading', 'Silk press'])).toBe(true);
  });

  it('is false when none of the selected specialities match', () => {
    expect(matchesAnySpeciality(haystack, ['Microblading', 'Chemical peel'])).toBe(false);
  });

  it('is false for an empty selection', () => {
    expect(matchesAnySpeciality(haystack, [])).toBe(false);
  });
});
