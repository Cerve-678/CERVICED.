// src/utils/slotsRowText.ts
// What the slots pill on a provider's profile says, and whether it can be
// said yet.
//
// The pill has two possible sources and they are not equally slow.
// scheduleReleaseDay rides along on the profile row itself, in the very first
// getProviderBySlug call. The availability summary is a separate, much
// heavier fetch that lands well after the profile has painted.
//
// The screen used to hide the whole row — pill, notification bell and all —
// until availability resolved, even for a provider whose text never reads
// availability at all. They sat behind a query whose answer was then thrown
// away, so the row popped in a beat late for no reason.

import { ordinalSuffix } from './dateUtils';

/** The minimum an availability summary must expose for this decision. Kept
 *  structural rather than importing AvailabilitySummary, so this helper
 *  stays clear of the service layer and the Supabase client behind it. */
export type SlotsAvailability = { state: string; headline: string };

export type SlotsRow =
  /** Nothing truthful to show yet — the row stays hidden this render. */
  | { kind: 'waiting' }
  | { kind: 'text'; text: string };

/**
 * A provider who publishes on a fixed day of the month says THAT and nothing
 * else. Today's open/closed headline is the wrong answer for someone waiting
 * on next month's diary to drop, and pairing the two ("New slots drop on the
 * 20th · Open today until 6pm") reads as two competing claims about when you
 * can book. The release day replaces the availability line, it doesn't lead
 * it — which is also why a provider who has one never waits on availability.
 *
 * 'unpublished' is deliberately not surfaced as a headline: the booking RPC
 * rejects every booking for a provider with no schedule, so the pill falls
 * back to "Availability on request" rather than asserting an opening.
 */
export function resolveSlotsRow(args: {
  scheduleReleaseDay: number | null;
  availability: SlotsAvailability | null;
  availabilityLoading: boolean;
}): SlotsRow {
  const { scheduleReleaseDay, availability, availabilityLoading } = args;

  if (scheduleReleaseDay != null) {
    return { kind: 'text', text: `New slots drop on the ${ordinalSuffix(scheduleReleaseDay)}` };
  }
  if (availabilityLoading) return { kind: 'waiting' };

  const headline =
    availability && availability.state !== 'unpublished' ? availability.headline : '';
  return { kind: 'text', text: headline || 'Availability on request' };
}
