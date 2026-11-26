import { roundRobinMix } from '../utils/roundRobinMix';

type Card = { id: string; provider: string; category: string };

function cards(provider: string, category: string, count: number): Card[] {
  return Array.from({ length: count }, (_, i) => ({ id: `${provider}-${i}`, provider, category }));
}

// Mirrors the live catalogue's shape on 2026-11-09: one provider with 33
// photos, several mid-sized, two with a handful.
const catalogue: Card[] = [
  ...cards('nails-studio', 'NAILS', 33),
  ...cards('aesthetics-n', 'AESTHETICS', 23),
  ...cards('face-by-jen', 'MUA', 22),
  ...cards('tiago', 'HAIR', 20),
  ...cards('mora', 'HAIR', 16),
  ...cards('arii', 'HAIR', 14),
  ...cards('ellie', 'NAILS', 11),
  ...cards('glam', 'MUA', 10),
  ...cards('lou', 'LASHES', 9),
  ...cards('uniquely', 'AESTHETICS', 9),
  ...cards('liz', 'MUA', 5),
  ...cards('keyshe', 'NAILS', 2),
];

describe('roundRobinMix', () => {
  it('keeps every item exactly once', () => {
    const mixed = roundRobinMix(catalogue, c => c.provider, c => c.category);
    expect(mixed).toHaveLength(catalogue.length);
    expect(new Set(mixed.map(c => c.id)).size).toBe(catalogue.length);
  });

  it('shows every provider once before any provider repeats', () => {
    for (let run = 0; run < 20; run++) {
      const mixed = roundRobinMix(catalogue, c => c.provider, c => c.category);
      const firstRound = mixed.slice(0, 12).map(c => c.provider);
      expect(new Set(firstRound).size).toBe(12);
    }
  });

  it('keeps the same provider a whole round apart while every provider has photos', () => {
    const mixed = roundRobinMix(catalogue, c => c.provider, c => c.category);
    // Every provider has at least 2, so the first two rounds are full rounds.
    for (let i = 12; i < 24; i++) {
      expect(mixed[i]!.provider).toBe(mixed[i - 12]!.provider);
    }
  });

  it('avoids neighbouring cards from the same category in the first round where it can', () => {
    for (let run = 0; run < 20; run++) {
      const firstRound = roundRobinMix(catalogue, c => c.provider, c => c.category).slice(0, 12);
      for (let i = 1; i < firstRound.length; i++) {
        expect(firstRound[i]!.category).not.toBe(firstRound[i - 1]!.category);
      }
    }
  });

  it('changes the order between loads', () => {
    const firsts = new Set<string>();
    for (let run = 0; run < 30; run++) {
      firsts.add(roundRobinMix(catalogue, c => c.provider)[0]!.provider);
    }
    expect(firsts.size).toBeGreaterThan(3);
  });

  it('gives items without a group a slot each', () => {
    const items = [{ id: 'a', provider: '' }, { id: 'b', provider: '' }, { id: 'c', provider: 'x' }];
    expect(roundRobinMix(items, i => i.provider || null).map(i => i.id).sort()).toEqual(['a', 'b', 'c']);
  });
});
