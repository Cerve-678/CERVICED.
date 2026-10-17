import { createClient } from '@supabase/supabase-js';
import { largeSecureStore } from './largeSecureStore';
import { createCoalescingFetch, createTimedFetch } from '../utils/requestTiming';
import { logger } from '../utils/logger';

const SUPABASE_URL = process.env['EXPO_PUBLIC_SUPABASE_URL']!;
const SUPABASE_ANON_KEY = process.env['EXPO_PUBLIC_SUPABASE_ANON_KEY']!;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: largeSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  // Coalesce only simultaneous identical reads. The dev timer sits inside the
  // coalescer so one log line still means one real network request.
  global: {
    fetch: createCoalescingFetch(
      __DEV__ ? createTimedFetch(fetch, (line) => logger.log(line)) : fetch,
    ),
  },
});
