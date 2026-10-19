import { feeChargeWindow, feeDisputeOpen, liveFee } from '../features/bookings/bookingFeeRules';
import type { BookingFeeCharge, BookingFeeTerms } from '../services/databaseService';

const terms: BookingFeeTerms = { status: 'completed', bookingDate: '2026-07-01', bookingTime: '14:00:00', endTime: '15:00:00', lateFeePence: 1000, noShowFeePence: 2000 };
const end = new Date('2026-07-01T15:00:00').getTime();
const charge = (over: Partial<BookingFeeCharge>): BookingFeeCharge => ({
  id: 'c', kind: 'late', amountPence: 1000, status: 'succeeded', chargedAt: '2026-07-01T16:00:00Z', payBy: null, nextRetryAt: null, createdAt: '2026-07-01T16:00:00Z',
  disputedAt: null, disputeReason: null, disputeOutcome: null, disputeResponse: null, disputeResolvedAt: null, ...over,
});

test('offers a late fee on a booking that went ahead, until 24 hours after it ends', () => {
  expect(feeChargeWindow(terms, end).canCharge).toEqual({ late: true, no_show: false });
  expect(feeChargeWindow(terms, end + 24 * 3600e3 + 1).open).toBe(false);
});

test('offers the no-show fee only once the booking is marked no-show', () => {
  expect(feeChargeWindow({ ...terms, status: 'no_show' }, end).canCharge).toEqual({ late: false, no_show: true });
});

test('a failed attempt never counts as the live fee', () => {
  expect(liveFee([charge({ id: 'f', status: 'failed' })])).toBeNull();
  expect(liveFee([charge({ id: 'f', status: 'failed' }), charge({ id: 'ok' })])?.id).toBe('ok');
});

test('a client can dispute for 7 days after the charge', () => {
  const charged = Date.parse('2026-07-01T16:00:00Z');
  expect(feeDisputeOpen(charge({}), charged + 7 * 24 * 3600e3)).toBe(true);
  expect(feeDisputeOpen(charge({}), charged + 7 * 24 * 3600e3 + 1)).toBe(false);
  expect(feeDisputeOpen(charge({ status: 'refunded' }), charged)).toBe(false);
});
