import { PAYOUT_HOLD_DAY_OPTIONS, isPayoutHoldDays, payoutHoldLabel } from '../constants/payoutTiming';

test('payout timing options match the server whitelist and never go under 24 hours', () => {
  expect([...PAYOUT_HOLD_DAY_OPTIONS]).toEqual([1, 3, 7, 14, 30]);
  expect(PAYOUT_HOLD_DAY_OPTIONS.map(payoutHoldLabel)).toEqual(['24 hours', '3 days', '7 days', '14 days', '30 days']);
  expect(isPayoutHoldDays(0)).toBe(false);
  expect(isPayoutHoldDays(2)).toBe(false);
  expect(isPayoutHoldDays('7')).toBe(false);
});
