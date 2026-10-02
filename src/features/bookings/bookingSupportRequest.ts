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
 * A refund request only makes sense for money that moved through the app's
 * own payment processor. A booking paid in person has nothing the app could
 * refund, and the app deliberately never tracks off-app payments — same gate
 * as the provider's Issue Refund action.
 */
export function canRequestRefund(booking: Pick<ConfirmedBooking, 'paymentStatus'>): boolean {
  return booking.paymentStatus === PaymentStatus.DEPOSIT_PAID
    || booking.paymentStatus === PaymentStatus.PAID_IN_FULL;
}

export function buildBookingSupportDescription(
  booking: ConfirmedBooking,
  kind: BookingSupportKind,
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
    'In their words:',
    message.trim(),
  ].join('\n');
}

export async function fileBookingSupportRequest(
  booking: ConfirmedBooking,
  kind: BookingSupportKind,
  message: string,
  activeMode: string,
): Promise<{ ticketNumber: number }> {
  const { ticketNumber } = await invokeSendSupportRequest({
    // Must be one of send-support-request's CATEGORIES or it is rejected.
    category: kind === 'refund' ? 'Payment' : 'Provider Issue',
    description: buildBookingSupportDescription(booking, kind, message),
    platform: `${Platform.OS} ${String(Platform.Version)}`,
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    activeMode,
  });
  return { ticketNumber };
}
