import { matchesHairType } from '../utils/hairTypeMatch';

describe('matchesHairType', () => {
  // The load-bearing rule: an unset list means "caters to / suits all", not
  // "unknown". If this ever flips, every provider who hasn't filled the field
  // in silently disappears from filtered search results.
  it('treats an unset list as matching every hair type', () => {
    expect(matchesHairType(null, '4C')).toBe(true);
    expect(matchesHairType(undefined, '4C')).toBe(true);
    expect(matchesHairType([], '4C')).toBe(true);
  });

  it('matches only the listed types once the list is populated', () => {
    expect(matchesHairType(['Curly', 'Coily', '4C'], '4C')).toBe(true);
    expect(matchesHairType(['Straight', 'Wavy'], '4C')).toBe(false);
  });

  it('is case- and value-exact, matching the HAIR_TYPES vocabulary', () => {
    // The app writes HAIR_TYPES strings verbatim at both levels, so a
    // near-miss like '4c' is a data bug rather than something to coerce.
    expect(matchesHairType(['4C'], '4c')).toBe(false);
  });

  // 2026-11-27: a curl code and its family word match both ways (and the same
  // rule runs in SQL as public.hair_type_matches).
  it('matches a curl code with its family word, both ways', () => {
    expect(matchesHairType(['Curly'], '3B')).toBe(true);
    expect(matchesHairType(['3B'], 'Curly')).toBe(true);
    expect(matchesHairType(['4C'], 'Coily')).toBe(true);
    expect(matchesHairType(['Wavy'], '2A')).toBe(true);
  });

  it('keeps different codes and different families apart', () => {
    expect(matchesHairType(['3A'], '3B')).toBe(false);
    expect(matchesHairType(['Curly'], '4C')).toBe(false);
    expect(matchesHairType(['Coily'], 'Straight')).toBe(false);
  });
});
