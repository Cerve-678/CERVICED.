import { buildClientReceiptHTML } from '../features/bookings/receipt';
import { resolveServiceCategory } from '../features/bookings/presentation';
import { calculateBookingPaymentBreakdown } from '../features/bookings/paymentPresentation';
import { BookingStatus, type ConfirmedBooking } from '../contexts/BookingContext';
import { PaymentStatus } from '../types/booking';

describe('booking receipt', () => {
  it('includes service, payment, and booking references', () => {
    const booking = {
      id: 'abc12345-booking',
      serviceName: 'Gel manicure',
      providerName: 'Studio One',
      bookingDate: '2026-08-10',
      bookingTime: '10:00',
      createdAt: '2026-08-01T12:00:00.000Z',
      price: 30,
      serviceCharge: 2.99,
      amountPaid: 37.99,
      paymentType: 'full',
      paymentStatus: PaymentStatus.PAID_IN_FULL,
      status: BookingStatus.UPCOMING,
      addOns: [{ id: 'art', name: 'Nail art', price: 5 }],
    } as unknown as ConfirmedBooking;

    const receipt = buildClientReceiptHTML(booking);

    expect(receipt).toContain('Gel manicure');
    expect(receipt).toContain('Studio One');
    expect(receipt).toContain('£37.99');
    expect(receipt).toContain('ABC12345');
    expect(receipt).toContain('Paid in full');
  });

  it('does not head a provider-created booking as paid in full', () => {
    const booking = {
      id: 'def67890-booking',
      serviceName: 'Blow dry',
      providerName: 'Studio One',
      bookingDate: '2026-08-10',
      bookingTime: '10:00',
      createdAt: '2026-08-01T12:00:00.000Z',
      price: 65.5,
      serviceCharge: 0,
      amountPaid: 0,
      paymentType: 'full',
      paymentStatus: PaymentStatus.PENDING,
      status: BookingStatus.UPCOMING,
      addOns: [],
    } as unknown as ConfirmedBooking;

    const receipt = buildClientReceiptHTML(booking);

    expect(receipt).not.toContain('Paid in full');
    expect(receipt).toContain('Awaiting payment');
    expect(receipt).toContain('No payment has been taken through CERVICED');
  });
});

describe('booking presentation helpers', () => {
  it('preserves a provider category before using legacy service-name inference', () => {
    expect(resolveServiceCategory('Gel overlay', 'Hair')).toBe('HAIR');
    expect(resolveServiceCategory('Gel overlay', '')).toBe('NAILS');
    expect(resolveServiceCategory('Unlisted service', '')).toBe('OTHER');
  });
});

describe('booking payment presentation', () => {
  it('shows the provider deposit alone, with the checkout fee on its own line', () => {
    const breakdown = calculateBookingPaymentBreakdown({
      price: 30,
      addOns: [{ id: 'art', name: 'Nail art', price: 5 }],
      serviceCharge: 0.99,
      paymentType: 'deposit',
      paymentStatus: PaymentStatus.DEPOSIT_PAID,
      depositAmount: 10,
      amountPaid: 10.99,
    } as unknown as ConfirmedBooking);

    expect(breakdown.total).toBe(35.99);
    expect(breakdown.remainingBalance).toBe(25);
    // The card was charged 10.99, but the number shown next to "Deposit
    // Paid" is the provider's own deposit — the platform fee is separate.
    expect(breakdown.amountPaidAtCheckout).toBe(10.99);
    expect(breakdown.paidLabel).toBe('Deposit Paid');
    expect(breakdown.paidAmount).toBe(10);
    expect(breakdown.feePaidSeparately).toBe(0.99);
    // deposit + fee + balance reconciles back to the total.
    expect(breakdown.paidAmount + breakdown.feePaidSeparately + breakdown.remainingBalance)
      .toBeCloseTo(breakdown.total, 2);
    expect(breakdown.isPaidInFull).toBe(false);
  });

  it('never reports a provider-created booking as paid in full', () => {
    // provider_create_manual_booking writes payment_type 'full' with
    // amount_paid 0 and payment_status 'pending' — nothing was paid.
    const breakdown = calculateBookingPaymentBreakdown({
      price: 65.5,
      addOns: [],
      serviceCharge: 0,
      paymentType: 'full',
      paymentStatus: PaymentStatus.PENDING,
      depositAmount: 0,
      amountPaid: 0,
    } as unknown as ConfirmedBooking);

    expect(breakdown.isPaidInFull).toBe(false);
    expect(breakdown.isUnpaid).toBe(true);
    expect(breakdown.paidLabel).toBe('Paid So Far');
    expect(breakdown.paidAmount).toBe(0);
    expect(breakdown.remainingBalance).toBe(65.5);
  });

  it('reports a real pay-in-full checkout as paid in full', () => {
    const breakdown = calculateBookingPaymentBreakdown({
      price: 45,
      addOns: [],
      serviceCharge: 1.92,
      paymentType: 'full',
      paymentStatus: PaymentStatus.PAID_IN_FULL,
      depositAmount: 0,
      amountPaid: 46.92,
    } as unknown as ConfirmedBooking);

    expect(breakdown.isPaidInFull).toBe(true);
    expect(breakdown.paidLabel).toBe('Total Paid');
    expect(breakdown.paidAmount).toBe(46.92);
    expect(breakdown.remainingBalance).toBe(0);
  });
});
