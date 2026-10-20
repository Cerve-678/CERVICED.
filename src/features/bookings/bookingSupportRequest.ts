import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { invokeSendSupportRequest, passRefundRequestToCerviced, requestBookingRefund } from '../../services/databaseService';
import { formatBookingRef } from './presentation';
import { logger } from '../../utils/logger';
import { PaymentStatus, type ConfirmedBooking, type RefundRequest } from '../../types/booking';
import { tr, type TranslationKey } from '../../i18n';

/**
 * A client asking about one booking, from the ⋯ menu on BookingDetailScreen:
 * a refund request or a complaint. Neither moves money.
 *
 * A REFUND REQUEST works like fileNoShowDispute — two steps, not equal in
 * weight:
 *  1. request_booking_refund() is THE record. It tells the provider (who can
 *     refund it) and is what the booking's timeline reads. If it fails,
 *     nothing happened and this throws.
 *  2. The support ticket is how Cerviced sees it, and it emails the provider.
 *     Its failing doesn't undo step 1, so it returns `ticketNumber: null`
 *     rather than throwing.
 *
 * A COMPLAINT goes to support only, never to the provider: some of them
 * (hygiene, how the client was treated) aren't safe to hand to the person
 * they're about. The ticket is the whole record there, so a failed ticket
 * throws.
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

/** Display label for each reason. The reason itself stays English: it is what
 *  the support ticket and request_booking_refund() record. */
export const SUPPORT_REASON_LABEL_KEYS: Readonly<Record<string, TranslationKey>> = {
  'The provider cancelled': 'clientBooking.support.reason.providerCancelled',
  "The provider didn't turn up": 'clientBooking.support.reason.providerNoShow',
  "The service wasn't what I booked": 'clientBooking.support.reason.notWhatIBooked',
  'I was charged the wrong amount': 'clientBooking.support.reason.wrongAmount',
  'I cancelled within their policy': 'clientBooking.support.reason.cancelledWithinPolicy',
  'Lateness or a no-show': 'clientBooking.support.reason.lateness',
  'Quality of the service': 'clientBooking.support.reason.quality',
  'Hygiene or safety': 'clientBooking.support.reason.hygiene',
  'How I was treated': 'clientBooking.support.reason.treatment',
  [OTHER_SUPPORT_REASON]: 'clientBooking.support.reason.somethingElse',
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
  // The lines are refund-policy statements, held in English
  // (clientBookingHeld); only the titles are translated.
  const provider = booking.providerName?.trim() || 'your provider';
  const Provider = provider.charAt(0).toUpperCase() + provider.slice(1);
  const money = (n: number) => `£${n.toFixed(2)}`;

  if (getRefundRequestScope(booking) === 'off_app') {
    return {
      title: tr('clientBooking.refundScope.notPaidTitle'),
      lines: [
        tr('clientBooking.refundScope.notPaidLine1'),
        tr('clientBooking.refundScope.notPaidLine2', { provider }),
      ],
    };
  }

  const isDeposit = booking.paymentType === 'deposit' || booking.paymentStatus === PaymentStatus.DEPOSIT_PAID;
  const paid = Number(booking.amountPaid || 0);
  const balance = Number(booking.remainingBalance || 0);
  const lines: string[] = [];
  if (isDeposit) {
    lines.push(balance > 0
      ? tr('clientBooking.refundScope.depositBalance', { paid: money(paid), balance: money(balance), provider })
      : tr('clientBooking.refundScope.depositOnly', { paid: money(paid), provider }));
    lines.push(tr('clientBooking.refundScope.depositKeep', { provider: Provider }));
  } else {
    lines.push(tr('clientBooking.refundScope.fullKeep', { provider: Provider }));
  }
  return { title: tr('clientBooking.refundScope.reviewTitle'), lines };
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

export interface BookingSupportResult {
  /** Null only for a refund request whose ticket didn't file (the request
   *  itself is recorded and the provider told). */
  ticketNumber: number | null;
}

export async function fileBookingSupportRequest(
  booking: ConfirmedBooking,
  kind: BookingSupportKind,
  reason: string,
  message: string,
  activeMode: string,
): Promise<BookingSupportResult> {
  const refundRequestId = kind === 'refund'
    ? await requestBookingRefund(booking.id, reason, message.trim())
    : undefined;

  const ticket = () => invokeSendSupportRequest({
    // Must be one of send-support-request's CATEGORIES or it is rejected.
    category: kind === 'refund' ? 'Payment' : 'Provider Issue',
    description: buildBookingSupportDescription(booking, kind, reason, message),
    platform: `${Platform.OS} ${String(Platform.Version)}`,
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    activeMode,
    ...(refundRequestId ? { refundRequestId } : {}),
  });

  if (!refundRequestId) {
    const { ticketNumber } = await ticket();
    return { ticketNumber };
  }
  try {
    const { ticketNumber } = await ticket();
    return { ticketNumber };
  } catch (e) {
    // Swallowed on purpose, and only here: the request above already exists
    // and the provider has it, so throwing would say it failed when it didn't.
    logger.error('[bookingSupportRequest] refund request recorded but support ticket failed:', e);
    return { ticketNumber: null };
  }
}

/**
 * The provider isn't refunding a client's request, so it goes to Cerviced.
 * Same two steps as a client's request: pass_refund_request_to_cerviced() is
 * the record (and tells the client); the ticket gives support the provider's
 * side, and its failing returns `ticketNumber: null` rather than throwing.
 */
export async function passRefundRequestOn(
  booking: ConfirmedBooking,
  request: Pick<RefundRequest, 'id' | 'reason'>,
  note: string,
  activeMode: string,
): Promise<BookingSupportResult> {
  await passRefundRequestToCerviced(request.id, note.trim());
  try {
    const { ticketNumber } = await invokeSendSupportRequest({
      category: 'Payment',
      description: [
        `REFUND REQUEST PASSED TO CERVICED — ${formatBookingRef(booking)}`,
        '',
        `The provider is not refunding this and asks Cerviced to review it.`,
        '',
        `Booking: ${booking.serviceName} for ${booking.customerName || 'the client'}`,
        `Date: ${booking.bookingDate} ${booking.bookingTime}`,
        `Payment: ${booking.paymentStatus}`,
        `Booking id: ${booking.id}`,
        `Refund request: ${request.id}`,
        `Client's reason: ${request.reason}`,
        '',
        "Provider's reason:",
        note.trim(),
      ].join('\n'),
      platform: `${Platform.OS} ${String(Platform.Version)}`,
      appVersion: Constants.expoConfig?.version ?? 'unknown',
      activeMode,
    });
    return { ticketNumber };
  } catch (e) {
    logger.error('[bookingSupportRequest] refund request passed on but support ticket failed:', e);
    return { ticketNumber: null };
  }
}
