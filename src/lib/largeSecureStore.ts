import 'react-native-get-random-values';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as aesjs from 'aes-js';

/** expo-secure-store (iOS Keychain / Android Keystore) caps individual
 *  values at ~2KB, which a full Supabase session object (access + refresh
 *  token + user metadata) can exceed. This is Supabase's own documented
 *  pattern for Expo apps: the session itself lives in AsyncStorage
 *  (unbounded size) encrypted with an AES-256-CTR key that lives in
 *  SecureStore (small, hardware-backed). Previously the session sat in
 *  AsyncStorage in plaintext — readable via filesystem access on a
 *  rooted/jailbroken device or an extracted backup. */
class LargeSecureStore {
  private async getEncryptionKey(key: string): Promise<Uint8Array> {
    let hex = await SecureStore.getItemAsync(`${key}_key`);
    if (!hex) {
      hex = aesjs.utils.hex.fromBytes(crypto.getRandomValues(new Uint8Array(32)));
      await SecureStore.setItemAsync(`${key}_key`, hex);
    }
    return aesjs.utils.hex.toBytes(hex);
  }

  /** Existing installs have a plaintext JSON session already sitting in
   *  AsyncStorage from before this change. Rather than log everyone out on
   *  upgrade, fall back to returning it as-is when no encryption key exists
   *  yet (or the stored value isn't in our iv:ciphertext format) — the next
   *  setItem, which happens on every normal token refresh, re-saves it
   *  encrypted, so migration happens transparently over time. */
  async getItem(key: string): Promise<string | null> {
    const stored = await AsyncStorage.getItem(key);
    if (!stored) return null;

    const hasKey = !!(await SecureStore.getItemAsync(`${key}_key`));
    if (!hasKey) return stored;

    const [ivHex, cipherHex] = stored.split(':');
    if (!ivHex || !cipherHex) return stored;

    try {
      const encryptionKey = await this.getEncryptionKey(key);
      const iv = aesjs.utils.hex.toBytes(ivHex);
      const cipherBytes = aesjs.utils.hex.toBytes(cipherHex);
      const aesCtr = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(iv));
      return aesjs.utils.utf8.fromBytes(aesCtr.decrypt(cipherBytes));
    } catch {
      // Corrupt, or genuinely legacy plaintext that happened to contain a
      // ':' — fail open to the raw value rather than logging the user out.
      return stored;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    const encryptionKey = await this.getEncryptionKey(key);
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const aesCtr = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(iv));
    const encryptedBytes = aesCtr.encrypt(aesjs.utils.utf8.toBytes(value));
    const payload = `${aesjs.utils.hex.fromBytes(iv)}:${aesjs.utils.hex.fromBytes(encryptedBytes)}`;
    await AsyncStorage.setItem(key, payload);
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(`${key}_key`);
  }
}

export const largeSecureStore = new LargeSecureStore();
