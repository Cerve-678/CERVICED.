// The encrypted store holds the signed-in session and the saved profile. Real
// SecureStore throws on some characters in a key, so this mock does too.

const mockKeychain: Record<string, string> = {};

const mockCheckKey = (key: string) => {
  if (!/^[\w.-]+$/.test(key)) throw new Error('Invalid key provided to SecureStore.');
};

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => {
    mockCheckKey(key);
    return mockKeychain[key] ?? null;
  }),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockCheckKey(key);
    mockKeychain[key] = value;
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockCheckKey(key);
    delete mockKeychain[key];
  }),
}));

jest.mock('react-native-get-random-values', () => ({}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as aesjs from 'aes-js';
import { webcrypto } from 'crypto';
import { largeSecureStore } from '../lib/largeSecureStore';
import { STORAGE_KEYS } from '../utils/storageKeys';

const SESSION_KEY = 'sb-project-auth-token';
const SNAPSHOT_KEY = STORAGE_KEYS.AUTH_PROFILE_SNAPSHOT;

beforeAll(() => {
  if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
});

beforeEach(async () => {
  for (const key of Object.keys(mockKeychain)) delete mockKeychain[key];
  await AsyncStorage.clear();
});

describe('largeSecureStore', () => {
  it('saves and reads back a value whose key starts with @', async () => {
    await largeSecureStore.setItem(SNAPSHOT_KEY, '{"name":"Ada"}');
    expect(await largeSecureStore.getItem(SNAPSHOT_KEY)).toBe('{"name":"Ada"}');
  });

  it('never keeps the value in plain text on the device', async () => {
    await largeSecureStore.setItem(SNAPSHOT_KEY, '{"name":"Ada"}');
    expect(await AsyncStorage.getItem(SNAPSHOT_KEY)).not.toContain('Ada');
  });

  it('removes a value whose key starts with @, along with its encryption key', async () => {
    await largeSecureStore.setItem(SNAPSHOT_KEY, '{"name":"Ada"}');
    await largeSecureStore.removeItem(SNAPSHOT_KEY);
    expect(await largeSecureStore.getItem(SNAPSHOT_KEY)).toBeNull();
    expect(Object.keys(mockKeychain)).toEqual([]);
  });

  it('still reads a session saved by an existing install, so nobody is signed out', async () => {
    const encryptionKey = new Uint8Array(32).fill(7);
    const iv = new Uint8Array(16).fill(9);
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(iv));
    const encrypted = cipher.encrypt(aesjs.utils.utf8.toBytes('{"access_token":"t"}'));
    mockKeychain[`${SESSION_KEY}_key`] = aesjs.utils.hex.fromBytes(encryptionKey);
    await AsyncStorage.setItem(
      SESSION_KEY,
      `${aesjs.utils.hex.fromBytes(iv)}:${aesjs.utils.hex.fromBytes(encrypted)}`,
    );

    expect(await largeSecureStore.getItem(SESSION_KEY)).toBe('{"access_token":"t"}');
  });
});
