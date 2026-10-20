// English · auth — Sign-in, sign-up steps, password reset, welcome intro, coach-mark tours.
// Source of truth for this area's keys; see ./index.ts for the conventions.

export const auth = {} as const;

/** Keys in this area HELD IN ENGLISH in every language (legal, refund,
 *  cancellation, payment, age and health-safety copy). See ../../translate.ts. */
export const authHeld: readonly (keyof typeof auth)[] = [];
