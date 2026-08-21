import {
  CART_OVERLAP_MESSAGE,
  durationToMinutes,
  findCartOverlapIssues,
  formatTimeSpan,
  to24hMinutes,
} from '../features/cart/presentation';
import { getCartAddOnsSummary, getCartItemFullPrice } from '../features/cart/pricing';

describe('cart presentation helpers', () => {
  it('orders both display and database time formats consistently', () => {
    expect(to24hMinutes('2:30 PM')).toBe(14 * 60 + 30);
    expect(to24hMinutes('09:15')).toBe(9 * 60 + 15);
    expect(to24hMinutes('not a time')).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('keeps grouped booking spans readable and duration-aware', () => {
    expect(durationToMinutes('1h 30min')).toBe(90);
    expect(formatTimeSpan(14 * 60, 15 * 60 + 30)).toBe('2:00pm – 3:30pm · 1h 30m');
  });

  it('uses the same full-price calculation for individual and grouped cards', () => {
    const item = { price: 45, addOns: [{ name: 'Nail art', price: 10 }, { name: 'Repair', price: '2.50' }] } as any;
    expect(getCartItemFullPrice(item)).toBe(57.5);
    expect(getCartAddOnsSummary(item)).toEqual({ count: 2, total: 12.5, names: 'Nail art, Repair' });
  });
});

// A cart that cannot possibly check out should say so on the offending cards
// before the client taps anything, so these clashes are found with no network.
describe('findCartOverlapIssues', () => {
  const entry = (over: Partial<Parameters<typeof findCartOverlapIssues>[0][number]>) => ({
    itemId: 'a',
    providerKey: 'provider-1',
    date: '2026-09-01',
    time: '2:00 PM',
    duration: '1h',
    ...over,
  });

  it('flags both services when two overlap for the same provider on the same day', () => {
    const issues = findCartOverlapIssues([
      entry({ itemId: 'a', time: '2:00 PM', duration: '1h' }),
      entry({ itemId: 'b', time: '2:30 PM', duration: '1h' }),
    ]);
    expect(issues.get('a')).toBe(CART_OVERLAP_MESSAGE);
    expect(issues.get('b')).toBe(CART_OVERLAP_MESSAGE);
  });

  it('treats back-to-back as fine — that is how a grouped appointment is built', () => {
    const issues = findCartOverlapIssues([
      entry({ itemId: 'a', time: '2:00 PM', duration: '1h' }),
      entry({ itemId: 'b', time: '3:00 PM', duration: '30min' }),
    ]);
    expect(issues.size).toBe(0);
  });

  it('does not flag the same time across different providers or different days', () => {
    expect(findCartOverlapIssues([
      entry({ itemId: 'a', providerKey: 'provider-1' }),
      entry({ itemId: 'b', providerKey: 'provider-2' }),
    ]).size).toBe(0);

    expect(findCartOverlapIssues([
      entry({ itemId: 'a', date: '2026-09-01' }),
      entry({ itemId: 'b', date: '2026-09-02' }),
    ]).size).toBe(0);
  });

  it('skips lines with no time or an unreadable one rather than guessing a span', () => {
    expect(findCartOverlapIssues([
      entry({ itemId: 'a', time: undefined }),
      entry({ itemId: 'b' }),
    ]).size).toBe(0);

    expect(findCartOverlapIssues([
      entry({ itemId: 'a', time: 'whenever' }),
      entry({ itemId: 'b' }),
    ]).size).toBe(0);
  });
});
