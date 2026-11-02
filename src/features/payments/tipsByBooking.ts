// Pairs each tip with the booking payment it was left on, so Booking payments
// can show a booking and its tip as one card. Tips whose booking isn't in the
// list (it only holds the latest 50 payments) come back as `unmatched` and keep
// their own section, so no tip silently disappears from the screen.

export interface TipsByBooking<T> {
  byBooking: Map<string, T[]>;
  unmatched: T[];
}

export function groupTipsByBooking<T extends { bookingId: string }>(
  bookingIds: readonly string[],
  tips: readonly T[],
): TipsByBooking<T> {
  const shown = new Set(bookingIds);
  const byBooking = new Map<string, T[]>();
  const unmatched: T[] = [];
  for (const tip of tips) {
    if (!shown.has(tip.bookingId)) { unmatched.push(tip); continue; }
    const list = byBooking.get(tip.bookingId);
    if (list) list.push(tip);
    else byBooking.set(tip.bookingId, [tip]);
  }
  return { byBooking, unmatched };
}
