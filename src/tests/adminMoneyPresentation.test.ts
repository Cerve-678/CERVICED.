import {
  describeFailedPayout, describeOwed, describeRefundRequest, nextPayoutRun, parsePounds, PAYOUT_MAX_ATTEMPTS,
} from '../features/admin/moneyPresentation';
import { PAYOUT_MAX_ATTEMPTS as SERVER_MAX_ATTEMPTS } from '../../supabase/functions/_shared/payoutRetry';
import type { AdminFailedPayout, AdminRefundRequest } from '../types/adminMoney';

const failed: AdminFailedPayout = {
  payout_id: 'p1', booking_id: 'b1', provider_id: 'pr1', provider_name: 'Lash Lab', amount_pence: 4500,
  status: 'held', attempt_count: 1, failure_cause: 'platform_balance', last_failed_at: '2026-10-21T10:00:00Z',
  next_try_at: '2026-10-22T10:00:00Z', service_name: 'Lash lift', booking_date: '2026-10-18',
};

// Before the automatic try in `failed` is due.
const before = new Date('2026-10-21T12:00:00Z');

describe('admin money presentation', () => {
  it('counts tries the same way the payout job does', () => {
    expect(PAYOUT_MAX_ATTEMPTS).toBe(SERVER_MAX_ATTEMPTS);
  });

  it('offers a retry unless the provider has to fix their account first', () => {
    expect(describeFailedPayout(failed, before)).toMatchObject({ amount: '£45.00', canRetry: true, waitingNote: null, queued: false });
    expect(describeFailedPayout(failed, before).tries).toMatch(/^Tried 1 of 4\. Next automatic try: /);
    const waiting = describeFailedPayout({ ...failed, failure_cause: 'provider_account' }, before);
    expect(waiting.canRetry).toBe(false);
    expect(waiting.waitingNote).toMatch(/provider has been told/);
    // Out of tries: a person can always try again.
    const out = describeFailedPayout({ ...failed, status: 'failed', attempt_count: 4, failure_cause: 'provider_account', next_try_at: null }, before);
    expect(out).toMatchObject({ canRetry: true, queued: false, tries: 'Tried 4 times. No more automatic tries.' });
  });

  it('shows a retried payment as on its way in the next run, with no button', () => {
    // admin_retry_payout sets it back to held, due now.
    const retried = { ...failed, attempt_count: 4, next_try_at: '2026-10-22T13:31:00Z' };
    const view = describeFailedPayout(retried, new Date('2026-10-22T13:31:05Z'));
    expect(view).toMatchObject({ queued: true, canRetry: false, waitingNote: null, tries: 'Tried 4 of 4.' });
    expect(view.queuedNote).toMatch(/^Goes out by \d{1,2}:\d{2}(am|pm)\. This card goes away once it's sent\.$/);
    // The phone's clock a minute behind the server's still counts as due.
    expect(describeFailedPayout(retried, new Date('2026-10-22T13:30:00Z')).queued).toBe(true);
    // Due, even though the provider's account caused the last failure.
    expect(describeFailedPayout({ ...retried, failure_cause: 'provider_account' }, new Date('2026-10-22T13:32:00Z')))
      .toMatchObject({ queued: true, waitingNote: null });
  });

  it('picks the quarter-hour run after the payment is due', () => {
    const now = new Date('2026-10-22T13:31:05Z');
    expect(nextPayoutRun(new Date('2026-10-22T13:31:00Z'), now).toISOString()).toBe('2026-10-22T13:45:00.000Z');
    expect(nextPayoutRun(new Date('2026-10-22T13:20:00Z'), now).toISOString()).toBe('2026-10-22T13:45:00.000Z');
    expect(nextPayoutRun(new Date('2026-10-22T13:46:00Z'), now).toISOString()).toBe('2026-10-22T14:00:00.000Z');
  });

  it('says why a provider owes money', () => {
    expect(describeOwed({ shortfall_id: 's1', provider_id: 'pr1', provider_name: null, owed_pence: 1850, source: 'bank_dispute', created_at: '', service_name: null }))
      .toMatchObject({ name: 'Unknown provider', amount: '£18.50', why: expect.stringMatching(/bank took the money back/) });
  });

  it('flags only passed-on refund requests as needing an admin', () => {
    const r: AdminRefundRequest = {
      request_id: 'r1', booking_id: 'b1', status: 'with_provider', reason: 'The provider cancelled', message: null,
      provider_note: null, created_at: '2026-10-20T09:00:00Z', passed_to_cerviced_at: null, client_name: 'Amy',
      provider_name: 'Lash Lab', service_name: 'Lash lift', booking_date: '2026-10-18', paid_pence: 6000, refunded_pence: 1000,
    };
    const now = new Date('2026-10-21T12:00:00Z');
    expect(describeRefundRequest(r, now)).toMatchObject({ needsYou: false, status: 'WITH PROVIDER · DAY 2', amount: '£50.00', remainingPence: 5000 });
    expect(describeRefundRequest({ ...r, status: 'under_review' }, now)).toMatchObject({ needsYou: true, status: 'NEEDS YOU' });
  });

  it('reads typed amounts as pence', () => {
    expect(parsePounds('45')).toBe(4500);
    expect(parsePounds('£45.5')).toBe(4550);
    expect(parsePounds(' 1,200.00 ')).toBe(120000);
    expect(parsePounds('0')).toBeNull();
    expect(parsePounds('4.555')).toBeNull();
    expect(parsePounds('abc')).toBeNull();
  });
});
