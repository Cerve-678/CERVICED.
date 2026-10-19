import { feeCardNeededUntilMs } from '../../supabase/functions/_shared/bookingFeePlan';
import { londonWallTimeToUtcMs } from '../../supabase/functions/_shared/londonTime';
import { getPaymentRequestError } from '../utils/paymentRequestError';

// A 14:00–15:00 UK appointment on a summer date (BST): ends 14:00 UTC.
const endMs = londonWallTimeToUtcMs('2026-07-01', '15:00:00');
const base = {
  status: 'confirmed', endMs, lateFeePence: 1000, noShowFeePence: 2000,
  alreadyCharged: false, nowMs: Date.UTC(2026, 6, 1, 10, 0),
};

describe('card needed for an agreed fee', () => {
  it('is locked until 24 hours after the appointment ends', () => {
    expect(feeCardNeededUntilMs(base)).toBe(Date.UTC(2026, 6, 2, 14, 0));
  });

  it('frees up once the 24-hour window has passed', () => {
    expect(feeCardNeededUntilMs({ ...base, nowMs: Date.UTC(2026, 6, 2, 14, 0) })).toBeNull();
  });

  it('is never locked without an agreed fee, after a charge, or on a cancelled booking', () => {
    expect(feeCardNeededUntilMs({ ...base, lateFeePence: null, noShowFeePence: null })).toBeNull();
    expect(feeCardNeededUntilMs({ ...base, alreadyCharged: true })).toBeNull();
    expect(feeCardNeededUntilMs({ ...base, status: 'cancelled' })).toBeNull();
  });
});

describe('removing a card a fee still needs', () => {
  it('tells the client when they can remove it', async () => {
    const error = await getPaymentRequestError(null, { code: 'card_needed_for_fee', until: '3:00pm on Thu 2 Jul' }, 'fallback');
    expect(error.message).toBe('This card is needed for a late or no-show fee you agreed to. You can remove it after 3:00pm on Thu 2 Jul.');
  });
});
