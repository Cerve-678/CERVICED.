// English · providerBookings — Provider Home, schedule, booking detail and history, add booking, intake forms, info packs.
// Source of truth for this area's keys; see ./index.ts for the conventions.

export const providerBookings = {} as const;

/** Keys in this area HELD IN ENGLISH in every language (legal, refund,
 *  cancellation, payment, age and health-safety copy). See ../../translate.ts. */
export const providerBookingsHeld: readonly (keyof typeof providerBookings)[] = [];
