// src/utils/slotsRowText.ts
// What the slots pill on a provider's profile says.

import { ordinalSuffix } from './dateUtils';

/**
 * A provider who publishes on a fixed day of the month says THAT. Everyone
 * else says "Stay tuned": the bell beside it is the one switch for that
 * provider's updates (space opening up, announcements, offers), so the pill
 * invites the tap rather than repeating today's hours, which the Opening
 * hours section already shows.
 *
 * Both answers come from the profile row itself, so the pill never waits on
 * a slower fetch.
 */
export function slotsPillText(scheduleReleaseDay: number | null): string {
  return scheduleReleaseDay != null
    ? `New slots drop on the ${ordinalSuffix(scheduleReleaseDay)}`
    : 'Stay tuned';
}
