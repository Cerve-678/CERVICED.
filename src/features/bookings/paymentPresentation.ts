import type { ConfirmedBooking } from '../../contexts/BookingContext';

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  card: 'Credit/Debit Card',
  paypal: 'PayPal',
  apple: 'Apple Pay',
  google: 'Google Pay',
};

export function calculateBookingPaymentBreakdown(booking: ConfirmedBooking) {
  const servicePrice = booking.price || 0;
  const addOnsTotal = booking.addOns?.reduce((sum, addOn) => sum + (addOn.price || 0), 0) || 0;
  const subtotal = servicePrice + addOnsTotal;
  const serviceCharge = booking.serviceCharge ?? 0;
  const total = subtotal + serviceCharge;
  const paymentType = booking.paymentType || 'full';
  const amountPaidAtCheckout = booking.amountPaid;
  const depositAmount = booking.depositAmount || 0;
  const remainingBalance = total - amountPaidAtCheckout;
  const totalPaidAtCheckout = amountPaidAtCheckout;

  return {
    servicePrice,
    addOnsTotal,
    subtotal,
    serviceCharge,
    total,
    paymentType,
    depositAmount,
    amountPaidAtCheckout,
    remainingBalance,
    totalPaidAtCheckout,
  };
}
