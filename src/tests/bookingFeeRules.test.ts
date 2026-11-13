import { feeChargeWindow, feeDisputeOpen, isChargeableLateCancel, liveFee } from '../features/bookings/bookingFeeRules';
import type { BookingFeeCharge, BookingFeeTerms } from '../services/databaseService';

const terms: BookingFeeTerms = {
  status: 'completed', bookingDate: '2026-07-01', bookingTime: '14:00:00', endTime: '15:00:00', lateFeePence: 1000, noShowFeePence: 2000,
  lateCancelFeePence: null, depositPence: 0, paymentStatus: 'fully_paid', cancelledBy: null, cancelledAt: null, confirmedAt: '2026-06-20T10:00:00Z',
  cancelNoticeHours: 24, lateRescheduleFrom: null, cancelPenalty: 'half',
};
// Cancelled by the client 6 hours before a 14:00 start, deposit only, half policy.
const lateCancelled: BookingFeeTerms = {
  ...terms, status: 'cancelled', lateFeePence: null, noShowFeePence: null, lateCancelFeePence: 3000, depositPence: 2000,
  paymentStatus: 'deposit_paid', cancelledBy: 'client', cancelledAt: new Date('2026-07-01T08:00:00').toISOString(),
};
const end = new Date('2026-07-01T15:00:00').getTime();
const charge = (over: Partial<BookingFeeCharge>): BookingFeeCharge => ({
  id: 'c', kind: 'late', amountPence: 1000, status: 'succeeded', chargedAt: '2026-07-01T16:00:00Z', payBy: null, nextRetryAt: null, createdAt: '2026-07-01T16:00:00Z',
  disputedAt: null, disputeReason: null, disputeOutcome: null, disputeResponse: null, disputeResolvedAt: null, ...over,
});

test('offers a late fee on a booking that went ahead, until 24 hours after it ends', () => {
  expect(feeChargeWindow(terms, end).canCharge).toEqual({ late: true, no_show: false, late_cancel: false });
  expect(feeChargeWindow(terms, end + 24 * 3600e3 + 1).open).toBe(false);
});

test('offers the no-show fee only once the booking is marked no-show', () => {
  expect(feeChargeWindow({ ...terms, status: 'no_show' }, end).canCharge).toEqual({ late: false, no_show: true, late_cancel: false });
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

test('offers the late cancellation fee straight after a late cancel, until 24 hours after the end', () => {
  const cancelledAt = new Date('2026-07-01T08:00:00').getTime();
  expect(feeChargeWindow(lateCancelled, cancelledAt + 60e3).canCharge.late_cancel).toBe(true);
  expect(feeChargeWindow(lateCancelled, end + 24 * 3600e3 + 1).canCharge.late_cancel).toBe(false);
});

test('no late cancellation fee for an early cancel, a provider cancel, a full payment or another policy', () => {
  expect(isChargeableLateCancel(lateCancelled)).toBe(true);
  expect(isChargeableLateCancel({ ...lateCancelled, cancelledAt: new Date('2026-06-30T08:00:00').toISOString() })).toBe(false);
  expect(isChargeableLateCancel({ ...lateCancelled, cancelledBy: 'provider' })).toBe(false);
  expect(isChargeableLateCancel({ ...lateCancelled, confirmedAt: null })).toBe(false);
  expect(isChargeableLateCancel({ ...lateCancelled, paymentStatus: 'fully_paid' })).toBe(false);
  expect(isChargeableLateCancel({ ...lateCancelled, cancelPenalty: 'deposit' })).toBe(false);
  expect(isChargeableLateCancel({ ...lateCancelled, cancelNoticeHours: 0 })).toBe(false);
  // Moved after the window started: late however early the cancel.
  expect(isChargeableLateCancel({ ...lateCancelled, cancelledAt: new Date('2026-06-28T08:00:00').toISOString(), lateRescheduleFrom: '2026-06-27' })).toBe(true);
});
