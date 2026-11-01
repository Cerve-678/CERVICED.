export type BookingReviewState = {
  bookingId: string;
  /** A review row exists for this booking. */
  reviewed: boolean;
  /** A tip for this booking has actually been paid (booking_tips, succeeded). */
  tipped: boolean;
};

/**
 * One state per booking from the two independent sources. A tip is its own
 * payment, so a booking can be tipped without being rated and vice versa —
 * a paid tip must never make the list show "Rated".
 */
export function mergeBookingReviewStates(
  reviewedBookingIds: readonly string[],
  tippedBookingIds: readonly string[],
): BookingReviewState[] {
  const reviewed = new Set(reviewedBookingIds);
  const tipped = new Set(tippedBookingIds);
  return [...new Set([...reviewed, ...tipped])].map(bookingId => ({
    bookingId,
    reviewed: reviewed.has(bookingId),
    tipped: tipped.has(bookingId),
  }));
}
