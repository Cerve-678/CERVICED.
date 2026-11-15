import { settledFromCaptureStatus } from '../features/cart/checkoutOutcome';
import {
  checkoutSuccessMessage, holdCheckPrompt, holdNeedsCheck, holdPlanNote, holdResultLine, payButtonLabel,
} from '../features/cart/requestHolds';
import { getRefundRequestScope } from '../features/bookings/bookingSupportRequest';
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

  it('books a checkout whose sheet payment is a request hold, the same as a paid one', () => {
    expect(settledFromCaptureStatus('held')).toBe('succeeded');
    expect(settledFromCaptureStatus('succeeded')).toBe('succeeded');
  });

  it('treats a held or released payment as nothing to ask a refund for', () => {
    const on = { bookingDate: '2026-11-20' };
    expect(getRefundRequestScope({ ...on, paymentStatus: PaymentStatus.NOT_CHARGED })).toBe('settled');
    expect(getRefundRequestScope({ ...on, paymentStatus: PaymentStatus.AUTHORISED })).toBe('settled');
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

describe('a checkout with requests held, not charged', () => {
  const oneRequest = { chargeNowPence: 0, heldPence: 5250, requestCount: 1, bookingCount: 1 };
  // 3 instant bookings (£130 + fees) and 2 requests (£50 + £80, + fees).
  const mixed = { chargeNowPence: 13650, heldPence: 13650, requestCount: 2, bookingCount: 5 };
  const noRequests = { chargeNowPence: 9000, heldPence: 0, requestCount: 0, bookingCount: 2 };

  it('labels the button with what is charged and what is only held', () => {
    expect(payButtonLabel(oneRequest, 52.5)).toBe('Hold £52.50');
    expect(payButtonLabel(mixed, 273)).toBe('Pay £136.50 · Hold £136.50');
    expect(payButtonLabel(noRequests, 90)).toBe('Pay £90.00');
    // Plan not loaded: the plain total, as before.
    expect(payButtonLabel(null, 90)).toBe('Pay £90.00');
  });

  it('explains the hold before paying, only when there is one', () => {
    expect(holdPlanNote(oneRequest)).toContain('£52.50 for your request is held on your card, not taken');
    expect(holdPlanNote(mixed)).toContain('your 2 requests');
    // Saved only when a hold is placed after the sheet's own payment.
    expect(holdPlanNote(mixed)).toContain('Your card is saved to your account');
    expect(holdPlanNote(oneRequest)).not.toContain('saved');
    expect(holdPlanNote(noRequests)).toBeNull();
  });

  it('says what was paid and what was held on the success screen', () => {
    expect(checkoutSuccessMessage(oneRequest, 52.5)).toMatch(/^£52\.50 is held on your card, not taken\. You're only charged if it's accepted\./);
    expect(checkoutSuccessMessage(mixed, 273))
      .toBe('£136.50 paid for 3 bookings · £136.50 held for 2 requests, only charged if accepted.');
    expect(checkoutSuccessMessage(noRequests, 90)).toMatch(/^Payment of £90\.00 has been processed/);
  });

  it('asks for the bank check only until its deadline', () => {
    const now = new Date('2026-11-14T10:00:00Z');
    const hold = { serviceName: 'braids', state: 'needs_action' as const, actionDeadline: '2026-11-14T10:30:00Z' };
    expect(holdNeedsCheck(hold, now)).toBe(true);
    expect(holdNeedsCheck({ ...hold, actionDeadline: '2026-11-14T09:59:00Z' }, now)).toBe(false);
    expect(holdNeedsCheck({ ...hold, state: 'authorised' }, now)).toBe(false);
    expect(holdCheckPrompt(hold).title).toBe('Your bank wants to confirm the hold for the braids request.');
    expect(holdCheckPrompt(hold).detail).toMatch(/isn't sent to the provider.*nothing is held/);
  });

  it('says plainly when a request went or was not sent', () => {
    const hold = { serviceName: 'braids', actionDeadline: null };
    expect(holdResultLine({ ...hold, state: 'authorised' })).toBe('Done. Your braids request has gone to the provider.');
    expect(holdResultLine({ ...hold, state: 'dropped' })).toBe("Your braids request wasn't sent. Nothing is held on your card.");
    expect(holdResultLine({ ...hold, state: 'needs_action' })).toBeNull();
  });
});
