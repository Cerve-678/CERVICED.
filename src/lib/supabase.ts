import { createClient } from '@supabase/supabase-js';
import { largeSecureStore } from './largeSecureStore';

const SUPABASE_URL = process.env['EXPO_PUBLIC_SUPABASE_URL']!;
const SUPABASE_ANON_KEY = process.env['EXPO_PUBLIC_SUPABASE_ANON_KEY']!;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: largeSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
