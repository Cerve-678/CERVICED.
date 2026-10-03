import { describeRefundOutcome } from '../features/bookings/paymentPresentation';

const base = { providerName: 'Braids by Amara' };

describe('describeRefundOutcome', () => {
  it('is null when nothing was refunded or kept', () => {
    expect(describeRefundOutcome({ ...base }, 'client', 24)).toBeNull();
    expect(describeRefundOutcome({ ...base, refundedAmount: 0, policyRetainedAmount: 0 }, 'provider', 24)).toBeNull();
  });

  it('tells the client what the provider kept and what came back', () => {
    const n = describeRefundOutcome({ ...base, refundedAmount: 60, policyRetainedAmount: 20 }, 'client', 24)!;
    expect(n.title).toBe('Cancellation policy applied');
    expect(n.message).toBe('Braids by Amara kept £20.00 under their 24-hour cancellation policy. £60.00 was refunded to you.');
    expect(n.rows).toEqual([{ label: 'Refunded', amount: -60 }, { label: 'Kept under cancellation policy', amount: 20 }]);
  });

  it('tells the provider only what they kept', () => {
    const n = describeRefundOutcome({ ...base, refundedAmount: 60, policyRetainedAmount: 20 }, 'provider', 0)!;
    expect(n.message).toBe('You kept £20.00 under your cancellation policy.');
  });

  it('says nothing was refunded when the policy kept everything', () => {
    const n = describeRefundOutcome({ ...base, policyRetainedAmount: 80 }, 'client', 48)!;
    expect(n.message).toBe('Braids by Amara kept £80.00 under their 48-hour cancellation policy. Nothing was refunded.');
    expect(n.rows).toEqual([{ label: 'Kept under cancellation policy', amount: 80 }]);
  });

  it('shows a plain refund when no policy was involved', () => {
    const n = describeRefundOutcome({ ...base, refundedAmount: 85 }, 'client', 24)!;
    expect(n.title).toBe('Refunded');
    expect(n.rows).toEqual([{ label: 'Refunded', amount: -85 }]);
  });
});
