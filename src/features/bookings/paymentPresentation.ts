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
  // part of what the client has put towards the provider's service.
  //
  // The fee gets NO "paid" row of its own anywhere. It is already inside
  // `total` and already itemised in the receipt's services breakdown, and a
  // third mention of the same £0.99 next to the deposit made the card read
  // as if it had been charged twice. Deposit + balance not summing exactly
  // to Total is the intended reading: what you still owe the provider is the
  // number that matters at the appointment.
  //
  // `isUnpaid` is checked FIRST: a booking can carry payment_type 'deposit'
  // while payment_status is still 'pending', and labelling that "Deposit
  // Paid" would assert a payment that never happened. An unpaid booking
  // reads "Total Paid £0.00", which is simply true.
  const paidLabel = !isUnpaid && isDeposit ? 'Deposit Paid' : 'Total Paid';
  const paidAmount = isUnpaid ? 0 : isDeposit ? depositAmount : amountPaidAtCheckout;

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
  };
}

/**
 * What a booking's details should say about money that came back or was kept
 * after the fact. Null when nothing was refunded, kept, or is on its way.
 *
 * Client: a short notice at the top of the payment section — "Refund pending"
 * while Stripe processes it, then "Refunded" with what the policy kept.
 * Provider: one plain status for the receipt header — "Refund issued" or
 * "Policy enforced" — never mentioning the platform fee (user decisions
 * 2026-10-03).
 */
export interface RefundOutcome {
  title: string;
  message: string;
  /** Receipt rows for the client: label → signed £ amount. */
  rows: { label: string; amount: number }[];
  /** One-line status for the provider's receipt header. */
  providerStatus: string;
}

export function describeRefundOutcome(
  booking: Pick<ConfirmedBooking, 'policyRetainedAmount' | 'refundedAmount' | 'providerName' | 'paymentStatus'>,
  noticeHours: number,
): RefundOutcome | null {
  const kept = booking.policyRetainedAmount ?? 0;
  const refunded = booking.refundedAmount ?? 0;
  const money = (n: number) => `£${n.toFixed(2)}`;
  const provider = booking.providerName?.trim() || 'Your provider';
  const policy = noticeHours > 0 ? `${noticeHours}-hour cancellation policy` : 'cancellation policy';
  const keptLine = `${provider} kept ${money(kept)} under their ${policy}.`;

  if (booking.paymentStatus === PaymentStatus.REFUND_PENDING) {
    return {
      title: 'Refund pending',
      message: kept > 0
        ? `Your refund is being processed. ${keptLine}`
        : 'Your refund is being processed. This will update once it has gone through.',
      rows: kept > 0 ? [{ label: 'Kept under cancellation policy', amount: kept }] : [],
      providerStatus: 'Refund pending',
    };
  }
  if (kept > 0) {
    return {
      title: refunded > 0 ? 'Refunded' : 'No refund',
      message: refunded > 0
        ? `${money(refunded)} refunded to you. ${keptLine}`
        : `${keptLine} Nothing was refunded.`,
      rows: [
        ...(refunded > 0 ? [{ label: 'Refunded', amount: -refunded }] : []),
        { label: 'Kept under cancellation policy', amount: kept },
      ],
      providerStatus: `Policy enforced · ${money(kept)} kept`,
    };
  }
  if (refunded > 0) {
    return {
      title: 'Refunded',
      message: `${money(refunded)} refunded to you. Banks usually take 5–10 working days to show it.`,
      rows: [{ label: 'Refunded', amount: -refunded }],
      providerStatus: `Refund issued · ${money(refunded)}`,
    };
  }
  return null;
}

/**
 * Why the policy applied, in one line for the provider's settlement summary:
 * "Cancelled 6 hours before, inside your 24-hour notice." `hoursBefore` is
 * measured from when the client cancelled to the appointment start, the same
 * way the server decides whether it was a late cancel.
 */
export function describeSettlementTiming(hoursBefore: number | null, noticeHours: number): string | null {
  if (hoursBefore == null || !Number.isFinite(hoursBefore)) return null;
  const notice = noticeHours > 0 ? `, inside your ${noticeHours}-hour notice` : '';
  if (hoursBefore < 0) return 'Cancelled after the appointment start time.';
  if (hoursBefore < 1) {
    const mins = Math.max(1, Math.round(hoursBefore * 60));
    return `Cancelled ${mins} minute${mins === 1 ? '' : 's'} before${notice}.`;
  }
  const hrs = Math.floor(hoursBefore);
  return `Cancelled ${hrs} hour${hrs === 1 ? '' : 's'} before${notice}.`;
}
