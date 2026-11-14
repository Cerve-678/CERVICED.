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

describe('late cancellation fee', () => {
  const cancel: FeeEligibilityInput = {
    ...base, kind: 'late_cancel', status: 'cancelled', lateFeePence: null, noShowFeePence: null,
    lateCancelFeePence: 3000, lateClientCancel: true,
    // The morning of the appointment, before it starts.
    nowMs: Date.UTC(2026, 6, 1, 9, 0),
  };

  test('charges the frozen amount right after a late cancel, before the start', () => {
    expect(checkFeeEligibility(cancel)).toEqual({ ok: true, amountPence: 3000 });
  });

  test('until 24 hours after the appointment would have ended', () => {
    const endUtc = Date.UTC(2026, 6, 1, 14, 0);
    expect(checkFeeEligibility({ ...cancel, nowMs: endUtc + 24 * 3600e3 }).ok).toBe(true);
    expect(checkFeeEligibility({ ...cancel, nowMs: endUtc + 24 * 3600e3 + 1 }).ok).toBe(false);
  });

  test('only on a booking the client cancelled late, with an agreed amount', () => {
    expect(checkFeeEligibility({ ...cancel, lateClientCancel: false }).ok).toBe(false);
    expect(checkFeeEligibility({ ...cancel, status: 'confirmed' }).ok).toBe(false);
    expect(checkFeeEligibility({ ...cancel, lateCancelFeePence: null }).ok).toBe(false);
    expect(checkFeeEligibility({ ...cancel, clientConsented: false }).ok).toBe(false);
    expect(checkFeeEligibility({ ...cancel, alreadyCharged: true }).ok).toBe(false);
  });
});
