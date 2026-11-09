// src/stores/useSocialSettingsStore.ts
//
// The signed-in client's sharing settings (Private account, Show where I go,
// Findable by phone, the one-time notice) and follow counts, shared by the
// Your circle screen, the Recommend row on a provider profile and the
// after-booking moments, so they read one copy instead of each fetching it.
//
// The server owns every rule (under-18s, defaults); this only caches what
// get_my_social_settings returns. Keyed to the user it was loaded for, so a
// different account never reads the last one's settings.

import { create } from 'zustand';
import {
  getMySocialSettings,
  markWhereIGoNoticeSeen,
  updateMySocialSettings,
} from '../services/databaseService';
import type { SocialSettings, SocialSettingsUpdate } from '../features/social/types';

interface SocialSettingsStore {
  ownerId: string | null;
  settings: SocialSettings | null;
  /** Loads once per user; `force` refetches (e.g. on screen focus for fresh counts). Throws on failure. */
  load: (userId: string, force?: boolean) => Promise<SocialSettings>;
  /** Throws on failure and leaves the cached copy as it was. */
  update: (userId: string, patch: SocialSettingsUpdate) => Promise<SocialSettings>;
  /** Throws on failure. */
  markNoticeSeen: (userId: string) => Promise<void>;
  /** Forget everything, at sign-out. */
  reset: () => void;
}

let inFlight: { userId: string; promise: Promise<SocialSettings> } | null = null;

export const useSocialSettingsStore = create<SocialSettingsStore>((set, get) => ({
  ownerId: null,
  settings: null,

  load: (userId, force = false) => {
    const { ownerId, settings } = get();
    if (!force && ownerId === userId && settings) return Promise.resolve(settings);
    if (inFlight && inFlight.userId === userId) return inFlight.promise;
    if (ownerId !== userId) set({ ownerId: userId, settings: null });
    const promise = getMySocialSettings()
      .then((next) => {
        if (get().ownerId === userId) set({ settings: next });
        return next;
      })
      .finally(() => {
        if (inFlight?.promise === promise) inFlight = null;
      });
    inFlight = { userId, promise };
    return promise;
  },

  update: async (userId, patch) => {
    const next = await updateMySocialSettings(patch);
    if (get().ownerId === userId) set({ settings: next });
    return next;
  },

  markNoticeSeen: async (userId) => {
    await markWhereIGoNoticeSeen();
    const { ownerId, settings } = get();
    if (ownerId === userId && settings) set({ settings: { ...settings, whereIGoNoticeSeen: true } });
  },

  reset: () => {
    inFlight = null;
    set({ ownerId: null, settings: null });
  },
}));
