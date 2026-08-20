import type { ConfirmedBooking } from '../../contexts/BookingContext';
import { PaymentStatus } from '../../types/booking';

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
  // What actually left the client's card at checkout. For a deposit booking
  // this is deposit + platform fee (see BookingService.createAppointmentData),
  // which is why it must NOT be the number shown next to a "Deposit" label.
  const amountPaidAtCheckout = booking.amountPaid || 0;
  const depositAmount = booking.depositAmount || 0;
  const remainingBalance = total - amountPaidAtCheckout;

  // `payment_type` only records WHICH option was taken (deposit vs. pay in
  // full) — it says nothing about whether money ever moved. A booking a
  // provider added by hand is written as payment_type 'full' with
  // amount_paid 0 and payment_status 'pending' (see the
  // provider_create_manual_booking RPC), so keying "Paid in Full" off
  // payment_type stamped that badge on bookings nothing had been paid for,
  // right next to a non-zero "Due at Appointment". payment_status is the
  // only field that reflects a real payment.
  const paymentStatus = booking.paymentStatus ?? PaymentStatus.PENDING;
  const isDeposit = paymentType === 'deposit';
  const isPaidInFull = paymentStatus === PaymentStatus.PAID_IN_FULL;
  const isUnpaid = !isPaidInFull && paymentStatus !== PaymentStatus.DEPOSIT_PAID;

  // On a deposit the figure shown is the provider's own deposit, never the
  // deposit + the platform fee bundled together — the fee is CERVICED's, not
  // part of what the client has put towards the provider's service. It is
  // already inside `total`, and itemised on its own line in the receipt.
  //
  // `isUnpaid` is checked FIRST: a booking can carry payment_type 'deposit'
  // while payment_status is still 'pending', and labelling that "Deposit
  // Paid" would assert a payment that never happened. An unpaid booking
  // reads "Total Paid £0.00", which is simply true.
  const paidLabel = !isUnpaid && isDeposit ? 'Deposit Paid' : 'Total Paid';
  const paidAmount = isUnpaid ? 0 : isDeposit ? depositAmount : amountPaidAtCheckout;

  // The platform fee the client already paid at checkout, shown as its own
  // "paid" row on a deposit booking. Without it the card reads Total £100.99 /
  // Deposit Paid £20.00 / Due £80.00 — three numbers that don't reconcile,
  // because `paidAmount` is deliberately the provider's deposit alone while
  // the fee sits inside `total`. Zero for a full payment (already inside
  // `paidAmount`) and for an unpaid booking (nothing was charged).
  const feePaidSeparately = !isUnpaid && isDeposit ? serviceCharge : 0;

  return {
    servicePrice,
    addOnsTotal,
    subtotal,
    serviceCharge,
    total,
    paymentType,
    paymentStatus,
    depositAmount,
    amountPaidAtCheckout,
    remainingBalance,
    isDeposit,
    isPaidInFull,
    isUnpaid,
    paidLabel,
    paidAmount,
    feePaidSeparately,
  };
}
