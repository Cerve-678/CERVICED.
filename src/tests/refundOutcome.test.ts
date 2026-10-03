import { describeRefundOutcome } from '../features/bookings/paymentPresentation';
import { PaymentStatus } from '../types/booking';

const base = { providerName: 'Braids by Amara', paymentStatus: PaymentStatus.PAID_IN_FULL };

describe('describeRefundOutcome', () => {
  it('is null when nothing was refunded, kept or pending', () => {
    expect(describeRefundOutcome({ ...base }, 24)).toBeNull();
    expect(describeRefundOutcome({ ...base, refundedAmount: 0, policyRetainedAmount: 0 }, 24)).toBeNull();
  });

  it('says pending while Stripe is processing, then refunded', () => {
    const pending = describeRefundOutcome({ ...base, paymentStatus: PaymentStatus.REFUND_PENDING }, 24)!;
    expect(pending.title).toBe('Refund pending');
    expect(pending.providerStatus).toBe('Refund pending');
    const done = describeRefundOutcome({ ...base, paymentStatus: PaymentStatus.REFUNDED, refundedAmount: 85 }, 24)!;
    expect(done.title).toBe('Refunded');
    expect(done.message).toBe('£85.00 refunded to you. Banks usually take 5–10 working days to show it.');
    expect(done.providerStatus).toBe('Refund issued · £85.00');
  });

  it('tells the client what came back and what the policy kept', () => {
    const n = describeRefundOutcome({ ...base, paymentStatus: PaymentStatus.PARTIALLY_REFUNDED, refundedAmount: 60, policyRetainedAmount: 20 }, 24)!;
    expect(n.title).toBe('Refunded');
    expect(n.message).toBe('£60.00 refunded to you. Braids by Amara kept £20.00 under their 24-hour cancellation policy.');
    expect(n.rows).toEqual([{ label: 'Refunded', amount: -60 }, { label: 'Kept under cancellation policy', amount: 20 }]);
  });

  it('gives the provider one plain status for an enforced policy', () => {
    const n = describeRefundOutcome({ ...base, refundedAmount: 60, policyRetainedAmount: 20 }, 0)!;
    expect(n.providerStatus).toBe('Policy enforced · £20.00 kept');
  });

  it('says no refund when the policy kept everything', () => {
    const n = describeRefundOutcome({ ...base, policyRetainedAmount: 80 }, 48)!;
    expect(n.title).toBe('No refund');
    expect(n.message).toBe('Braids by Amara kept £80.00 under their 48-hour cancellation policy. Nothing was refunded.');
  });
});
