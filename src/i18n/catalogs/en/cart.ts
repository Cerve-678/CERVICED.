// English · cart — Cart, checkout, promo codes, payment methods.
// Source of truth for this area's keys; see ./index.ts for the conventions.

export const cart = {} as const;

/** Keys in this area HELD IN ENGLISH in every language (legal, refund,
 *  cancellation, payment, age and health-safety copy). See ../../translate.ts. */
export const cartHeld: readonly (keyof typeof cart)[] = [];
