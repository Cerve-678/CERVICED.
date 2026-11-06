// src/features/providers/conversionSteps.ts
// The words on the "converting your profile" screen a link-only provider sees
// after confirming Become a full member. Every step names something
// become_full_member() (20261102190000_become_full_member.sql) or the app
// really does. A link-only provider has no CERVICED bookings, so nothing is
// "moved": bookings are turned on, the link comes down, and the go-live gate
// re-runs on the full checklist.
import { buildGoLiveSteps, type GoLiveStatus } from './goLiveStatus';

export interface ConversionStep {
  /** The row in the checklist. */
  label: string;
  /** The bold line in the top square while this step runs. */
  lead: string;
}

/** isLive is providers.has_gone_live after the switch, or null while it's
 *  still unknown. The full gate is longer than the link-only one, so it is
 *  almost always false; when it isn't, step six says so instead of claiming
 *  they came off Search. */
export function buildConversionSteps(isLive: boolean | null): ConversionStep[] {
  return [
    { label: 'Turning on bookings in CERVICED', lead: 'Turning on CERVICED bookings.' },
    { label: 'Taking down your own booking link', lead: 'Taking down your booking link.' },
    { label: 'Unlocking your full member tools', lead: 'Unlocking your full tools.' },
    { label: 'Keeping your logo, About, hours and portfolio', lead: "Keeping everything you've built." },
    { label: 'Keeping your messages, followers and saves', lead: 'Keeping your clients close.' },
    isLive
      ? { label: 'Keeping you on Search', lead: 'Keeping you on Search.' }
      : { label: "Taking you off Search until you're live", lead: 'Pausing Search until you go live.' },
    { label: "Checking what's left before you go live", lead: "Checking what's left to go live." },
  ];
}

/** After step N the mock tab bar ticks one more tab, left to right, so the
 *  four tabs finish with the seventh step. */
export const CONVERSION_TAB_TICK_AFTER_STEP = [2, 3, 5, 7] as const;

/** What a full member can do that a link-only provider can't. Each line is
 *  promised on the Full CERVICED experience page too. */
export const FULL_MEMBER_NOW_YOU_CAN = [
  'Take bookings and payments in CERVICED',
  'Fill your diary from followers and your waitlist',
  'Send announcements and run promotions',
  'See your full analytics',
] as const;

/** How many of the steps the server gates go-live on are still not done. */
export function countLeftToGoLive(status: GoLiveStatus): number {
  return buildGoLiveSteps(status).filter(step => step.blocking && !step.done).length;
}
