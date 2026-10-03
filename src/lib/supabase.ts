import { createClient } from '@supabase/supabase-js';
import { largeSecureStore } from './largeSecureStore';
import { createTimedFetch } from '../utils/requestTiming';
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
  // Dev builds log one `[timing]` line per request (Metro, and Developer
  // Settings → Debug Logs on device). Release builds use plain fetch.
  ...(__DEV__ ? { global: { fetch: createTimedFetch(fetch, (line) => logger.log(line)) } } : {}),
});
