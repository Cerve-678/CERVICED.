// src/stores/useCircleStore.ts
//
// The people you follow who recommend or have been to each provider, for the
// face stack on cards. Cards ask for their own provider with
// useCircleFor(providerId); requests made in the same moment are gathered and
// sent as ONE get_circle_for_providers call (up to 300 ids), so a screen full
// of cards costs one round trip, not one per card.
//
// Only active on the client hat while signed in (see useCircleEnabledSync).
// It's decoration: a failed fetch logs and leaves cards without a stack
// rather than showing an error.

import { useEffect } from 'react';
import { create } from 'zustand';
import { CIRCLE_BATCH_LIMIT, getCircleForProviders } from '../services/databaseService';
import type { CirclePerson } from '../features/social/types';
import { logger } from '../utils/logger';

/** How long a provider's stack is trusted before it's fetched again. */
const CIRCLE_TTL_MS = 5 * 60 * 1000;
/** After a failed fetch, wait this long before trying those ids again. */
const CIRCLE_RETRY_MS = 60 * 1000;
/** Gather requests from cards mounting together into one call. */
const CIRCLE_BATCH_DELAY_MS = 40;

/** Shared empty list so cards with nobody keep a stable reference. */
export const NO_CIRCLE: readonly CirclePerson[] = Object.freeze([]);

interface CircleStore {
  enabled: boolean;
  byProvider: Record<string, readonly CirclePerson[]>;
  setEnabled: (enabled: boolean) => void;
  request: (providerId: string) => void;
  /** Forget everything, e.g. after following or unfollowing someone. */
  invalidate: () => void;
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

  return {
    enabled: false,
    byProvider: {},
    setEnabled: (enabled) => {
      if (get().enabled === enabled) return;
      reset();
      set({ enabled, byProvider: {} });
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
  useEffect(() => {
    if (enabled && providerId) useCircleStore.getState().request(providerId);
  }, [enabled, providerId]);
  return people;
}

/** Mount once under AuthProvider: turns the stacks on only for a signed-in client hat. */
export function useCircleEnabledSync(enabled: boolean): void {
  useEffect(() => {
    useCircleStore.getState().setEnabled(enabled);
  }, [enabled]);
}
