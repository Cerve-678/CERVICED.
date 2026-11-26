// English · discover — Client Home, Explore, Search, provider profile pages, saved providers, offers, location pickers.
// Source of truth for this area's keys; see ./index.ts for the conventions.

export const discover = {} as const;

/** Keys in this area HELD IN ENGLISH in every language (legal, refund,
 *  cancellation, payment, age and health-safety copy). See ../../translate.ts. */
export const discoverHeld: readonly (keyof typeof discover)[] = [];
