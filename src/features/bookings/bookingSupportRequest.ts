import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { invokeSendSupportRequest } from '../../services/databaseService';
import { formatBookingRef } from './presentation';
import { PaymentStatus, type ConfirmedBooking } from '../../types/booking';

/**
 * A client asking CERVICED support about one booking, from the ⋯ menu on
 * BookingDetailScreen: a refund request or a complaint.
 *
 * Unlike fileNoShowDispute, the support ticket IS the whole record here —
 * nothing is stamped on the booking and the provider is not notified, so a
 * failed ticket means nothing happened and the caller must say so (this
 * throws). It also deliberately moves no money: a refund request is a person
 * reading the ticket against the booking's policy, never an automatic refund.
 */
export type BookingSupportKind = 'refund' | 'complaint';

/**
 * The reason a client picks on the sheet. It leads the ticket so support can
 * triage at a glance; the free-text note carries the detail. "Something else"
 * has nothing to triage on, so it needs a note (see isSupportRequestReady).
 */
export const OTHER_SUPPORT_REASON = 'Something else';

export const SUPPORT_REASONS: Record<BookingSupportKind, readonly string[]> = {
  refund: [
    'The provider cancelled',
    "The provider didn't turn up",
    "The service wasn't what I booked",
    'I was charged the wrong amount',
    'I cancelled within their policy',
    OTHER_SUPPORT_REASON,
  ],
  complaint: [
    'Lateness or a no-show',
    'Quality of the service',
    'Hygiene or safety',
    'How I was treated',
    OTHER_SUPPORT_REASON,
  ],
};

export function isSupportRequestReady(reason: string | null, message: string): boolean {
  if (!reason) return false;
  return reason !== OTHER_SUPPORT_REASON || message.trim().length > 0;
}

/**
 * What a refund request can cover. Cerviced only gets involved with money
 * that moved through the app's own payment processor:
 *
 * - `in_app`  — a deposit or full payment went through the app (possibly
 *   part-refunded already). Support can review it against the policy.
 * - `off_app` — nothing was paid through the app (paid in person, cash,
 *   bank transfer). There's nothing Cerviced can refund, and the app
 *   deliberately never tracks off-app payments, so the client is told it's
 *   between them and the provider rather than offered a ticket.
 * - `settled` — already refunded or a refund is on its way; nothing to ask.
 */
export type RefundRequestScope = 'in_app' | 'off_app' | 'settled';

export function getRefundRequestScope(booking: Pick<ConfirmedBooking, 'paymentStatus'>): RefundRequestScope {
  switch (booking.paymentStatus) {
    case PaymentStatus.DEPOSIT_PAID:
    case PaymentStatus.PAID_IN_FULL:
    case PaymentStatus.PARTIALLY_REFUNDED:
      return 'in_app';
    case PaymentStatus.REFUNDED:
    case PaymentStatus.REFUND_PENDING:
      return 'settled';
    default:
      return 'off_app';
  }
}

/**
 * The lines the refund sheet shows before the client picks a reason, so they
 * know what Cerviced can and can't look at before they ask:
 * - off-app money is between them and the provider;
 * - a deposit's balance paid on the day is off-app too;
 * - a provider keeping money under their policy because the client broke it
 *   (late cancel, no-show, late reschedule) stands — Cerviced only reviews
 *   when the client says they didn't.
 */
export function describeRefundScope(
  booking: Pick<ConfirmedBooking, 'paymentStatus' | 'paymentType' | 'amountPaid' | 'remainingBalance' | 'providerName'>,
): { title: string; lines: string[] } {
  const provider = booking.providerName?.trim() || 'your provider';
  const Provider = provider.charAt(0).toUpperCase() + provider.slice(1);
  const money = (n: number) => `£${n.toFixed(2)}`;

  if (getRefundRequestScope(booking) === 'off_app') {
    return {
      title: 'Not paid through Cerviced',
      lines: [
        "Nothing for this booking was paid through the Cerviced app, so there's nothing here Cerviced can refund.",
        `Payments made in person, like cash, card on the day or a bank transfer, are between you and ${provider}. Please speak to them directly.`,
      ],
    };
  }

  const isDeposit = booking.paymentType === 'deposit' || booking.paymentStatus === PaymentStatus.DEPOSIT_PAID;
  const paid = Number(booking.amountPaid || 0);
  const balance = Number(booking.remainingBalance || 0);
  const lines: string[] = [];
  if (isDeposit) {
    lines.push(balance > 0
      ? `Cerviced can only look at the ${money(paid)} deposit you paid in the app. The ${money(balance)} balance due at the appointment is between you and ${provider}.`
      : `Cerviced can only look at the ${money(paid)} deposit you paid in the app. Anything paid to ${provider} in person is between you and them.`);
    lines.push(`${Provider} can keep your deposit under their policy if you cancelled late, didn't turn up, or rescheduled late. If that's what happened, Cerviced won't overturn it. If it isn't, tell us below and we'll review it.`);
  } else {
    lines.push(`${Provider} can keep some or all of what you paid under their policy if you cancelled late, didn't turn up, or rescheduled late. If that's what happened, Cerviced won't overturn it. If it isn't, tell us below and we'll review it.`);
  }
  return { title: 'What Cerviced can review', lines };
}

export function buildBookingSupportDescription(
  booking: ConfirmedBooking,
  kind: BookingSupportKind,
  reason: string,
  message: string,
): string {
  return [
    `${kind === 'refund' ? 'REFUND REQUEST' : 'COMPLAINT'} — ${formatBookingRef(booking)}`,
    '',
    `Booking: ${booking.serviceName} with ${booking.providerName}`,
    `Date: ${booking.bookingDate} ${booking.bookingTime}`,
    `Status: ${booking.status} · Payment: ${booking.paymentStatus}`,
    `Booking id: ${booking.id}`,
    '',
    `Reason: ${reason}`,
    '',
    'In their words:',
    message.trim() || '(no note)',
  ].join('\n');
}

export async function fileBookingSupportRequest(
  booking: ConfirmedBooking,
  kind: BookingSupportKind,
  reason: string,
  message: string,
  activeMode: string,
): Promise<{ ticketNumber: number }> {
  const { ticketNumber } = await invokeSendSupportRequest({
    // Must be one of send-support-request's CATEGORIES or it is rejected.
    category: kind === 'refund' ? 'Payment' : 'Provider Issue',
    description: buildBookingSupportDescription(booking, kind, reason, message),
    platform: `${Platform.OS} ${String(Platform.Version)}`,
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    activeMode,
  });
  return { ticketNumber };
}
