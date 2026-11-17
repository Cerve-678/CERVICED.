import { bookingPaymentTimeline, payoutStatusLabel, tipStatusLabel } from '../features/payments/bookingPaymentTimeline';
import type { ProviderPayout, ProviderTipEarning } from '../services/providerPaymentService';

const row = (over: Partial<ProviderPayout> = {}): ProviderPayout => ({
  id: 'p', booking_id: 'b', payout_amount: 6800, gross_amount: 7500, platform_fee: 700, currency: 'gbp',
  status: 'held', created_at: '2026-11-02T20:14:00Z',
  // Appointment ends 16:00 on the 12th, so processing runs to 16:00 on the 13th.
  release_after: '2026-11-13T16:00:00Z',
  booking: { service_name_snapshot: 'Classic lash set', customer_name: 'Amara O.', booking_date: '2026-11-12', booking_time: '14:00:00', end_time: '16:00:00', status: 'completed', group_booking_id: null },
  refundRequestOpen: false, bankDispute: null, ...over,
});
const tip = (over: Partial<ProviderTipEarning> = {}): ProviderTipEarning => ({
  id: 't', bookingId: 'b', amountPence: 1000, payoutPence: 1000, payoutStatus: 'held',
  releaseAfter: null, paidAt: '2026-11-12T18:10:00Z', serviceName: 'Classic lash set', customerName: 'Amara O.',
  ...over,
} as ProviderTipEarning);
const opts = (iso: string) => ({ now: new Date(iso), scheduleSentence: 'Stripe pays your bank on the 1st of each month.' });
const shape = (steps: ReturnType<typeof bookingPaymentTimeline>) => steps.map(s => `${s.key}:${s.state}`);

test('before the appointment, the appointment is where it is now', () => {
  expect(shape(bookingPaymentTimeline(row(), [], opts('2026-11-10T09:00:00Z')))).toEqual([
    'paid:done', 'appointment:now', 'processing:next', 'sent:next', 'bank:next',
  ]);
});

test('in the 24 hours after the appointment it is processing, and a tip sits on the timeline with its amount', () => {
  const steps = bookingPaymentTimeline(row(), [tip()], opts('2026-11-13T09:00:00Z'));
  expect(shape(steps)).toEqual([
    'paid:done', 'appointment:done', 'tip-t:done', 'processing:now', 'sent:next', 'bank:next',
  ]);
  expect(steps.find(s => s.key === 'tip-t')?.amountPence).toBe(1000);
  expect(steps.find(s => s.key === 'processing')?.explainsProcessing).toBe(true);
  expect(steps.find(s => s.key === 'bank')?.when).toBe('Stripe pays your bank on the 1st of each month.');
});

test('once sent on, it is waiting for payday', () => {
  expect(shape(bookingPaymentTimeline(row({ status: 'transferred' }), [], opts('2026-11-17T09:00:00Z')))).toEqual([
    'paid:done', 'appointment:done', 'processing:done', 'sent:now', 'bank:next',
  ]);
});

test('a refund request holds it, and says so', () => {
  const steps = bookingPaymentTimeline(row({ refundRequestOpen: true }), [], opts('2026-11-17T09:00:00Z'));
  expect(shape(steps)).toEqual([
    'paid:done', 'appointment:done', 'processing:done', 'refund:now', 'sent:next', 'bank:next',
  ]);
  expect(payoutStatusLabel(row({ refundRequestOpen: true }))).toBe('On hold · refund request');
});

test('an open bank dispute is where it is now; a lost one ends the timeline', () => {
  const open = bookingPaymentTimeline(row({ status: 'transferred', bankDispute: { stage: 'open', paidBackPence: 0 } }), [], opts('2026-11-17T09:00:00Z'));
  expect(shape(open)).toEqual(['paid:done', 'appointment:done', 'processing:done', 'dispute:now', 'sent:done', 'bank:next']);
  const lost = bookingPaymentTimeline(row({ status: 'reversed', bankDispute: { stage: 'lost', paidBackPence: 0 } }), [], opts('2026-11-30T09:00:00Z'));
  expect(lost.map(s => s.key)).not.toContain('bank');
});

test('plain words for every status, no Stripe jargon', () => {
  expect(payoutStatusLabel(row())).toBe('Processing');
  expect(payoutStatusLabel(row({ status: 'transferred' }))).toBe('Sent for payday');
  expect(tipStatusLabel(tip({ payoutStatus: 'transferred' }))).toBe('Sent for payday');
  for (const status of ['held', 'transferred', 'failed', 'cancelled', 'reversed'] as const) {
    expect(payoutStatusLabel(row({ status }))).not.toMatch(/Stripe|release/i);
  }
});
