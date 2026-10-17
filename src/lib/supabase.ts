import { createClient } from '@supabase/supabase-js';
import { largeSecureStore } from './largeSecureStore';
import { createCoalescingFetch, createTimedFetch } from '../utils/requestTiming';
import { logger } from '../utils/logger';

const SUPABASE_URL = process.env['EXPO_PUBLIC_SUPABASE_URL']!;
const SUPABASE_ANON_KEY = process.env['EXPO_PUBLIC_SUPABASE_ANON_KEY']!;
// Always coalesce overlapping reads, including release builds. In development
// the timer sits *inside* the coalescer, so the log reports network requests,
// rather than a misleading line for every consumer that shared one request.
const supabaseFetch = createCoalescingFetch(
  __DEV__ ? createTimedFetch(fetch, (line) => logger.log(line)) : fetch,
);

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: largeSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  // Dev builds log one `[timing]` line per network request (Metro, and
  // Developer Settings → Debug Logs on device). Identical simultaneous reads
  // are coalesced before the timer, so one request produces one line.
  global: {
    fetch: supabaseFetch,
  },
});
