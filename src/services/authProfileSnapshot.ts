// src/services/authProfileSnapshot.ts
// The signed-in account's last profile, kept on the phone so launch can open
// the app straight away instead of waiting for the server.
//
// Why: on launch AuthContext used to hold the loading screen until the users
// row came back. That is the first request after the API has been idle, the
// slowest kind (about 3 s typical, up to the 8 s timeout), so a cold start sat
// on the loading screen for seconds. Now launch shows the app from this copy
// and refreshes it from the server in the background.
//
// Stored through largeSecureStore: AES-encrypted, with the key in the iOS
// Keychain / Android Keystore, the same as the session itself. It holds the
// profile fields AuthContext already keeps in memory (name, email, phone, date
// of birth, saved address), so plain AsyncStorage would leave them readable.
// Cleared on logout and on account deletion.

import { largeSecureStore } from '../lib/largeSecureStore';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { logger } from '../utils/logger';

/** Older than this, the copy is ignored and launch waits for the server as
 *  before. A month covers normal use without trusting a very old answer. */
export const AUTH_PROFILE_SNAPSHOT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

interface StoredSnapshot<User> {
  version: 1;
  userId: string;
  savedAt: number;
  user: User;
}

/** The saved profile for this account, or null when there is none, it
 *  belongs to someone else, it's too old, or it can't be read. */
export async function readAuthProfileSnapshot<User extends { id: string }>(
  userId: string,
  now: number = Date.now(),
): Promise<User | null> {
  try {
    const raw = await largeSecureStore.getItem(STORAGE_KEYS.AUTH_PROFILE_SNAPSHOT);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSnapshot<User>>;
    if (parsed.version !== 1 || parsed.userId !== userId || !parsed.user) return null;
    if (parsed.user.id !== userId) return null;
    if (typeof parsed.savedAt !== 'number' || now - parsed.savedAt > AUTH_PROFILE_SNAPSHOT_MAX_AGE_MS) return null;
    return parsed.user;
  } catch (error) {
    // A missing or unreadable copy only means launch waits for the server.
    logger.warn('[authProfileSnapshot] could not read saved profile:', error);
    return null;
  }
}

export async function saveAuthProfileSnapshot<User extends { id: string }>(
  user: User,
  now: number = Date.now(),
): Promise<void> {
  const snapshot: StoredSnapshot<User> = { version: 1, userId: user.id, savedAt: now, user };
  try {
    await largeSecureStore.setItem(STORAGE_KEYS.AUTH_PROFILE_SNAPSHOT, JSON.stringify(snapshot));
  } catch (error) {
    logger.warn('[authProfileSnapshot] could not save profile:', error);
  }
}

export async function clearAuthProfileSnapshot(): Promise<void> {
  try {
    await largeSecureStore.removeItem(STORAGE_KEYS.AUTH_PROFILE_SNAPSHOT);
  } catch (error) {
    logger.warn('[authProfileSnapshot] could not clear saved profile:', error);
  }
}
