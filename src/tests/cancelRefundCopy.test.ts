import { describeCancelRefund } from '../features/bookings/paymentPresentation';
import { PaymentStatus } from '../types/booking';

const base = { providerName: 'Braids by Amara', paymentStatus: PaymentStatus.PAID_IN_FULL, amountPaid: 88 };
const early = { policyApplies: false, depositNonRefundable: false };

describe('describeCancelRefund', () => {
  it('promises the full amount back on an early cancel', () => {
    const copy = describeCancelRefund(base, early)!;
    expect(copy.confirmLine).toBe(" You'll be refunded £88.00 in full, including the platform fee.");
    expect(copy.doneMessage).toBe("Your appointment has been cancelled. You'll be refunded £88.00 in full. Banks usually take 5–10 working days to show it.");
  });

  it('only promises what the policy does not keep inside the notice window', () => {
    const copy = describeCancelRefund(base, { ...early, policyApplies: true })!;
    expect(copy.confirmLine).toBe(" Anything Braids by Amara's policy doesn't keep will be refunded to you.");
    expect(copy.doneMessage).not.toMatch(/£/);
  });

  it('keeps a non-refundable deposit out of the promise', () => {
    const copy = describeCancelRefund({ ...base, paymentStatus: PaymentStatus.DEPOSIT_PAID }, { ...early, depositNonRefundable: true })!;
    expect(copy.confirmLine).toBe('');
    expect(copy.doneMessage).toMatch(/Braids by Amara keeps it, and the rest will be refunded to you/);
  });

  it('says nothing about refunds when nothing was paid in the app', () => {
    expect(describeCancelRefund({ ...base, paymentStatus: PaymentStatus.PENDING }, early)).toBeNull();
    expect(describeCancelRefund({ ...base, refundedAmount: 88 }, early)).toBeNull();
  });
});

describe('late cancel with a late cancellation fee (deposit only, half policy)', () => {
  const booking = { paymentStatus: PaymentStatus.DEPOSIT_PAID, amountPaid: 21, providerName: 'Bloom', depositAmount: 20 };
  it('uses the chosen wording in place of the generic warning', () => {
    const copy = describeCancelRefund(booking, { policyApplies: true, depositNonRefundable: false, lateCancelFeePence: 3000 });
    expect(copy?.confirmLine).toBe("Late cancellation: you'll lose your £20.00 deposit and may be charged up to £30.00 more.");
    expect(copy?.replacesWarning).toBe(true);
    expect(copy?.doneMessage).toContain('may charge up to £30.00 more');
  });
  it('says nothing about a charge when cancelling in good time', () => {
    const copy = describeCancelRefund(booking, { policyApplies: false, depositNonRefundable: false, lateCancelFeePence: 3000 });
    expect(copy?.replacesWarning).toBeUndefined();
    expect(copy?.confirmLine).not.toContain('£30.00');
  });
});
