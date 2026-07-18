// src/utils/storageKeys.ts
// Single source of truth for every AsyncStorage key used in the app.
// Import STORAGE_KEYS instead of using raw string literals so that key
// names can be changed without grep-hunting the whole codebase.

export const STORAGE_KEYS = {
  /** Zustand booking store persistence key */
  BOOKINGS:           '@cerviced_bookings',
  /** Active mode: 'client' | 'provider' */
  ACTIVE_MODE:        '@active_mode',
  /** User theme preference */
  THEME_PREFERENCE:   '@theme_preference',
  /** Bookmarked provider IDs */
  BOOKMARK_IDS:       '@cerviced_bookmarks',
  /** In-progress registration draft (no password) */
  REGISTRATION_DRAFT: '@cerviced_reg_draft',
  /** User learning / personalisation data */
  USER_LEARNING:      '@cerviced_learning',
} as const;

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];
