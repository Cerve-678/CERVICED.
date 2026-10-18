import { checkFeeEligibility, type FeeEligibilityInput } from '../../supabase/functions/_shared/bookingFeePlan';
import { londonWallTimeToUtcMs } from '../../supabase/functions/_shared/londonTime';

// 14:00–15:00 UK on a summer date (BST, UTC+1): 13:00–14:00 UTC.
const base: FeeEligibilityInput = {
  kind: 'late', status: 'completed',
  startMs: londonWallTimeToUtcMs('2026-07-01', '14:00:00'),
  endMs: londonWallTimeToUtcMs('2026-07-01', '15:00:00'),
  lateFeePence: 1000, noShowFeePence: 2000,
  paidInApp: true, clientConsented: true, alreadyCharged: false,
  nowMs: Date.UTC(2026, 6, 1, 15, 0),
};

test('charges the frozen amount for the right kind', () => {
  expect(checkFeeEligibility(base)).toEqual({ ok: true, amountPence: 1000 });
  expect(checkFeeEligibility({ ...base, kind: 'no_show', status: 'no_show' })).toEqual({ ok: true, amountPence: 2000 });
});

test('only within 24 hours of the end, judged in UK time, and never before the start', () => {
  const endUtc = Date.UTC(2026, 6, 1, 14, 0);
  expect(checkFeeEligibility({ ...base, nowMs: endUtc + 24 * 3600e3 }).ok).toBe(true);
  expect(checkFeeEligibility({ ...base, nowMs: endUtc + 24 * 3600e3 + 1 }).ok).toBe(false);
  expect(checkFeeEligibility({ ...base, nowMs: Date.UTC(2026, 6, 1, 12, 59) }).ok).toBe(false);
});

test('a no-show fee needs the booking marked no-show; a late fee needs it to have gone ahead', () => {
  expect(checkFeeEligibility({ ...base, kind: 'no_show', status: 'completed' }).ok).toBe(false);
  expect(checkFeeEligibility({ ...base, status: 'cancelled' }).ok).toBe(false);
  expect(checkFeeEligibility({ ...base, status: 'no_show' }).ok).toBe(false);
});

test('refuses without a fee, consent, an in-app payment, or when already charged', () => {
  expect(checkFeeEligibility({ ...base, lateFeePence: null }).ok).toBe(false);
  expect(checkFeeEligibility({ ...base, clientConsented: false }).ok).toBe(false);
  expect(checkFeeEligibility({ ...base, paidInApp: false }).ok).toBe(false);
  expect(checkFeeEligibility({ ...base, alreadyCharged: true }).ok).toBe(false);
});
