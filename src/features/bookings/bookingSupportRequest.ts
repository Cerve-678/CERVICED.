import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { invokeSendSupportRequest, passRefundRequestToCerviced, requestBookingRefund } from '../../services/databaseService';
import { formatBookingRef } from './presentation';
import { logger } from '../../utils/logger';
import { PaymentStatus, type ConfirmedBooking, type RefundRequest } from '../../types/booking';

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

/** Why a provider isn't refunding a client's request. Picked on the Pass to
 *  Cerviced sheet; 'Other' needs a note, the rest take an optional one. */
export const PASS_ON_REASONS = [
  'Service was done as booked',
  "Client didn't turn up",
  'Client cancelled too late',
  'Outside my refund policy',
  'Other',
] as const;
export type PassOnReason = typeof PASS_ON_REASONS[number];

/** The one reason string pass_refund_request_to_cerviced() stores, or null
 *  while the sheet can't be sent yet. */
export function composePassOnReason(reason: PassOnReason | null, note: string): string | null {
  const extra = note.trim();
  if (!reason || (reason === 'Other' && !extra)) return null;
  if (reason === 'Other') return extra;
  return extra ? `${reason}. ${extra}` : reason;
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
