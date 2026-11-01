import { calculatePlatformFee } from '../features/cart/platformFee';

describe('platform fee', () => {
  it('is 5% of what the card is charged plus 40p', () => {
    expect(calculatePlatformFee(50)).toBe(2.9);
    expect(calculatePlatformFee(90)).toBe(4.9);
    expect(calculatePlatformFee(150)).toBe(7.9);
    expect(calculatePlatformFee(135)).toBe(7.15);
    // An £80 deposit on a £400 service: the deposit is what's charged.
    expect(calculatePlatformFee(80)).toBe(4.4);
  });

  it('never goes below £1.99', () => {
    expect(calculatePlatformFee(0.01)).toBe(1.99);
    expect(calculatePlatformFee(25)).toBe(1.99);
    expect(calculatePlatformFee(31.8)).toBe(1.99);
    expect(calculatePlatformFee(32)).toBe(2);
  });

  it('never goes above £24.99', () => {
    expect(calculatePlatformFee(491)).toBe(24.95);
    expect(calculatePlatformFee(491.8)).toBe(24.99);
    expect(calculatePlatformFee(800)).toBe(24.99);
    expect(calculatePlatformFee(5000)).toBe(24.99);
  });

  it('charges nothing on a free or empty checkout', () => {
    expect(calculatePlatformFee(0)).toBe(0);
    expect(calculatePlatformFee(-5)).toBe(0);
    expect(calculatePlatformFee(Number.NaN)).toBe(0);
  });
});
