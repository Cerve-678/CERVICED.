// English · shared — Screens and pieces both hats use: Becca chrome, Notifications list, About, Terms, password/credential screens, report a problem, dialogs, error boundary, navigation labels, user-facing error copy.
// Source of truth for this area's keys; see ./index.ts for the conventions.

export const shared = {} as const;

/** Keys in this area HELD IN ENGLISH in every language (legal, refund,
 *  cancellation, payment, age and health-safety copy). See ../../translate.ts. */
export const sharedHeld: readonly (keyof typeof shared)[] = [];
