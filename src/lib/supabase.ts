import { createClient } from '@supabase/supabase-js';
import { largeSecureStore } from './largeSecureStore';
import { createCoalescingFetch, createTimedFetch, labelSupabaseRequest } from '../utils/requestTiming';
import { createReadCache } from '../utils/readCache';
import { logger } from '../utils/logger';

const SUPABASE_URL = process.env['EXPO_PUBLIC_SUPABASE_URL']!;
const SUPABASE_ANON_KEY = process.env['EXPO_PUBLIC_SUPABASE_ANON_KEY']!;

/** How long a table read is answered from memory when nothing has changed.
 *  Long enough to cover going back and forth between screens; short enough
 *  that a change made by someone else with no Realtime subscription shows up
 *  on the next visit after it. */
const READ_CACHE_TTL_MS = 30_000;
const READ_CACHE_MAX_ENTRIES = 300;

// Always coalesce overlapping reads, including release builds. In development
// the timer sits *inside* the coalescer, so the log reports network requests,
// rather than a misleading line for every consumer that shared one request.
const coalescedFetch = createCoalescingFetch(
  __DEV__ ? createTimedFetch(fetch, (line) => logger.log(line)) : fetch,
);

// In front of the coalescer: a read answered from memory never reaches the
// network. Writes, RPCs, Auth, Storage and Edge Functions pass straight
// through and forget every remembered read (see readCache.ts).
const readCache = createReadCache(coalescedFetch, {
  ttlMs: READ_CACHE_TTL_MS,
  maxEntries: READ_CACHE_MAX_ENTRIES,
  ...(__DEV__
    ? {
        onHit: (method: string, url: string) => {
          const label = labelSupabaseRequest(url);
          logger.log(`[timing]     0ms cached ${method.padEnd(6)} ${label.kind}:${label.name}`);
        },
      }
    : {}),
});

/** Forget every remembered read. databaseService calls this on Realtime
 *  events and on explicit refreshes; screens go through its wrapper. */
export const clearCachedReads = readCache.clear;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: largeSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  // Dev builds log one `[timing]` line per network request (Metro, and
  // Developer Settings → Debug Logs on device), plus a `cached` line for each
  // read answered from memory. Identical simultaneous reads are coalesced
  // before the timer, so one request produces one line.
  global: {
    fetch: readCache.fetch,
  },
});

// A different person, or nobody, is now signed in. Entries are keyed by the
// Authorization header already, so this is belt and braces.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
    clearCachedReads();
  }
});
