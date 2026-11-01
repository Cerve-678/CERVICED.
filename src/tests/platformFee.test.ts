import { calculatePlatformFee, splitPlatformFeePence } from '../features/cart/platformFee';

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

describe('splitting the fee across bookings', () => {
  const sum = (shares: number[]) => shares.reduce((total, share) => total + share, 0);

  it('shares by what each booking is charged, the last taking the remainder', () => {
    expect(splitPlatformFeePence(940, [12000, 6000])).toEqual([627, 313]);
    expect(splitPlatformFeePence(715, [3000, 4500, 6000])).toEqual([159, 238, 318]);
  });

  it('gives a booking charged nothing no share and never goes negative', () => {
    // Each £30.10 share is 170.5p, rounded up to 171p. The last booking would
    // be -1p if a £0 booking took the remainder.
    const shares = splitPlatformFeePence(341, [3010, 3010, 0]);
    expect(shares).toEqual([171, 170, 0]);
    expect(sum(shares)).toBe(341);
  });

  it('never lets rounding overshoot the fee', () => {
    const shares = splitPlatformFeePence(199, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1000]);
    expect(sum(shares)).toBe(199);
    expect(shares.every(share => share >= 0)).toBe(true);
  });

  it('has nothing to split on a free checkout', () => {
    expect(splitPlatformFeePence(0, [0, 0])).toEqual([0, 0]);
  });
});
