/**
 * The website's session storage for Supabase Auth. The app's version
 * (largeSecureStore.ts) keeps the session encrypted with a key in the iOS
 * Keychain / Android Keystore; a browser has neither, and expo-secure-store
 * doesn't run on the web. This is Supabase's own default for browsers:
 * localStorage, readable only by pages on this site's own origin.
 *
 * A browser can refuse storage (private windows, blocked site data). Then
 * the session simply isn't remembered between visits; signing in still works
 * for the visit itself.
 */
class BrowserSessionStore {
  async getItem(key: string): Promise<string | null> {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage refused or full: the session lasts for this visit only.
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing was stored.
    }
  }
}

export const largeSecureStore = new BrowserSessionStore();
