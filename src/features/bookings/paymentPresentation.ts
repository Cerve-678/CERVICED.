import type { ConfirmedBooking } from '../../contexts/BookingContext';
import { PaymentStatus } from '../../types/booking';
import { tr, trp } from '../../i18n';

/** Payment method display names. `card` is a getter so it reads the current
 *  language; the others are brand names and stay as they are. */
export const PAYMENT_METHOD_LABELS: Record<string, string> = Object.defineProperties(
  { paypal: 'PayPal', apple: 'Apple Pay', google: 'Google Pay' } as Record<string, string>,
  { card: { enumerable: true, get: () => tr('clientBooking.payment.method.card') } },
);

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
  // third mention of the same fee next to the deposit made the card read
  // as if it had been charged twice. Deposit + balance not summing exactly
  // to Total is the intended reading: what you still owe the provider is the
  // number that matters at the appointment.
  //
  // `isUnpaid` is checked FIRST: a booking can carry payment_type 'deposit'
  // while payment_status is still 'pending', and labelling that "Deposit
  // Paid" would assert a payment that never happened. An unpaid booking
  // reads "Total Paid £0.00", which is simply true.
  const paidLabel = !isUnpaid && isDeposit ? tr('clientBooking.payment.depositPaid') : tr('clientBooking.payment.totalPaid');
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
  /** What happened, for choosing an icon/colour. Compare this, never the
   *  title — the title is translated. */
  state: 'pending' | 'refunded' | 'kept';
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
  // The messages and the "kept under policy" row are cancellation-policy and
  // refund wording, held in English (clientBookingHeld); titles and status
  // labels are plain UI and translated.
  const provider = booking.providerName?.trim() || 'Your provider';
  const keptLine = noticeHours > 0
    ? tr('clientBooking.refundOutcome.keptLineHours', { provider, amount: money(kept), hours: noticeHours })
    : tr('clientBooking.refundOutcome.keptLine', { provider, amount: money(kept) });
  const keptRow = tr('clientBooking.refundOutcome.keptRow');

  if (booking.paymentStatus === PaymentStatus.REFUND_PENDING) {
    return {
      state: 'pending',
      title: tr('clientBooking.refundOutcome.refundPending'),
      message: kept > 0
        ? tr('clientBooking.refundOutcome.pendingKept', { kept: keptLine })
        : tr('clientBooking.refundOutcome.pending'),
      rows: kept > 0 ? [{ label: keptRow, amount: kept }] : [],
      providerStatus: tr('clientBooking.refundOutcome.refundPending'),
    };
  }
  if (kept > 0) {
    return {
      state: refunded > 0 ? 'refunded' : 'kept',
      title: refunded > 0 ? tr('clientBooking.refundOutcome.refunded') : tr('clientBooking.refundOutcome.noRefund'),
      message: refunded > 0
        ? tr('clientBooking.refundOutcome.refundedKept', { amount: money(refunded), kept: keptLine })
        : tr('clientBooking.refundOutcome.nothingRefunded', { kept: keptLine }),
      rows: [
        ...(refunded > 0 ? [{ label: tr('clientBooking.refundOutcome.refunded'), amount: -refunded }] : []),
        { label: keptRow, amount: kept },
      ],
      providerStatus: tr('clientBooking.refundOutcome.policyEnforced', { amount: money(kept) }),
    };
  }
  if (refunded > 0) {
    return {
      state: 'refunded',
      title: tr('clientBooking.refundOutcome.refunded'),
      message: tr('clientBooking.refundOutcome.refundedBanks', { amount: money(refunded) }),
      rows: [{ label: tr('clientBooking.refundOutcome.refunded'), amount: -refunded }],
      providerStatus: tr('clientBooking.refundOutcome.refundIssued', { amount: money(refunded) }),
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
  // Cancellation-policy wording: held in English (clientBookingHeld).
  if (hoursBefore == null || !Number.isFinite(hoursBefore)) return null;
  if (hoursBefore < 0) return tr('clientBooking.settlement.afterStart');
  const inside = noticeHours > 0;
  if (hoursBefore < 1) {
    const count = Math.max(1, Math.round(hoursBefore * 60));
    return inside
      ? trp('clientBooking.settlement.minutesInside', count, { hours: noticeHours })
      : trp('clientBooking.settlement.minutes', count);
  }
  const count = Math.floor(hoursBefore);
  return inside
    ? trp('clientBooking.settlement.hoursInside', count, { hours: noticeHours })
    : trp('clientBooking.settlement.hours', count);
}
