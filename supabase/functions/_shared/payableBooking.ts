// Whether a booking's held payout is owed to the provider at release.
// Pure, so release-payouts and its tests share one rule.

/** Booking states in which the provider is genuinely owed their payout. */
export const PAYABLE_BOOKING_STATUSES = ['confirmed', 'completed'] as const;

/** The refund reason a client's "Provider didn't turn up" report files
 *  (client_mark_provider_no_show → request_booking_refund). */
export const PROVIDER_NO_SHOW_REFUND_REASON = "The provider didn't turn up";

/**
 * Owed: a confirmed or completed booking. Also a booking the client reported
 * as a provider no-show once Cerviced has DECLINED that refund request:
 * Cerviced decided the provider did turn up, so the money is theirs. The
 * booking keeps its provider_no_show status (the owner's call, 26 November
 * 2026: no "Completed", so no review prompt, points or reminders for the
 * client). Anything else (cancelled, declined, still pending, a no-show the
 * provider refunded or nobody has decided) is not owed.
 *
 * latestNoShowRequestStatus is the status of the booking's most recent refund
 * request with PROVIDER_NO_SHOW_REFUND_REASON, or null/undefined if none.
 */
export function isPayoutOwed(bookingStatus: string | null | undefined, latestNoShowRequestStatus?: string | null): boolean {
  if (!bookingStatus) return false;
  if ((PAYABLE_BOOKING_STATUSES as readonly string[]).includes(bookingStatus)) return true;
  return bookingStatus === 'provider_no_show' && latestNoShowRequestStatus === 'declined';
}
