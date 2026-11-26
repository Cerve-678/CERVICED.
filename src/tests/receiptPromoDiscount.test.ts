import { buildClientReceiptHTML, buildProviderInvoiceHTML } from '../features/bookings/receipt';
import { calculateBookingPaymentBreakdown } from '../features/bookings/paymentPresentation';
import { BookingStatus, type ConfirmedBooking } from '../contexts/BookingContext';
import { PaymentStatus } from '../types/booking';
import { mapDbBookingToConfirmed } from '../services/bookingService';
import type { BookingWithAddOns } from '../types/database';

// A promo code is priced at checkout and base_price is stored AFTER the
// discount (20261113100000), with the amount in promo_discount. The receipt
// lists the service at its full price and the discount as its own line, and
// the total is unchanged: what the client was actually charged.
const promoBooking = {
  id: 'promo123-booking',
  serviceName: 'Brow lamination',
  providerName: 'Studio One',
  customerName: 'Amy',
  bookingDate: '2026-12-10',
  bookingTime: '10:00',
  createdAt: '2026-11-26T12:00:00.000Z',
  price: 40, // £50 service, £10 off
  promoDiscount: 10,
  serviceCharge: 2.4,
  amountPaid: 42.4,
  paymentType: 'full',
  paymentStatus: PaymentStatus.PAID_IN_FULL,
  status: BookingStatus.UPCOMING,
  addOns: [],
} as unknown as ConfirmedBooking;

describe('a promo code on the receipt', () => {
  it('shows the full price, the discount, and the total actually charged', () => {
    const payment = calculateBookingPaymentBreakdown(promoBooking);
    expect(payment.listPrice).toBe(50);
    expect(payment.promoDiscount).toBe(10);
    expect(payment.total).toBeCloseTo(42.4, 10);

    const receipt = buildClientReceiptHTML(promoBooking);
    expect(receipt).toContain('£50.00');
    expect(receipt).toContain('Promo Discount');
    expect(receipt).toContain('−£10.00');
    expect(receipt).toContain('£42.40');
  });

  it("shows the same discount on the provider's invoice, whose total is the discounted price", () => {
    const invoice = buildProviderInvoiceHTML(promoBooking);
    expect(invoice).toContain('£50.00');
    expect(invoice).toContain('−£10.00');
    expect(invoice).toContain('£40.00');
  });

  it('adds no line without a promo code', () => {
    const plain = { ...promoBooking, price: 50, promoDiscount: undefined } as unknown as ConfirmedBooking;
    expect(calculateBookingPaymentBreakdown(plain).listPrice).toBe(50);
    expect(buildClientReceiptHTML(plain)).not.toContain('Promo Discount');
  });

  it('reads promo_discount from the booking row (PostgREST sends numerics as strings)', () => {
    const mapped = mapDbBookingToConfirmed({
      id: 'b1', base_price: 40, promo_discount: '10.00', payment_type: 'full', amount_paid: 42.4,
      booking_date: '2026-12-10', booking_time: '10:00', status: 'confirmed', add_ons: [],
    } as unknown as BookingWithAddOns);
    expect(mapped.promoDiscount).toBe(10);
  });
});
