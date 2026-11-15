import {
  disputePayoutVerdict, MAX_BOOKINGS_TO_MATCH, planDisputeAttribution,
} from '../../supabase/functions/_shared/disputePlan';

const booking = (bookingId: string, paidPence: number, refundedPence = 0) => ({ bookingId, paidPence, refundedPence });

describe('working out which bookings a bank dispute is about', () => {
  // The handbook's example: three providers, £30 + £45 + £60, one £142.15 payment.
  const cart = [booking('a', 3159), booking('b', 4738), booking('c', 6318)];

  test('a payment for one booking is always about that booking, whatever the amount', () => {
    expect(planDisputeAttribution(500, [booking('only', 6340)])).toEqual({ kind: 'single_booking', disputed: ['only'] });
  });

  test("an amount that matches one booking takes back from that provider only", () => {
    expect(planDisputeAttribution(4738, cart)).toEqual({ kind: 'amount', disputed: ['b'] });
  });

  test('an amount that matches two bookings together takes back from both and leaves the third alone', () => {
    expect(planDisputeAttribution(3159 + 6318, cart)).toEqual({ kind: 'amount', disputed: ['a', 'c'] });
  });

  test('the whole payment disputed is every booking', () => {
    expect(planDisputeAttribution(14215, cart)).toEqual({ kind: 'whole_charge', disputed: ['a', 'b', 'c'] });
  });

  test("an amount nothing adds up to waits for an admin and freezes every booking", () => {
    expect(planDisputeAttribution(5000, cart)).toEqual({ kind: 'needs_admin', frozen: ['a', 'b', 'c'] });
  });

  test('two bookings for the same amount are ambiguous, so an admin decides', () => {
    expect(planDisputeAttribution(5000, [booking('x', 5000), booking('y', 5000), booking('z', 2000)]))
      .toEqual({ kind: 'needs_admin', frozen: ['x', 'y', 'z'] });
  });

  test('matches what is left after a refund first', () => {
    // b was part-refunded £10, so £37.38 is what the statement still shows for it.
    expect(planDisputeAttribution(3738, [booking('a', 3159), booking('b', 4738, 1000), booking('c', 6318)]))
      .toEqual({ kind: 'amount', disputed: ['b'] });
  });

  test('falls back to the original amount when the bank disputes it in full after a refund', () => {
    expect(planDisputeAttribution(4738, [booking('a', 3159), booking('b', 4738, 1000), booking('c', 6318)]))
      .toEqual({ kind: 'amount', disputed: ['b'] });
  });

  test('a fully refunded booking is never matched on what is left of it', () => {
    // a is refunded in full: net 0, so it can't be "added" to make b's amount ambiguous.
    expect(planDisputeAttribution(4738, [booking('a', 3159, 3159), booking('b', 4738)]))
      .toEqual({ kind: 'amount', disputed: ['b'] });
  });

  test('bookings the card paid nothing for are left out', () => {
    expect(planDisputeAttribution(800, [booking('free', 0), booking('paid', 6340)]))
      .toEqual({ kind: 'single_booking', disputed: ['paid'] });
  });

  test("doesn't search huge baskets; an admin decides", () => {
    const many = Array.from({ length: MAX_BOOKINGS_TO_MATCH + 1 }, (_, i) => booking(`b${String(i).padStart(2, '0')}`, 1000 + i));
    const plan = planDisputeAttribution(1000, many);
    expect(plan.kind).toBe('needs_admin');
  });
});

describe("what happens to a booking's unpaid payout while its payment is disputed", () => {
  const open = { closed: false, outcome: null };
  test("a dispute we have no record of holds every payout on the payment", () => {
    expect(disputePayoutVerdict({ dispute: null, role: null })).toBe('wait');
  });
  test('a booking the dispute is not about is paid as normal', () => {
    expect(disputePayoutVerdict({ dispute: open, role: null })).toBe('pay');
  });
  test('a booking waiting for an admin to decide waits', () => {
    expect(disputePayoutVerdict({ dispute: open, role: 'frozen' })).toBe('wait');
    expect(disputePayoutVerdict({ dispute: { closed: true, outcome: 'lost' }, role: 'frozen' })).toBe('wait');
  });
  test('a disputed booking waits until the bank decides, then is paid if won and dropped if lost', () => {
    expect(disputePayoutVerdict({ dispute: open, role: 'disputed' })).toBe('wait');
    expect(disputePayoutVerdict({ dispute: { closed: true, outcome: 'won' }, role: 'disputed' })).toBe('pay');
    expect(disputePayoutVerdict({ dispute: { closed: true, outcome: 'lost' }, role: 'disputed' })).toBe('cancel');
  });
});
