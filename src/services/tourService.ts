// src/services/tourService.ts
// Deciding whether to show a coach-mark walkthrough, and recording that it was.
//
// Two stores, deliberately:
//
//   users.seen_tours — the account's own record, and the source of truth. It
//     survives a reinstall and follows the account to a second device, which
//     a device-local flag could not. That is the actual reason walkthroughs
//     appeared to replay on every sign-in.
//
//   AsyncStorage       — a local cache, read first so the app's first screen
//     can decide without waiting on a network round-trip. Never authoritative.
//
// Both are written when a tour is SHOWN, not when it is finished. The old flag
// was written only on the last step or on Skip, so switching tabs, killing the
// app, or simply losing interest recorded nothing and the tour came back on
// every launch afterwards — forever, for anyone who never tapped through.

import { getSeenTours, markTourSeen } from './databaseService';
import { storage } from '../utils/storage';
import { logger } from '../utils/logger';
import {
  TOUR_SEEN_PREFIXES,
  tourSeenKey,
  type TourSeenPrefix,
} from '../utils/storageKeys';
import {
  resolveTour,
  seenVersionFor,
  TOUR_CURRENT_VERSION,
  type TourDecision,
  type TourKey,
  type VersionedStep,
} from '../utils/coachMarkTours';

const LOCAL_PREFIX: Record<TourKey, TourSeenPrefix> = {
  client_home: TOUR_SEEN_PREFIXES.CLIENT_HOME,
  client_explore: TOUR_SEEN_PREFIXES.CLIENT_EXPLORE,
  provider_home: TOUR_SEEN_PREFIXES.PROVIDER_HOME,
};

/** Reads the local cache, absorbing the pre-2026-08-31 boolean shape. `true`
 *  meant "finished the tour as it stood then", which is version 1 — mapping it
 *  to null instead would replay that tour once for every existing install. */
async function readLocalVersion(tour: TourKey, userId: string): Promise<number | null> {
  const raw = await storage
    .getItem<number | boolean>(tourSeenKey(LOCAL_PREFIX[tour], userId))
    .catch(() => null);
  if (raw === true) return 1;
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) return raw;
  return null;
}

/**
 * Which steps of `tour` this user still needs, if any.
 *
 * The local cache short-circuits the common case (a returning user who is
 * already caught up) with no network at all. Only a user who looks like they
 * are owed something costs a read of their account record — and that read is
 * what stops a reinstall replaying everything.
 *
 * If that read fails the local answer stands on its own. That degrades to
 * exactly the old device-only behaviour rather than failing in either
 * direction that matters: a brand-new account still gets its tour, and a
 * returning one still isn't shown it again.
 */
export async function resolveTourForUser<S extends VersionedStep>(
  tour: TourKey,
  steps: S[],
  userId: string,
): Promise<TourDecision<S>> {
  const local = await readLocalVersion(tour, userId);
  if (local != null && local >= TOUR_CURRENT_VERSION[tour]) return { show: false };

  let remote: number | null = null;
  try {
    remote = seenVersionFor(await getSeenTours(userId), tour);
  } catch (error) {
    logger.warn(`[tours] could not read seen_tours for ${tour}; using the local cache only:`, error);
    return resolveTour(tour, steps, local);
  }

  // The higher of the two wins. Local can legitimately lead remote (the write
  // below is best-effort), and remote leads local on a fresh install.
  const seen =
    local == null ? remote : remote == null ? local : Math.max(local, remote);
  return resolveTour(tour, steps, seen);
}

/**
 * Record that `tour` was shown, at `version`.
 *
 * Call this when the tour becomes visible, not when it completes. The local
 * write is awaited so a kill immediately afterwards still counts; the account
 * write is best-effort, because failing to reach the server is not a reason to
 * show someone the same walkthrough twice on this device.
 */
export async function recordTourSeen(
  tour: TourKey,
  userId: string,
  version: number = TOUR_CURRENT_VERSION[tour],
): Promise<void> {
  await storage
    .setItem(tourSeenKey(LOCAL_PREFIX[tour], userId), version)
    .catch((error: unknown) => {
      logger.error(`[tours] local seen-flag write failed for ${tour}:`, error);
    });
  await markTourSeen(tour, version).catch((error: unknown) => {
    logger.error(`[tours] seen_tours write failed for ${tour}:`, error);
  });
}
