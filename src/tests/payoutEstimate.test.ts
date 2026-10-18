import { estimatePaymentArrival, paymentArrivalSentence } from '../utils/payoutEstimate';

const daily = { interval: 'daily', weeklyAnchor: null, monthlyAnchor: null };
const unix = (iso: string) => Date.parse(iso) / 1000;

test('a booking paid a week ahead is in Stripe when our hold ends, and in the bank the next working day after', () => {
  // Client paid 1 Oct (Stripe date 6 Oct); appointment 8 Oct, 24h hold → release Fri 9 Oct.
  const arrival = estimatePaymentArrival({ status: 'held', releaseAfter: '2026-10-09T12:00:00Z', availableOn: unix('2026-10-06T00:00:00Z'), schedule: daily })!;
  expect(arrival.inStripe.toISOString()).toBe('2026-10-09T12:00:00.000Z');
  expect(arrival.inBank!.toISOString().slice(0, 10)).toBe('2026-10-12'); // Fri → next working day is Mon 12
});

test('a same-day booking waits for Stripe’s date, not our release', () => {
  // Paid and done Mon 12 Oct; release Tue 13 Oct; Stripe date Thu 15 Oct.
  const arrival = estimatePaymentArrival({ status: 'held', releaseAfter: '2026-10-13T12:00:00Z', availableOn: unix('2026-10-15T00:00:00Z'), schedule: daily })!;
  expect(arrival.inStripe.toISOString().slice(0, 10)).toBe('2026-10-15');
  expect(arrival.inBank!.toISOString().slice(0, 10)).toBe('2026-10-16');
});

test('money landing at the weekend goes out on Monday and arrives Tuesday', () => {
  const arrival = estimatePaymentArrival({ status: 'transferred', releaseAfter: '2026-10-01T00:00:00Z', availableOn: unix('2026-10-17T00:00:00Z'), schedule: daily })!;
  expect(arrival.inBank!.toISOString().slice(0, 10)).toBe('2026-10-20');
});

test('a weekly schedule waits for the payout day', () => {
  const weekly = { interval: 'weekly', weeklyAnchor: 'friday', monthlyAnchor: null };
  const arrival = estimatePaymentArrival({ status: 'transferred', releaseAfter: '2026-10-01T00:00:00Z', availableOn: unix('2026-10-13T00:00:00Z'), schedule: weekly })!;
  expect(arrival.inBank!.toISOString().slice(0, 10)).toBe('2026-10-19'); // paid out Fri 16, arrives Mon 19
});

test('a manual schedule gives no bank date, and says why', () => {
  const arrival = estimatePaymentArrival({ status: 'transferred', releaseAfter: '2026-10-01T00:00:00Z', availableOn: unix('2026-10-13T00:00:00Z'), schedule: { interval: 'manual', weeklyAnchor: null, monthlyAnchor: null } })!;
  expect(arrival.inBank).toBeNull();
  expect(paymentArrivalSentence(arrival, new Date('2026-10-20T00:00:00Z'))).toContain('You choose when to pay it out');
});

test('cancelled or returned payments get no estimate', () => {
  expect(estimatePaymentArrival({ status: 'cancelled', releaseAfter: '2026-10-01T00:00:00Z', availableOn: null, schedule: daily })).toBeNull();
});

test('the sentence names both dates', () => {
  const arrival = estimatePaymentArrival({ status: 'held', releaseAfter: '2026-10-13T12:00:00Z', availableOn: unix('2026-10-15T00:00:00Z'), schedule: daily })!;
  expect(paymentArrivalSentence(arrival, new Date('2026-10-12T09:00:00Z'))).toBe('In your Stripe balance from Thu 15 Oct. Expected in your bank around Fri 16 Oct.');
});
