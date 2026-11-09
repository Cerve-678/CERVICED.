// src/stores/useCircleStore.ts
//
// The people you follow who recommend or have been to each provider, for the
// face stack on cards — plus your own face first on providers you recommend
// (your screen only; get_my_recommended_providers).
// Cards ask for their own provider with useCircleFor(providerId); requests
// made in the same moment are gathered and sent as ONE get_circle_for_providers call (up to 300 ids), so a screen full
// of cards costs one round trip, not one per card.
//
// Only active on the client hat while signed in (see useCircleEnabledSync),
// which also re-reads everything when the app comes back to the front, so a
// friend's new recommend shows without restarting the app.
// It's decoration: a failed fetch logs and leaves cards without a stack
// rather than showing an error.

import { useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { CIRCLE_BATCH_LIMIT, getCircleForProviders, getMyRecommendedProviders } from '../services/databaseService';
import type { CirclePerson } from '../features/social/types';
import { logger } from '../utils/logger';

/** How long a provider's stack is trusted before it's fetched again. */
const CIRCLE_TTL_MS = 5 * 60 * 1000;
/** After a failed fetch, wait this long before trying those ids again. */
const CIRCLE_RETRY_MS = 60 * 1000;
/** Gather requests from cards mounting together into one call. */
const CIRCLE_BATCH_DELAY_MS = 40;
/** Coming back to the app re-reads the stacks at most this often. */
const FOREGROUND_REFRESH_MIN_MS = 30 * 1000;

/** Shared empty list so cards with nobody keep a stable reference. */
export const NO_CIRCLE: readonly CirclePerson[] = Object.freeze([]);

interface CircleStore {
  enabled: boolean;
  byProvider: Record<string, readonly CirclePerson[]>;
  /** Your own face, first on providers you recommend (your screen only). */
  me: { name: string; avatarUrl: string | null } | null;
  myRecommends: Record<string, true>;
  setEnabled: (enabled: boolean) => void;
  request: (providerId: string) => void;
  /** Forget everything, e.g. after following or unfollowing someone. */
  invalidate: () => void;
  /** After you recommend, undo, or hide a provider. */
  setMyRecommend: (providerId: string, on: boolean) => void;
  /** Re-read which providers you recommend (e.g. after hiding one). */
  reloadMine: () => void;
  /** Re-read every stack already loaded, keeping what's shown until the answer comes. */
  refresh: () => void;
}

const pending = new Set<string>();
const inFlight = new Set<string>();
/** providerId → when it may be fetched again. */
const freshUntil = new Map<string, number>();
let timer: ReturnType<typeof setTimeout> | null = null;
/** Bumped on invalidate/disable so a late response can't write stale data. */
let generation = 0;

export const useCircleStore = create<CircleStore>((set, get) => {
  const flush = async (): Promise<void> => {
    timer = null;
    if (!get().enabled) {
      pending.clear();
      return;
    }
    const now = Date.now();
    const ids = Array.from(pending).filter(
      (id) => !inFlight.has(id) && (freshUntil.get(id) ?? 0) <= now,
    );
    pending.clear();
    if (ids.length === 0) return;

    const myGeneration = generation;
    for (let i = 0; i < ids.length; i += CIRCLE_BATCH_LIMIT) {
      const chunk = ids.slice(i, i + CIRCLE_BATCH_LIMIT);
      chunk.forEach((id) => inFlight.add(id));
      try {
        const result = await getCircleForProviders(chunk);
        if (myGeneration !== generation) return;
        const until = Date.now() + CIRCLE_TTL_MS;
        const next = { ...get().byProvider };
        for (const id of chunk) {
          next[id] = result[id] ?? NO_CIRCLE;
          freshUntil.set(id, until);
        }
        set({ byProvider: next });
      } catch (err) {
        logger.warn('[circle] could not load who you follow for these cards', err);
        const retryAt = Date.now() + CIRCLE_RETRY_MS;
        chunk.forEach((id) => freshUntil.set(id, retryAt));
      } finally {
        chunk.forEach((id) => inFlight.delete(id));
      }
    }
  };

  const reset = (): void => {
    generation += 1;
    pending.clear();
    freshUntil.clear();
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const loadMine = async (): Promise<void> => {
    const myGeneration = generation;
    try {
      const mine = await getMyRecommendedProviders();
      if (myGeneration !== generation || !get().enabled) return;
      const myRecommends: Record<string, true> = {};
      mine.providerIds.forEach((id) => { myRecommends[id] = true; });
      set({ me: { name: mine.name ?? '', avatarUrl: mine.avatarUrl }, myRecommends });
    } catch (err) {
      logger.warn('[circle] could not load the providers you recommend', err);
    }
  };

  return {
    enabled: false,
    byProvider: {},
    me: null,
    myRecommends: {},
    setEnabled: (enabled) => {
      if (get().enabled === enabled) return;
      reset();
      set({ enabled, byProvider: {}, me: null, myRecommends: {} });
      if (enabled) void loadMine();
    },
    setMyRecommend: (providerId, on) => {
      const next = { ...get().myRecommends };
      if (on) next[providerId] = true; else delete next[providerId];
      set({ myRecommends: next });
    },
    reloadMine: () => {
      if (get().enabled) void loadMine();
    },
    refresh: () => {
      if (!get().enabled) return;
      freshUntil.clear();
      Object.keys(get().byProvider).forEach((id) => pending.add(id));
      if (pending.size > 0 && !timer) timer = setTimeout(() => void flush(), CIRCLE_BATCH_DELAY_MS);
      void loadMine();
    },
    request: (providerId) => {
      if (!get().enabled || !providerId) return;
      if ((freshUntil.get(providerId) ?? 0) > Date.now() || inFlight.has(providerId)) return;
      pending.add(providerId);
      if (!timer) timer = setTimeout(() => void flush(), CIRCLE_BATCH_DELAY_MS);
    },
    invalidate: () => {
      reset();
      set({ byProvider: {} });
    },
  };
});

/** The stack for one provider's card. Empty until loaded, or when nobody you follow has been. */
export function useCircleFor(providerId: string | null | undefined): readonly CirclePerson[] {
  const enabled = useCircleStore((s) => s.enabled);
  const people = useCircleStore((s) => (providerId ? s.byProvider[providerId] : undefined) ?? NO_CIRCLE);
  const me = useCircleStore((s) => s.me);
  const iRecommend = useCircleStore((s) => (providerId ? s.myRecommends[providerId] === true : false));
  useEffect(() => {
    if (enabled && providerId) useCircleStore.getState().request(providerId);
  }, [enabled, providerId]);
  return useMemo(() => {
    if (!iRecommend || !me) return people;
    const mine: CirclePerson = { personId: 'me', name: me.name, avatarUrl: me.avatarUrl, recommends: true, visits: 0, isMe: true };
    return [mine, ...people];
  }, [people, me, iRecommend]);
}

/** Mount once under AuthProvider: turns the stacks on only for a signed-in client hat. */
export function useCircleEnabledSync(enabled: boolean): void {
  useEffect(() => {
    useCircleStore.getState().setEnabled(enabled);
  }, [enabled]);

  // Back from the background: someone you follow may have recommended or
  // visited meanwhile, so re-read rather than wait out the 5-minute cache.
  useEffect(() => {
    if (!enabled) return undefined;
    let last = Date.now();
    let previous = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      const cameBack = previous !== 'active' && next === 'active';
      previous = next;
      if (!cameBack || Date.now() - last < FOREGROUND_REFRESH_MIN_MS) return;
      last = Date.now();
      useCircleStore.getState().refresh();
    });
    return () => sub.remove();
  }, [enabled]);
}
