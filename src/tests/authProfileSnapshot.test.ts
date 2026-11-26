// Launch opens the app from the saved profile copy instead of waiting on the
// server. The copy must only ever be used for the account it belongs to, and
// only while it's reasonably fresh.

const mockStore: Record<string, string> = {};

jest.mock('../lib/largeSecureStore', () => ({
  largeSecureStore: {
    getItem: jest.fn(async (key: string) => mockStore[key] ?? null),
    setItem: jest.fn(async (key: string, value: string) => { mockStore[key] = value; }),
    removeItem: jest.fn(async (key: string) => { delete mockStore[key]; }),
  },
}));

import {
  AUTH_PROFILE_SNAPSHOT_MAX_AGE_MS,
  clearAuthProfileSnapshot,
  readAuthProfileSnapshot,
  saveAuthProfileSnapshot,
} from '../services/authProfileSnapshot';
import { largeSecureStore } from '../lib/largeSecureStore';
import { STORAGE_KEYS } from '../utils/storageKeys';

const user = { id: 'user-1', name: 'Ada', email: 'ada@example.com' };

beforeEach(() => {
  for (const key of Object.keys(mockStore)) delete mockStore[key];
});

describe('authProfileSnapshot', () => {
  it('gives back the saved profile for the same account', async () => {
    await saveAuthProfileSnapshot(user, 1_000);
    expect(await readAuthProfileSnapshot('user-1', 2_000)).toEqual(user);
  });

  it('is written through the encrypted store, never plain AsyncStorage', async () => {
    await saveAuthProfileSnapshot(user, 1_000);
    expect(largeSecureStore.setItem).toHaveBeenCalledWith(
      STORAGE_KEYS.AUTH_PROFILE_SNAPSHOT,
      expect.any(String),
    );
  });

  it('never gives one account another account\'s profile', async () => {
    await saveAuthProfileSnapshot(user, 1_000);
    expect(await readAuthProfileSnapshot('user-2', 2_000)).toBeNull();
  });

  it('ignores a copy older than the maximum age', async () => {
    await saveAuthProfileSnapshot(user, 1_000);
    expect(await readAuthProfileSnapshot('user-1', 1_000 + AUTH_PROFILE_SNAPSHOT_MAX_AGE_MS + 1)).toBeNull();
  });

  it('treats an unreadable or foreign-shaped copy as no copy', async () => {
    mockStore[STORAGE_KEYS.AUTH_PROFILE_SNAPSHOT] = 'not json';
    expect(await readAuthProfileSnapshot('user-1')).toBeNull();
    mockStore[STORAGE_KEYS.AUTH_PROFILE_SNAPSHOT] = JSON.stringify({ version: 1, userId: 'user-1', savedAt: Date.now(), user: { id: 'user-2' } });
    expect(await readAuthProfileSnapshot('user-1')).toBeNull();
  });

  it('is gone after clearing', async () => {
    await saveAuthProfileSnapshot(user, 1_000);
    await clearAuthProfileSnapshot();
    expect(await readAuthProfileSnapshot('user-1', 2_000)).toBeNull();
  });
});
