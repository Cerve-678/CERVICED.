import { settledFromCaptureStatus } from '../features/cart/checkoutOutcome';
import {
  calculateBookingPaymentBreakdown,
  describeCancelRefund,
  describeRefundOutcome,
} from '../features/bookings/paymentPresentation';
import { mapDbBookingToConfirmed } from '../services/bookingService';
import { PaymentStatus, type ConfirmedBooking } from '../types/booking';
import type { BookingWithAddOns } from '../types/database';

const request = (overrides: Partial<ConfirmedBooking>) =>
  ({
    id: 'b1',
    providerName: 'Lola Studio',
    price: 50,
    serviceCharge: 2.5,
    amountPaid: 52.5,
    paymentType: 'full',
    paymentStatus: PaymentStatus.AUTHORISED,
    addOns: [],
    ...overrides,
  }) as unknown as ConfirmedBooking;

describe('a request paid by a hold on the card', () => {
  it('reads the new payment states from the database', () => {
    const row = (payment_status: string) =>
      mapDbBookingToConfirmed({ id: 'b1', status: 'pending', payment_status, booking_date: '2026-11-20', booking_time: '10:00:00' } as unknown as BookingWithAddOns);
    expect(row('authorised').paymentStatus).toBe(PaymentStatus.AUTHORISED);
    expect(row('not_charged').paymentStatus).toBe(PaymentStatus.NOT_CHARGED);
  });

  it('counts a held checkout as booked', () => {
    expect(settledFromCaptureStatus('held')).toBe('succeeded');
  });

  it('shows the amount as held, not paid, and no deposit as paid', () => {
    const full = calculateBookingPaymentBreakdown(request({}));
    expect(full.isHeld).toBe(true);
    expect(full.paidLabel).toBe('Held on your card');
    expect(full.paidAmount).toBe(52.5);
    expect(full.remainingBalance).toBe(0);
    const deposit = calculateBookingPaymentBreakdown(request({ paymentType: 'deposit', depositAmount: 10, amountPaid: 12.5 }));
    expect(deposit.depositPaid).toBe(0);
  });

  it('never charges a client who withdraws a held request, whatever the policy', () => {
    const copy = describeCancelRefund(request({}), { policyApplies: true, depositNonRefundable: true });
    expect(copy?.doneMessage).toContain("wasn't charged");
    expect(copy?.confirmLine).not.toMatch(/refund|keep/i);
  });

  it('says not charged, not refunded, once the hold is released', () => {
    const outcome = describeRefundOutcome(request({ paymentStatus: PaymentStatus.NOT_CHARGED }), 24);
    expect(outcome?.title).toBe('Not charged');
    expect(outcome?.message).not.toMatch(/refund/i);
  });
});
