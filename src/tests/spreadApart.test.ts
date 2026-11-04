import { spreadApart, type SpreadRule } from '../utils/spreadApart';

type Card = { id: string; provider: string; category: string };
const card = (id: string, provider: string, category = 'HAIR'): Card => ({ id, provider, category });

const byProvider: SpreadRule<Card> = { keyOf: c => c.provider, gap: 3 };
const byCategory: SpreadRule<Card> = { keyOf: c => c.category, gap: 1 };

const minGap = (cards: Card[], keyOf: (c: Card) => string) => {
  let gap = Infinity;
  cards.forEach((c, i) => {
    const j = cards.findIndex((d, k) => k > i && keyOf(d) === keyOf(c));
    if (j !== -1) gap = Math.min(gap, j - i - 1);
  });
  return gap;
};

describe('spreadApart', () => {
  it('breaks up one provider’s photos that arrived together', () => {
    const feed = [
      card('a1', 'a'), card('a2', 'a'), card('a3', 'a'),
      card('b1', 'b'), card('c1', 'c'), card('d1', 'd'),
      card('e1', 'e'), card('f1', 'f'), card('g1', 'g'),
    ];
    const out = spreadApart(feed, [byProvider]);
    expect(out).toHaveLength(feed.length);
    expect(minGap(out, c => c.provider)).toBeGreaterThanOrEqual(3);
  });

  it('keeps the order it was given wherever nothing clashes', () => {
    const feed = [card('a', 'a'), card('b', 'b'), card('c', 'c')];
    expect(spreadApart(feed, [byProvider])).toEqual(feed);
  });

  it('splits up runs of one category', () => {
    const feed = [
      card('1', 'a', 'NAILS'), card('2', 'b', 'NAILS'), card('3', 'c', 'NAILS'),
      card('4', 'd', 'HAIR'), card('5', 'e', 'HAIR'), card('6', 'f', 'LASHES'),
    ];
    const out = spreadApart(feed, [byProvider, byCategory]);
    expect(minGap(out, c => c.category)).toBeGreaterThanOrEqual(1);
  });

  it('puts the provider rule first when both can’t be kept', () => {
    // Only nails left: the category rule has to give, the provider rule doesn't.
    const feed = [card('1', 'a', 'NAILS'), card('2', 'a', 'NAILS'), card('3', 'b', 'NAILS'), card('4', 'c', 'NAILS'), card('5', 'd', 'NAILS')];
    const out = spreadApart(feed, [byProvider, byCategory]);
    expect(minGap(out, c => c.provider)).toBeGreaterThanOrEqual(3);
  });

  it('still returns everything when a clump can’t be avoided', () => {
    const feed = [card('1', 'a'), card('2', 'a'), card('3', 'a')];
    expect(spreadApart(feed, [byProvider]).map(c => c.id).sort()).toEqual(['1', '2', '3']);
  });

  it('keeps a new page away from the end of the one above it', () => {
    const shown = [card('x', 'x'), card('a0', 'a')];
    const page = [card('a1', 'a'), card('b1', 'b'), card('c1', 'c'), card('d1', 'd')];
    expect(spreadApart(page, [byProvider], shown)[0]!.provider).not.toBe('a');
  });
});
