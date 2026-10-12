import { buildClientReceiptHTML, buildProviderInvoiceHTML } from '../features/bookings/receipt';
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

  it("accounts for every pound of a deposit booking's total", () => {
    // Deposit £20 + £0.99 platform fee left the card at checkout; £80 is due
    // to the provider on the day. Total £100.99 must be fully explained by
    // the rows shown, or the client is looking at a 99p hole.
    const booking = {
      id: 'fee12345-booking',
      serviceName: 'Balayage',
      providerName: 'Studio One',
      bookingDate: '2026-08-10',
      bookingTime: '10:00',
      createdAt: '2026-08-01T12:00:00.000Z',
      price: 100,
      serviceCharge: 0.99,
      depositAmount: 20,
      amountPaid: 20.99,
      paymentType: 'deposit',
      paymentStatus: PaymentStatus.DEPOSIT_PAID,
      status: BookingStatus.UPCOMING,
      addOns: [],
    } as unknown as ConfirmedBooking;

    const payment = calculateBookingPaymentBreakdown(booking);

    // The deposit figure is the provider's own, never deposit + fee.
    expect(payment.paidAmount).toBe(20);
    expect(payment.serviceCharge).toBe(0.99);
    // The fee is inside `total` and itemised once, in the services
    // breakdown — it never gets a second "paid" row of its own.
    const html = buildClientReceiptHTML(booking);
    expect(html).not.toContain('platform fee paid');
    expect(html).toContain('Cerviced platform fee');
  });

  it('does not add the checkout fee onto an unpaid deposit booking', () => {
    const booking = {
      id: 'fee67890-booking',
      serviceName: 'Blow dry',
      providerName: 'Studio One',
      bookingDate: '2026-08-10',
      bookingTime: '10:00',
      createdAt: '2026-08-01T12:00:00.000Z',
      price: 40,
      serviceCharge: 1.99,
      depositAmount: 10,
      amountPaid: 0,
      paymentType: 'deposit',
      paymentStatus: PaymentStatus.PENDING,
      status: BookingStatus.UPCOMING,
      addOns: [],
    } as unknown as ConfirmedBooking;

    const payment = calculateBookingPaymentBreakdown(booking);

    expect(payment.paidAmount).toBe(0);
    expect(payment.paidLabel).toBe('Total Paid');
    expect(buildClientReceiptHTML(booking)).not.toContain('platform fee paid');
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

describe('provider invoice', () => {
  const base = {
    id: 'inv12345-booking',
    serviceName: 'Classic lash full set',
    providerName: 'Amara Lash Studio ',
    customerName: 'Jordan Ellis',
    bookingDate: '2026-10-14',
    bookingTime: '14:30',
    price: 65,
    serviceCharge: 1.99,
    status: BookingStatus.UPCOMING,
    addOns: [{ id: 'bath', name: 'Lash bath', price: 8 }],
  };

  it("leaves CERVICED's platform fee out of the provider's own invoice", () => {
    const html = buildProviderInvoiceHTML({
      ...base,
      amountPaid: 74.99,
      paymentType: 'full',
      paymentStatus: PaymentStatus.PAID_IN_FULL,
    } as unknown as ConfirmedBooking);

    expect(html).toContain('£73.00');
    expect(html).not.toContain('£74.99');
    expect(html).not.toContain('platform fee');
    expect(html).toContain('Full payment');
    expect(html).toContain('Jordan Ellis');
  });

  it('shows the deposit and the balance the client still owes the provider', () => {
    const html = buildProviderInvoiceHTML({
      ...base,
      depositAmount: 20,
      amountPaid: 21.99,
      paymentType: 'deposit',
      paymentStatus: PaymentStatus.DEPOSIT_PAID,
    } as unknown as ConfirmedBooking);

    expect(html).toContain('Deposit paid');
    expect(html).toContain('£20.00');
    expect(html).toContain('£53.00');
  });

  it('never invoices a hand-added unpaid booking as a full payment', () => {
    const html = buildProviderInvoiceHTML({
      ...base,
      serviceCharge: 0,
      amountPaid: 0,
      paymentType: 'full',
      paymentStatus: PaymentStatus.PENDING,
    } as unknown as ConfirmedBooking);

    expect(html).not.toContain('Full payment');
    expect(html).toContain('Not paid in app');
    expect(html).toContain('Balance due');
  });

  it('escapes names that reach the HTML', () => {
    const html = buildProviderInvoiceHTML({
      ...base,
      customerName: '<script>x</script>',
      amountPaid: 0,
      paymentType: 'full',
      paymentStatus: PaymentStatus.PENDING,
    } as unknown as ConfirmedBooking);

    expect(html).not.toContain('<script>x');
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
    // The platform fee is inside `total` and itemised separately on the
    // receipt — it is never rolled into the deposit figure.
    expect(breakdown.serviceCharge).toBe(0.99);
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
    expect(breakdown.paidLabel).toBe('Total Paid');
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
