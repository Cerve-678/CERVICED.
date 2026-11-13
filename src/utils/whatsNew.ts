// src/utils/whatsNew.ts
// Who is owed which "What's new" release notes. Pure — no storage, no network.
//
// The notes themselves live in src/data/whatsNew.ts, one entry per build.
// Seen-state rides on the walkthrough machinery (users.seen_tours, via
// tourService) under one key per hat, with each release acting as a versioned
// "step": an account that has seen release N is owed only releases above N.
//
// The one rule walkthroughs don't have: notes describe a CHANGE, so they only
// mean something to someone who used the app before it. An account created on
// or after a release's date is never shown that release — otherwise everyone
// who signs up would open the app to a list of "new" things they never saw
// the old version of.

import type { WhatsNewHat, WhatsNewItem, WhatsNewRelease } from '../data/whatsNew';

/** Who is reading. Link-only providers share the provider seen-record but
 *  skip items for features their tabs don't have. */
export type WhatsNewAudience = 'client' | 'provider' | 'linkOnlyProvider';

export function hatForAudience(audience: WhatsNewAudience): WhatsNewHat {
  return audience === 'client' ? 'client' : 'provider';
}

/** The notes in one release for this audience. */
export function notesFor(release: WhatsNewRelease, audience: WhatsNewAudience): WhatsNewItem[] {
  if (audience === 'client') return release.client;
  if (audience === 'provider') return release.provider;
  return release.provider.filter(item => !item.fullMembersOnly);
}

/** When someone has fallen several builds behind, show this many at most. */
export const WHATS_NEW_MAX_SHOWN = 3;

/** Releases that have something to say to this audience, newest first. */
export function releasesFor(
  releases: readonly WhatsNewRelease[],
  audience: WhatsNewAudience,
): WhatsNewRelease[] {
  return releases
    .filter(release => notesFor(release, audience).length > 0)
    .sort((a, b) => b.version - a.version);
}

/** Highest release version with notes for this hat, or 0 if there are none.
 *  This is what an account is stamped at once it has been shown the notes. */
export function latestWhatsNewVersion(
  releases: readonly WhatsNewRelease[],
  hat: WhatsNewHat,
): number {
  return releasesFor(releases, hat)[0]?.version ?? 0;
}

/**
 * The releases this account could be owed, before seen-state is
 * applied: ones with notes for this audience that came out after the account was
 * created. `accountCreatedAt` is an ISO timestamp; if it's missing the answer
 * is "none", since showing a brand-new person a changelog is the failure this
 * rule exists to prevent.
 */
export function releasesAfterSignup(
  releases: readonly WhatsNewRelease[],
  audience: WhatsNewAudience,
  accountCreatedAt: string | null | undefined,
): WhatsNewRelease[] {
  if (!accountCreatedAt) return [];
  const createdDay = accountCreatedAt.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(createdDay)) return [];
  return releasesFor(releases, audience).filter(release => createdDay < release.date);
}
