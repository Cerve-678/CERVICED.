// jest.setup.js
// Expo's CLI auto-loads .env.local and inlines EXPO_PUBLIC_* vars at bundle
// time; plain Jest doesn't get that for free, so src/lib/supabase.ts sees
// undefined env vars and createClient() throws before any test can run.
require('dotenv').config({ path: require('path').resolve(__dirname, '.env.local') });

// CI has no .env.local (it is gitignored), and without these createClient()
// throws "supabaseUrl is required" at import — which took down every suite that
// reaches src/lib/supabase.ts. Placeholders rather than real values on purpose:
// a unit test that reaches for the network should fail, not quietly succeed
// against a live project.
process.env['EXPO_PUBLIC_SUPABASE_URL'] ||= 'http://127.0.0.1:54321';
process.env['EXPO_PUBLIC_SUPABASE_ANON_KEY'] ||= 'test-anon-key';

// The AsyncStorage mock module has no side effects on its own — it must be
// registered via jest.mock(), not just required as a bare setupFile (that
// silently does nothing and leaves every AsyncStorage import hitting the
// real native module, which throws under Jest's Node environment).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
