// src/utils/coachMarkTours.ts
// Which coach-mark tour steps an account still needs to be shown.
//
// This replaces a per-device boolean. That boolean could answer exactly one
// question — "has this install ever finished this tour" — and three of the
// things the tours are for are not that question:
//
//   * A brand-new account should see its tour once. A boolean did that, but
//     only until the app was reinstalled or the account signed in on a second
//     device, because it lived in AsyncStorage and nowhere else.
//   * Adding a step for a NEW feature should reach people who are already
//     using the app. With a boolean the only lever was renaming the key,
//     which replays the whole tour for everyone including accounts that
//     signed up yesterday and have never seen any of it.
//   * The flag was written only when the tour reached its last step or was
//     skipped. Switching tabs, backgrounding, or killing the app part-way
//     wrote nothing, so the tour came back on the next launch — forever, for
//     anyone who never tapped all the way through. That is the "it shows
//     every time I log in" report.
//
// So a tour records a VERSION per account instead. Each step declares the
// version it arrived in; an account that has seen version N is shown only
// steps newer than N. A new account has seen nothing and gets everything.

/** Stable per-tour identifiers. These are persisted — in users.seen_tours and
 *  in the device cache — so renaming one makes every account look unseen and
 *  replays that tour for everybody. Add a new key instead. */
export const TOUR_KEYS = {
  CLIENT_HOME: 'client_home',
  CLIENT_EXPLORE: 'client_explore',
  PROVIDER_HOME: 'provider_home',
} as const;

export type TourKey = (typeof TOUR_KEYS)[keyof typeof TOUR_KEYS];

/**
 * The newest step version each tour contains.
 *
 * To show existing users something new: give the new step `sinceVersion: N+1`
 * and raise this to N+1. Accounts sitting at N see that step and nothing they
 * have already been walked through; accounts that have never seen the tour
 * still get all of it. Never lower one — versions only move forward, and the
 * database enforces that too.
 */
export const TOUR_CURRENT_VERSION: Record<TourKey, number> = {
  client_home: 1,
  client_explore: 1,
  provider_home: 1,
};

/** A step's shape as far as this module cares — the real CoachMarkStep adds
 *  the refs and copy, none of which affect who should see it. */
export type VersionedStep = {
  key: string;
  /** Version this step first shipped in. Absent means it was in the original
   *  tour, i.e. 1. */
  sinceVersion?: number;
};

export type TourDecision<S> =
  | { show: false }
  /** `stampVersion` is what to record once the tour is displayed — the tour's
   *  current version, not the highest step shown, so a user who is caught up
   *  is not asked again by a later step that was already skipped. */
  | { show: true; steps: S[]; stampVersion: number };

/**
 * What to show an account, given the version it has already seen.
 *
 * `seenVersion` is null for an account with no record at all — a genuinely
 * new user, who sees the whole tour. 0 is NOT the same thing and should not
 * be substituted for it; a stored 0 would mean "seen, but before versions
 * existed" and would show every step anyway, which is the right outcome, but
 * the two arrive by different routes and conflating them hides a bad read.
 */
export function resolveTour<S extends VersionedStep>(
  tour: TourKey,
  steps: S[],
  seenVersion: number | null,
): TourDecision<S> {
  const current = TOUR_CURRENT_VERSION[tour];
  const unseen =
    seenVersion == null
      ? steps
      : steps.filter(step => (step.sinceVersion ?? 1) > seenVersion);

  if (unseen.length === 0) return { show: false };
  return { show: true, steps: unseen, stampVersion: current };
}

/**
 * Read one tour's version out of the `{tour_key: version}` map the account
 * carries, tolerating anything that isn't a positive integer.
 *
 * The map comes back from the database and from a device cache that may have
 * been written by an older build, so a malformed entry is treated as "no
 * record" — showing a tour again is a far smaller failure than throwing on
 * the render path of the app's first screen.
 */
export function seenVersionFor(
  seenTours: Record<string, unknown> | null | undefined,
  tour: TourKey,
): number | null {
  const raw = seenTours?.[tour];
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) return null;
  return raw;
}
