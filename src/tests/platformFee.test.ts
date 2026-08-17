import { calculatePlatformFee } from '../features/cart/platformFee';

describe('platform fee tiers', () => {
  it('uses the published fixed tiers and a separate deposit-checkout fee', () => {
    expect(calculatePlatformFee(0)).toBe(0);
    expect(calculatePlatformFee(0, true)).toBe(0.99);
    expect(calculatePlatformFee(49.99)).toBe(1.99);
    expect(calculatePlatformFee(50)).toBe(3.99);
    expect(calculatePlatformFee(100)).toBe(5.99);
    expect(calculatePlatformFee(200)).toBe(9.99);
    expect(calculatePlatformFee(500)).toBe(9.99);
  });
});
