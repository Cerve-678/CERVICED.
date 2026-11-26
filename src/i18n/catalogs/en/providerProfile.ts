// English · providerProfile — Provider My Profile, business info/details, About You, branding, services & pricing, policies, scheduling, link-only screens.
// Source of truth for this area's keys; see ./index.ts for the conventions.

export const providerProfile = {} as const;

/** Keys in this area HELD IN ENGLISH in every language (legal, refund,
 *  cancellation, payment, age and health-safety copy). See ../../translate.ts. */
export const providerProfileHeld: readonly (keyof typeof providerProfile)[] = [];
