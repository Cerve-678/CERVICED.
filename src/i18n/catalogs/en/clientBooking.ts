// English · clientBooking — Booking sheets, calendar, Bookings list, booking detail, reschedule, intake forms, waitlist.
// Source of truth for this area's keys; see ./index.ts for the conventions.

export const clientBooking = {} as const;

/** Keys in this area HELD IN ENGLISH in every language (legal, refund,
 *  cancellation, payment, age and health-safety copy). See ../../translate.ts. */
export const clientBookingHeld: readonly (keyof typeof clientBooking)[] = [];
