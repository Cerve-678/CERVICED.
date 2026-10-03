import { BookingStatus } from '../../types/booking';

/**
 * What the provider's day/week timeline draws. A cancelled booking stays on
 * the calendar (in red) so the provider can see the gap it left, until
 * another booking takes any of that time: then the new booking replaces it
 * on the timeline. The cancelled one still shows in the list and in history.
 * Completed and no-show bookings count as taking the time; they're real
 * appointments that happened, or were due to.
 */
export interface TimelineBooking {
  id: string;
  status: BookingStatus | string;
  bookingDate: string;
}

export function withoutReplacedCancellations<T extends TimelineBooking>(
  bookings: readonly T[],
  span: (booking: T) => { start: number; end: number },
): T[] {
  const live = bookings.filter(b => b.status !== BookingStatus.CANCELLED);
  return bookings.filter(b => {
    if (b.status !== BookingStatus.CANCELLED) return true;
    const mine = span(b);
    return !live.some(other => {
      if (other.bookingDate !== b.bookingDate) return false;
      const theirs = span(other);
      return theirs.start < mine.end && theirs.end > mine.start;
    });
  });
}
