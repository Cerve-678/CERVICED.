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

  it('rounds half a penny up, exactly as the server does', () => {
    // 5% of £34.30 + 40p is £2.115: the server charges £2.12.
    expect(calculatePlatformFee(34.3)).toBe(2.12);
    expect(calculatePlatformFee(35.9)).toBe(2.2);
    expect(calculatePlatformFee(40.5)).toBe(2.43);
    expect(calculatePlatformFee(153.7)).toBe(8.09);
    expect(calculatePlatformFee(312.5)).toBe(16.03);
    // Three £45.30 items add up to 135.8999… in floating point.
    expect(calculatePlatformFee(45.3 + 45.3 + 45.3)).toBe(7.2);
  });
});
