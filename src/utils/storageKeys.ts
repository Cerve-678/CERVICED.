// src/utils/storageKeys.ts
// Single source of truth for every AsyncStorage key used in the app.
// Import STORAGE_KEYS instead of using raw string literals so that key
// names can be changed without grep-hunting the whole codebase.

export const STORAGE_KEYS = {
  /** BookingContext's persisted bookings cache — the one screens actually read from */
  BOOKINGS:           '@bookings',
  /** Zustand booking store persistence key — kept in sync by BookingContext but
   *  has no readers of its own (see stores/useBookingStore.ts) */
  BOOKINGS_STORE_LEGACY: '@cerviced_bookings',
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
  /** Cart items — survives app close/kill so an in-progress checkout isn't lost */
  CART_ITEMS:          '@cerviced_cart',
} as const;

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];

/**
 * Per-user "which version of this coach-mark tour has been shown" cache.
 *
 * These are PREFIXES, not whole keys — each one is suffixed with the user id
 * so two accounts on the same device each get their own first run. Build one
 * with tourSeenKey() rather than re-writing the template literal, and note
 * that DevSettings' "Replay Walkthroughs" purges by exactly these prefixes:
 * a tour whose key isn't listed here silently can't be replayed.
 *
 * The stored value is a VERSION NUMBER now, not `true`. The account's own
 * record in users.seen_tours is the source of truth — this is only a local
 * cache, so a returning user doesn't have to wait on a network round-trip
 * before the first screen can decide whether to spotlight anything. Builds
 * before 2026-08-31 wrote a boolean `true` here; that is read as version 1
 * (see src/services/tourService.ts) so upgrading doesn't replay a tour
 * someone has already sat through.
 */
export const TOUR_SEEN_PREFIXES = {
  /** HomeScreen — the client's first-run tour */
  CLIENT_HOME:    '@client_tour_seen_',
  /** ExploreScreen — armed on the first visit to Explore, once the feed loads */
  CLIENT_EXPLORE: '@client_explore_tour_seen_',
  /** ProviderHomeScreen — the provider's first-run tour */
  PROVIDER_HOME:  '@provider_tour_seen_',
} as const;

export type TourSeenPrefix = typeof TOUR_SEEN_PREFIXES[keyof typeof TOUR_SEEN_PREFIXES];

export const tourSeenKey = (prefix: TourSeenPrefix, userId: string): string => `${prefix}${userId}`;
