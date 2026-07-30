// jest.setup.js
// Expo's CLI auto-loads .env.local and inlines EXPO_PUBLIC_* vars at bundle
// time; plain Jest doesn't get that for free, so src/lib/supabase.ts sees
// undefined env vars and createClient() throws before any test can run.
require('dotenv').config({ path: require('path').resolve(__dirname, '.env.local') });

// The AsyncStorage mock module has no side effects on its own — it must be
// registered via jest.mock(), not just required as a bare setupFile (that
// silently does nothing and leaves every AsyncStorage import hitting the
// real native module, which throws under Jest's Node environment).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
