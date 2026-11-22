import { checkFeeEligibility, isVisitFee, sameVisit, VISIT_ALREADY_CHARGED, type FeeEligibilityInput } from '../../supabase/functions/_shared/bookingFeePlan';
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

  test('stays per booking: another service in the visit having a fee does not block it', () => {
    expect(checkFeeEligibility({ ...cancel, visitAlreadyCharged: true }).ok).toBe(true);
  });
});

describe('late and no-show fees are once per visit', () => {
  test('refused when another service in the same visit already has one', () => {
    expect(checkFeeEligibility({ ...base, visitAlreadyCharged: true })).toEqual({ ok: false, error: VISIT_ALREADY_CHARGED });
    expect(checkFeeEligibility({ ...base, kind: 'no_show', status: 'no_show', visitAlreadyCharged: true }).ok).toBe(false);
    expect(checkFeeEligibility({ ...base, visitAlreadyCharged: false }).ok).toBe(true);
  });

  test('only late and no-show fees count as visit fees', () => {
    expect(isVisitFee('late')).toBe(true);
    expect(isVisitFee('no_show')).toBe(true);
    expect(isVisitFee('late_cancel')).toBe(false);
  });

  test('a visit is the same provider, client and day', () => {
    const a = { provider_id: 'p1', user_id: 'c1', booking_date: '2026-07-01' };
    expect(sameVisit(a, { ...a })).toBe(true);
    expect(sameVisit(a, { ...a, provider_id: 'p2' })).toBe(false);
    expect(sameVisit(a, { ...a, user_id: 'c2' })).toBe(false);
    expect(sameVisit(a, { ...a, booking_date: '2026-07-02' })).toBe(false);
  });
});
