import {
  classifyTransferFailure, nextPayoutRetryAt, PAYOUT_MAX_ATTEMPTS, summarizeMoneyAttention,
} from '../../supabase/functions/_shared/payoutRetry';

const now = new Date('2026-10-21T10:00:00Z');
const daysLater = (d: Date | null) => (d ? (d.getTime() - now.getTime()) / 86_400_000 : null);

describe('nextPayoutRetryAt', () => {
  it('tries again 1, 2 and then 4 days after each failure, then stops', () => {
    expect([1, 2, 3, 4].map(n => daysLater(nextPayoutRetryAt(n, now)))).toEqual([1, 2, 4, null]);
    expect(PAYOUT_MAX_ATTEMPTS).toBe(4);
  });
});

describe('classifyTransferFailure', () => {
  it("knows the app's own balance from the provider's account", () => {
    expect(classifyTransferFailure(Object.assign(new Error('Insufficient funds in Stripe account'), { code: 'balance_insufficient' }))).toBe('platform_balance');
    expect(classifyTransferFailure(Object.assign(new Error('x'), { code: 'insufficient_capabilities_for_transfer' }))).toBe('provider_account');
    expect(classifyTransferFailure(new Error('Your destination account needs to have at least one of the following capabilities enabled: transfers'))).toBe('provider_account');
    expect(classifyTransferFailure(new Error('Request timed out'))).toBe('other');
    expect(classifyTransferFailure('not even an error')).toBe('other');
  });
});

describe('summarizeMoneyAttention', () => {
  it('words each waiting thing for the daily email', () => {
    const lines = summarizeMoneyAttention({
      failed: [
        { payout_id: 'p1', provider_name: 'Lash Lab', amount_pence: 4500, status: 'held', attempt_count: 1, failure_cause: 'platform_balance', next_try_at: '2026-10-22T10:00:00Z' },
        { payout_id: 'p2', provider_name: null, amount_pence: 12000, status: 'failed', attempt_count: 4, failure_cause: 'provider_account', next_try_at: null },
      ],
      owed: [{ shortfall_id: 's1', provider_name: 'Brow Bar', owed_pence: 1850 }],
      refunds: [
        { request_id: 'r1', status: 'under_review', client_name: 'Amy', provider_name: 'Lash Lab', service_name: 'Lash lift', paid_pence: 6000, refunded_pence: 1000 },
        { request_id: 'r2', status: 'with_provider', client_name: null, provider_name: null, service_name: null, paid_pence: 3500, refunded_pence: 0 },
      ],
    });
    expect(lines.failed).toEqual([
      { title: "Lash Lab: The app's Stripe balance was too low to send it. Next try 22 Oct", amount: '£45.00' },
      { title: "Unknown provider: The provider's Stripe account can't receive money yet. Tried 4 of 4 times, needs you", amount: '£120.00' },
    ]);
    expect(lines.owed).toEqual([{ title: 'Brow Bar: comes out of their next payment', amount: '£18.50' }]);
    expect(lines.refunds).toEqual([
      { title: 'Needs you: Amy, Lash lift with Lash Lab', amount: '£50.00' },
      { title: 'With the provider: Client, booking with their provider', amount: '£35.00' },
    ]);
  });
});
