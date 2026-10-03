import { adjustPayout, planRefund } from '../../supabase/functions/_shared/refundPlan';

// £80 service + £5 fee = £85 paid. Provider's payout share £80.
const fresh = { amountPaidPence: 8500, alreadyRefundedPence: 0, providerHeldPence: 8000 };
// After a late cancel kept the £20 deposit: client got £60 back, provider holds £20, CERVICED kept £5.
const settled = { amountPaidPence: 8500, alreadyRefundedPence: 6000, providerHeldPence: 2000 };

describe('planRefund', () => {
  it('refunds everything, fee included, on a full refund of a fresh booking', () => {
    expect(planRefund({ ...fresh, request: 'full' })).toEqual({ ok: true, refundPence: 8500, payoutAdjustPence: 8000, isFinalRefund: true });
  });

  it('takes a partial refund out of the provider share and keeps the fee', () => {
    expect(planRefund({ ...fresh, request: 3000 })).toEqual({ ok: true, refundPence: 3000, payoutAdjustPence: 3000, isFinalRefund: false });
  });

  it('caps a partial refund at what the provider holds (the fee is never part of it)', () => {
    expect(planRefund({ ...fresh, request: 8500 })).toEqual({ ok: false, error: 'You can refund at most £80.00.' });
  });

  it('gives back the kept deposit after a policy settlement without returning the fee', () => {
    const p = planRefund({ ...settled, request: 2000 });
    expect(p).toEqual({ ok: true, refundPence: 2000, payoutAdjustPence: 2000, isFinalRefund: false });
  });

  it('allows part of the kept deposit as goodwill', () => {
    expect(planRefund({ ...settled, request: 500 })).toMatchObject({ ok: true, refundPence: 500, payoutAdjustPence: 500 });
  });

  it('a full refund after a settlement returns what is left, fee included', () => {
    expect(planRefund({ ...settled, request: 'full' })).toEqual({ ok: true, refundPence: 2500, payoutAdjustPence: 2000, isFinalRefund: true });
  });

  it('refuses once everything is back', () => {
    expect(planRefund({ amountPaidPence: 8500, alreadyRefundedPence: 8500, providerHeldPence: 0, request: 'full' }))
      .toEqual({ ok: false, error: 'This booking has already been refunded in full.' });
  });

  it('rejects zero, negative and fractional pence', () => {
    for (const request of [0, -100, 12.5, Number.NaN]) {
      expect(planRefund({ ...fresh, request }).ok).toBe(false);
    }
  });

  it('never trusts a held figure larger than what is left to refund', () => {
    const p = planRefund({ amountPaidPence: 8500, alreadyRefundedPence: 8000, providerHeldPence: 8000, request: 'full' });
    expect(p).toEqual({ ok: true, refundPence: 500, payoutAdjustPence: 500, isFinalRefund: true });
  });
});

describe('adjustPayout', () => {
  it('reduces the payout and reports when it is emptied', () => {
    expect(adjustPayout(2000, 500)).toEqual({ newAmountPence: 1500, emptied: false });
    expect(adjustPayout(2000, 2000)).toEqual({ newAmountPence: 0, emptied: true });
    expect(adjustPayout(2000, 9999)).toEqual({ newAmountPence: 0, emptied: true });
  });
});
