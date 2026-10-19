import { nextRetryAt, termsAllowRetries } from '../../supabase/functions/_shared/feeRetrySchedule';

// Declined fees are retried on the saved card about 1, 3 and 6 days into the
// 7-day request, at most three times, and only on wording that says so.
const DAY = 86_400_000;
const start = Date.UTC(2026, 9, 19, 12, 0);
const payBy = start + 7 * DAY;

describe('fee retry schedule', () => {
  it('retries on days 1, 3 and 6, then stops', () => {
    expect(nextRetryAt(start, 0, payBy)).toBe(new Date(start + DAY).toISOString());
    expect(nextRetryAt(start, 1, payBy)).toBe(new Date(start + 3 * DAY).toISOString());
    expect(nextRetryAt(start, 2, payBy)).toBe(new Date(start + 6 * DAY).toISOString());
    expect(nextRetryAt(start, 3, payBy)).toBeNull();
  });

  it('never schedules a retry after the request closes', () => {
    expect(nextRetryAt(start, 2, start + 5 * DAY)).toBeNull();
  });

  it('only retries agreements on the wording that allows it', () => {
    expect(termsAllowRetries('2026-10-19-retries')).toBe(true);
    expect(termsAllowRetries('2026-10-19')).toBe(false);
    expect(termsAllowRetries('2026-10-18')).toBe(false);
    expect(termsAllowRetries(null)).toBe(false);
  });
});
