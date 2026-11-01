import {
  computeCancellationSettlement,
  readCancelPenalty,
  type CancellationSettlementInput,
} from '../../supabase/functions/_shared/cancellationSettlement';

// A £50 service: client paid £55 (£50 service + £5 platform fee), £10 deposit,
// provider's payout share £50 (the service money; platform keeps the £5 fee).
const base: CancellationSettlementInput = {
  penalty: 'none',
  isLateCancel: true,
  amountPaidPence: 5500,
  depositPence: 1000,
  platformFeePence: 500,
  payoutAmountPence: 5000,
  paidDepositOnly: false,
};

describe('computeCancellationSettlement', () => {
  it('refunds everything (fee included) on an early cancel, whatever the penalty', () => {
    for (const penalty of ['none', 'deposit', 'half'] as const) {
      const s = computeCancellationSettlement({ ...base, penalty, isLateCancel: false });
      expect(s.clientRefundPence).toBe(5500);
      expect(s.providerKeepPence).toBe(0);
      expect(s.reverseFromPayoutPence).toBe(5000);
    }
  });

  it('refunds everything (fee included) on a late cancel when the penalty is none', () => {
    const s = computeCancellationSettlement({ ...base, penalty: 'none', isLateCancel: true });
    expect(s.clientRefundPence).toBe(5500);
    expect(s.providerKeepPence).toBe(0);
    expect(s.reverseFromPayoutPence).toBe(5000);
  });

  it('keeps the deposit for the provider and the fee for the platform on a late deposit penalty', () => {
    const s = computeCancellationSettlement({ ...base, penalty: 'deposit', isLateCancel: true });
    // client gets 5500 − 1000 deposit − 500 fee = 4000
    expect(s.clientRefundPence).toBe(4000);
    expect(s.providerKeepPence).toBe(1000);
    expect(s.reverseFromPayoutPence).toBe(4000); // 5000 payout − 1000 kept
    // Conservation: refund + providerKeep + fee === amountPaid
    expect(s.clientRefundPence + s.providerKeepPence + base.platformFeePence).toBe(base.amountPaidPence);
  });

  it('gives the provider half on a late half penalty when the client paid in full, and the client the other half', () => {
    const s = computeCancellationSettlement({ ...base, penalty: 'half', isLateCancel: true });
    expect(s.clientRefundPence).toBe(2500);
    expect(s.providerKeepPence).toBe(2500);
    expect(s.reverseFromPayoutPence).toBe(2500);
    expect(s.clientRefundPence + s.providerKeepPence + base.platformFeePence).toBe(base.amountPaidPence);
  });

  it('sends an odd penny to the client, not the provider', () => {
    const s = computeCancellationSettlement({ ...base, penalty: 'half', amountPaidPence: 5501, payoutAmountPence: 5001 });
    expect(s.providerKeepPence).toBe(2500);
    expect(s.clientRefundPence).toBe(2501);
  });

  it('caps a large deposit at half when the client paid in full', () => {
    // £100 service paid in full, £60 deposit on the policy, £5 fee.
    const s = computeCancellationSettlement({
      penalty: 'deposit', isLateCancel: true, paidDepositOnly: false,
      amountPaidPence: 10500, depositPence: 6000, platformFeePence: 500, payoutAmountPence: 10000,
    });
    expect(s.providerKeepPence).toBe(5000);
    expect(s.clientRefundPence).toBe(5000);
  });

  it('lets the provider keep a whole large deposit when a deposit is all the client paid', () => {
    // £100 service, £60 deposit paid, £3.99 fee: no half cap on a deposit.
    for (const penalty of ['deposit', 'half'] as const) {
      const s = computeCancellationSettlement({
        penalty, isLateCancel: true, paidDepositOnly: true,
        amountPaidPence: 6399, depositPence: 6000, platformFeePence: 399, payoutAmountPence: 6000,
      });
      expect(s.providerKeepPence).toBe(6000);
      expect(s.clientRefundPence).toBe(0);
    }
  });

  it('never lets a provider keep more than half of a booking paid in full, whatever the policy', () => {
    for (const penalty of ['none', 'deposit', 'half'] as const) {
      const s = computeCancellationSettlement({
        penalty, isLateCancel: true, paidDepositOnly: false,
        amountPaidPence: 20599, depositPence: 19000, platformFeePence: 599, payoutAmountPence: 20000,
      });
      expect(s.providerKeepPence).toBeLessThanOrEqual(10000);
    }
  });

  it('reads an old saved "full" policy as half, and anything unknown as no penalty', () => {
    expect(readCancelPenalty('full')).toBe('half');
    expect(readCancelPenalty('half')).toBe('half');
    expect(readCancelPenalty('deposit')).toBe('deposit');
    expect(readCancelPenalty('')).toBe('none');
    expect(readCancelPenalty(undefined)).toBe('none');
  });

  it('is a no-op when nothing was captured (Stripe off / free booking)', () => {
    const s = computeCancellationSettlement({ ...base, amountPaidPence: 0, depositPence: 0, platformFeePence: 0, payoutAmountPence: 0, penalty: 'half' });
    expect(s).toEqual({ clientRefundPence: 0, providerKeepPence: 0, reverseFromPayoutPence: 0 });
  });

  it('never refunds more than was paid and never keeps more than the payout', () => {
    // Pathological: deposit recorded larger than the payout share.
    const s = computeCancellationSettlement({
      penalty: 'deposit', isLateCancel: true, paidDepositOnly: true,
      amountPaidPence: 2000, depositPence: 9999, platformFeePence: 200, payoutAmountPence: 1800,
    });
    expect(s.providerKeepPence).toBe(1800); // capped at the payout
    expect(s.clientRefundPence).toBe(0); // 2000 − 1800 − 200 = 0
    expect(s.clientRefundPence).toBeLessThanOrEqual(2000);
  });

  it('handles a deposit-only booking (client paid just the deposit + fee)', () => {
    // Client paid a £10 deposit + £0.99 deposit-checkout fee = £10.99; payout share £10.
    const s = computeCancellationSettlement({
      penalty: 'half', isLateCancel: true, paidDepositOnly: true,
      amountPaidPence: 1099, depositPence: 1000, platformFeePence: 99, payoutAmountPence: 1000,
    });
    // Provider keeps their £10, platform keeps the 99p, client gets 0 — NOT charged the unpaid balance.
    expect(s.clientRefundPence).toBe(0);
    expect(s.providerKeepPence).toBe(1000);
  });
});
