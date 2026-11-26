// English · clientAccount — Client account screens: profile info, points, subscription, billing, notification settings, messages and chat.
// Source of truth for this area's keys; see ./index.ts for the conventions.

export const clientAccount = {} as const;

/** Keys in this area HELD IN ENGLISH in every language (legal, refund,
 *  cancellation, payment, age and health-safety copy). See ../../translate.ts. */
export const clientAccountHeld: readonly (keyof typeof clientAccount)[] = [];
