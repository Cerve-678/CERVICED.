// English · providerSetup — Provider registration (InfoReg) and its pager, pickers and service image tools.
// Source of truth for this area's keys; see ./index.ts for the conventions.

export const providerSetup = {} as const;

/** Keys in this area HELD IN ENGLISH in every language (legal, refund,
 *  cancellation, payment, age and health-safety copy). See ../../translate.ts. */
export const providerSetupHeld: readonly (keyof typeof providerSetup)[] = [];
