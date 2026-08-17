import { buildClientReceiptHTML } from '../features/bookings/receipt';
import { resolveServiceCategory } from '../features/bookings/presentation';
import { calculateBookingPaymentBreakdown } from '../features/bookings/paymentPresentation';
import { BookingStatus, type ConfirmedBooking } from '../contexts/BookingContext';

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
      amountPaid: 32.99,
      paymentType: 'full',
      status: BookingStatus.UPCOMING,
      addOns: [{ id: 'art', name: 'Nail art', price: 5 }],
    } as unknown as ConfirmedBooking;

    const receipt = buildClientReceiptHTML(booking);

    expect(receipt).toContain('Gel manicure');
    expect(receipt).toContain('Studio One');
    expect(receipt).toContain('£37.99');
    expect(receipt).toContain('ABC12345');
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
  it('adds the separate deposit-checkout fee without reducing provider deposit', () => {
    const breakdown = calculateBookingPaymentBreakdown({
      price: 30,
      addOns: [{ id: 'art', name: 'Nail art', price: 5 }],
      serviceCharge: 0.99,
      paymentType: 'deposit',
      depositAmount: 10,
      amountPaid: 10.99,
    } as unknown as ConfirmedBooking);

    expect(breakdown.total).toBe(35.99);
    expect(breakdown.remainingBalance).toBe(25);
    expect(breakdown.totalPaidAtCheckout).toBe(10.99);
  });
});
