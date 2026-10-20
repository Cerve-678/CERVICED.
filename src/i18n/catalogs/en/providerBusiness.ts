// English · providerBusiness — Provider analytics, automations, clientele, communications, inbox, promotions, payments and payouts.
// Source of truth for this area's keys; see ./index.ts for the conventions.

export const providerBusiness = {} as const;

/** Keys in this area HELD IN ENGLISH in every language (legal, refund,
 *  cancellation, payment, age and health-safety copy). See ../../translate.ts. */
export const providerBusinessHeld: readonly (keyof typeof providerBusiness)[] = [];
