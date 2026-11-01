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

// Reanimated and its worklets runtime need native modules. Since SDK 58 even
// importing them under Jest throws, and gesture-handler's swipeable pulls them
// into anything with a swipeable row, so every suite gets the mocks.
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
jest.mock('react-native-reanimated/src/css/native/proxy', () => ({
  ...jest.requireActual('react-native-reanimated/src/css/native/proxy'),
  setCSSEventHandler: jest.fn(),
}));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// Icon fonts are real assets, which Jest doesn't bundle: without this, an icon
// mounting rejects with "Module is missing from the asset registry".
jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  isLoaded: jest.fn(() => true),
  loadAsync: jest.fn(() => Promise.resolve()),
}));

// Gesture Handler 3's native module needs its own mock, which it ships.
require('react-native-gesture-handler/jestSetup');

// expo-notifications expects a removable subscription back from addListener,
// which the preset's automatic native mock doesn't return.
jest.mock('expo-notifications/build/NotificationsHandlerModule', () => ({
  __esModule: true,
  default: { addListener: jest.fn(() => ({ remove: jest.fn() })) },
}));
