import { durationToMinutes, formatTimeSpan, to24hMinutes } from '../features/cart/presentation';
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
