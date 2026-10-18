import { isInsufficientBalance, planTakeBack } from '../../supabase/functions/_shared/takeBackPlan';

describe('taking money back from a provider who was already paid', () => {
  test('reverses what the transfer can return and owes the rest', () => {
    expect(planTakeBack(3000, 5000)).toEqual({ reverse: 3000, shortfall: 0 });
    // £20 of a £50 payout settled an earlier shortfall, so the transfer only carried £30.
    expect(planTakeBack(5000, 3000)).toEqual({ reverse: 3000, shortfall: 2000 });
    // A payout used up entirely on an earlier shortfall had no transfer at all.
    expect(planTakeBack(4500, 0)).toEqual({ reverse: 0, shortfall: 4500 });
  });

  test('never plans a negative or fractional amount', () => {
    expect(planTakeBack(-100, 5000)).toEqual({ reverse: 0, shortfall: 0 });
    expect(planTakeBack(1000.4, -20)).toEqual({ reverse: 0, shortfall: 1000 });
  });

  test("recognises Stripe refusing a reversal for lack of balance, and nothing else", () => {
    expect(isInsufficientBalance({ code: 'balance_insufficient' })).toBe(true);
    expect(isInsufficientBalance({ raw: { code: 'insufficient_funds' } })).toBe(true);
    expect(isInsufficientBalance({ code: 'resource_missing' })).toBe(false);
    expect(isInsufficientBalance(new Error('network'))).toBe(false);
    expect(isInsufficientBalance(null)).toBe(false);
  });
});
