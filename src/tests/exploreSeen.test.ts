import { roundRobinMix } from '../utils/roundRobinMix';
import { EXPLORE_SEEN_TTL_MS, markSeen, pruneSeen } from '../utils/exploreSeen';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));

type Card = { id: string; provider: string };
const cards: Card[] = [
  { id: 'a1', provider: 'A' }, { id: 'a2', provider: 'A' }, { id: 'a3', provider: 'A' },
  { id: 'b1', provider: 'B' }, { id: 'b2', provider: 'B' },
  { id: 'c1', provider: 'C' },
];

describe('Explore leads with photos this phone has not shown', () => {
  it('starts every provider on an unseen photo while one is left', () => {
    const seen = new Map([['a1', 1], ['a2', 2], ['b1', 3]]);
    for (let run = 0; run < 25; run++) {
      const mixed = roundRobinMix(cards, c => c.provider, undefined, c => seen.get(c.id));
      const firstOf = (p: string) => mixed.find(c => c.provider === p)!.id;
      expect(firstOf('A')).toBe('a3');
      expect(firstOf('B')).toBe('b2');
    }
  });

  it('brings seen photos back longest-ago first, and still shows every one', () => {
    const seen = new Map([['a1', 30], ['a2', 10], ['a3', 20]]);
    const mixed = roundRobinMix(cards, c => c.provider, undefined, c => seen.get(c.id));
    expect(mixed.filter(c => c.provider === 'A').map(c => c.id)).toEqual(['a2', 'a3', 'a1']);
    expect(mixed).toHaveLength(cards.length);
  });

  it('puts providers with something new ahead of ones already seen in full', () => {
    const seen = new Map([['c1', 5]]);
    for (let run = 0; run < 25; run++) {
      const mixed = roundRobinMix(cards, c => c.provider, undefined, c => seen.get(c.id));
      expect(mixed.slice(0, 2).map(c => c.provider).sort()).toEqual(['A', 'B']);
    }
  });

  it('is an ordinary mix when nothing has been seen', () => {
    const mixed = roundRobinMix(cards, c => c.provider, undefined, () => undefined);
    expect(new Set(mixed.slice(0, 3).map(c => c.provider))).toEqual(new Set(['A', 'B', 'C']));
  });
});

describe('the remembered list', () => {
  it('forgets photos after the TTL and keeps only the newest', () => {
    const now = 1_000_000_000_000;
    const seen = new Map([['old', now - EXPLORE_SEEN_TTL_MS - 1], ['x', now - 3], ['y', now - 2], ['z', now - 1]]);
    expect([...pruneSeen(seen, now, 2).keys()]).toEqual(['z', 'y']);
  });

  it('keeps the first time a photo was seen this visit, and refreshes one from an earlier visit', () => {
    const since = 100;
    const seen = new Map([['thisVisit', 150], ['lastVisit', 50]]);
    const next = markSeen(seen, ['thisVisit', 'lastVisit', 'new'], 200, since);
    expect(next.get('thisVisit')).toBe(150);
    expect(next.get('lastVisit')).toBe(200);
    expect(next.get('new')).toBe(200);
  });
});
