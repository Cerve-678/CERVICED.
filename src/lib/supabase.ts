import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Ensures the current Supabase JWT is valid before any RLS-protected write.
 * autoRefreshToken runs in the background but can miss the window when the
 * app is foregrounded after a long background period. Call this at the start
 * of any function that uses storage uploads or mutating DB operations so RLS
 * never sees a null auth.uid().
 */
export async function ensureFreshSession(): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) throw new Error('Your session has expired. Please log in again.');
  }
}
