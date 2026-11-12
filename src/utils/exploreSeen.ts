import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from './storageKeys';
import { logger } from './logger';

/**
 * Which Explore photos this phone has already shown, so the next visit leads
 * with ones it hasn't.
 *
 * The feed is reshuffled on every load, but a shuffle of the same pool still
 * deals every provider's photos at random, so the same favourites keep turning
 * up at the top and a refresh can look like a rerun. Remembering what was on
 * screen lets each provider lead with a photo the viewer hasn't seen, and puts
 * the ones they have at the back (longest-ago first) until everything has had
 * a turn.
 *
 * Device-only on purpose: it is a browsing convenience, never sent anywhere,
 * and losing it just means the next feed is an ordinary shuffle.
 */

/** How many photos to remember. More than the whole live catalogue today. */
export const EXPLORE_SEEN_LIMIT = 600;
/** After this long a photo counts as fresh again. */
export const EXPLORE_SEEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type SeenMap = Map<string, number>;

/** Keep the newest `limit` entries younger than the TTL. */
export function pruneSeen(seen: SeenMap, now: number, limit = EXPLORE_SEEN_LIMIT): SeenMap {
  const kept = [...seen.entries()]
    .filter(([, at]) => now - at < EXPLORE_SEEN_TTL_MS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  return new Map(kept);
}

/** Mark keys as seen at `now`, keeping the earlier time for one already seen
 *  this visit, so scrolling past a card again doesn't make it "newer". */
export function markSeen(seen: SeenMap, keys: readonly string[], now: number, since: number): SeenMap {
  const next = new Map(seen);
  for (const key of keys) {
    const at = next.get(key);
    if (at === undefined || at < since) next.set(key, now);
  }
  return next;
}

let memory: SeenMap | null = null;
let loading: Promise<SeenMap> | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
const sessionStart = Date.now();

/** The remembered photos, read from storage once per app run. */
export function loadExploreSeen(): Promise<SeenMap> {
  if (memory) return Promise.resolve(memory);
  if (!loading) {
    loading = AsyncStorage.getItem(STORAGE_KEYS.EXPLORE_SEEN)
      .then((raw) => {
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        const entries = Array.isArray(parsed)
          ? parsed.filter(
              (e): e is [string, number] =>
                Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'number',
            )
          : [];
        memory = pruneSeen(new Map(entries), Date.now());
        return memory;
      })
      .catch((error: unknown) => {
        // Unreadable storage just means an ordinary shuffle this time.
        logger.warn('Explore seen list unreadable', error);
        memory = new Map();
        return memory;
      });
  }
  return loading;
}

/** The remembered photos as already loaded, or an empty map before that. */
export function exploreSeenNow(): SeenMap {
  return memory ?? new Map();
}

/** Forget everything (sign-out). The caller removes the stored copy. */
export function resetExploreSeen(): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
  memory = new Map();
  loading = null;
}

/** Remember these photos as shown. Written to storage after a short pause so
 *  scrolling doesn't write on every batch. */
export function recordExploreSeen(keys: readonly string[]): void {
  if (keys.length === 0) return;
  const now = Date.now();
  memory = pruneSeen(markSeen(memory ?? new Map(), keys, now, sessionStart), now);
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    const snapshot = [...(memory ?? new Map()).entries()];
    AsyncStorage.setItem(STORAGE_KEYS.EXPLORE_SEEN, JSON.stringify(snapshot)).catch((error: unknown) =>
      logger.warn('Explore seen list not saved', error),
    );
  }, 1500);
}
