import { calculatePlatformFee } from '../features/cart/platformFee';

describe('platform fee tiers', () => {
  it('matches the server three-tier scale on the full-payment subtotal', () => {
    expect(calculatePlatformFee(0)).toBe(0);
    expect(calculatePlatformFee(49.99)).toBe(1.99);
    expect(calculatePlatformFee(99.99)).toBe(1.99);
    expect(calculatePlatformFee(100)).toBe(3.99);
    expect(calculatePlatformFee(250)).toBe(3.99);
    expect(calculatePlatformFee(300)).toBe(3.99);
    expect(calculatePlatformFee(300.01)).toBe(5.99);
    expect(calculatePlatformFee(1000)).toBe(5.99);
  });

  it('tiers a deposit-only checkout on the full service price, not the deposit', () => {
    // £20 deposit on an £80 service -> under £100 tier.
    expect(calculatePlatformFee(0, 80)).toBe(1.99);
    // £50 deposit on a £250 service -> £100–£300 tier.
    expect(calculatePlatformFee(0, 250)).toBe(3.99);
    expect(calculatePlatformFee(0, 400)).toBe(5.99);
    expect(calculatePlatformFee(0, 0)).toBe(0);
  });

  it('ignores deposit services once anything is paid in full', () => {
    expect(calculatePlatformFee(60, 500)).toBe(1.99);
  });
});
