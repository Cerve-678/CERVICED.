// What a link-only provider is told about full membership. Nothing is charged
// and no billing exists. The monthly price (£25.99, set 2026-11-02) was taken
// off every screen on 2026-11-06 while pricing is still being finalised — put
// it back here, and on the screens that import this file, once it is.
export const FULL_MEMBER_FREE_MONTHS = 2;

/** "2 months free on us" */
export const FULL_MEMBER_FREE_LINE = `${FULL_MEMBER_FREE_MONTHS} months free on us`;
/** The free months count from the day they go live again after switching,
 *  not from the tap (product owner, 2026-11-02; providers.full_member_free_from). */
export const FULL_MEMBER_FREE_START_LINE = 'Your free months start the day you go live.';
