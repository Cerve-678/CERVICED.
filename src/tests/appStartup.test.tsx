import React from 'react';
import { render } from '@testing-library/react-native';

let mockFontsLoaded = true;

jest.mock('../navigation/AppNavigator', () => {
  const { Text } = require('react-native');
  return () => <Text>Navigation mounted</Text>;
});
jest.mock('../utils/reactotron', () => ({}));
jest.mock('../utils/fontScaleClamp', () => ({ applyFontScaleClamp: jest.fn() }));
jest.mock('../lib/sentry', () => ({ initSentry: jest.fn() }));
jest.mock('@sentry/react-native', () => ({ init: jest.fn(), wrap: (app: unknown) => app, feedbackIntegration: jest.fn() }));
jest.mock('../utils/env', () => ({ env: { beccaAiEnabled: false } }));
jest.mock('../services/becca/aiRuntime', () => ({ configureBeccaAI: jest.fn() }));
jest.mock('../services/becca/nvidiaInterpreter', () => ({ nvidiaBeccaInterpreter: undefined }));
jest.mock('../utils/logger', () => ({ installAuthErrorFilter: jest.fn() }));
jest.mock('expo-font', () => ({ useFonts: () => [mockFontsLoaded, null] }));
jest.mock('expo-image', () => ({ Image: { configureCache: jest.fn() } }));
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() }));
jest.mock('expo-blur', () => ({ BlurView: () => null }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('../utils/storage', () => ({
  storage: { getItem: jest.fn(() => new Promise(() => {})) },
  STORAGE_KEYS: { BOOKMARKED_VIDEOS: 'bookmarks', SETTINGS: 'settings' },
}));
jest.mock('../contexts/AuthContext', () => ({ AuthProvider: ({ children }: any) => children }));
jest.mock('../contexts/ThemeContext', () => ({ ThemeProvider: ({ children }: any) => children }));
jest.mock('../contexts/DisplaySettingsContext', () => ({ DisplaySettingsProvider: ({ children }: any) => children }));
jest.mock('../contexts/RegistrationContext', () => ({ RegistrationProvider: ({ children }: any) => children }));
jest.mock('../contexts/FontContext', () => ({ FontProvider: ({ children }: any) => children }));
jest.mock('../contexts/CartContext', () => ({ CartProvider: ({ children }: any) => children }));
jest.mock('../contexts/BookingContext', () => ({ BookingProvider: ({ children }: any) => children }));
jest.mock('../contexts/StatusBarTintContext', () => ({
  StatusBarTintProvider: ({ children }: any) => children,
  useStatusBarTint: () => false,
}));
jest.mock('../components/ErrorBoundary', () => ({ children }: any) => children);
jest.mock('react-native-safe-area-context', () => ({ SafeAreaProvider: ({ children }: any) => children }));
jest.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: ({ children }: any) => children }));
jest.mock('@stripe/stripe-react-native', () => ({
  StripeProvider: ({ children }: any) => children,
  useStripe: () => ({ handleURLCallback: jest.fn() }),
}));

import App from '../../App';

test('mounts navigation even when optional startup storage never resolves', () => {
  mockFontsLoaded = true;
  const screen = render(<App />);
  expect(screen.getByText('Navigation mounted')).toBeTruthy();
});

test('shows branded loading UI while bundled fonts load', () => {
  mockFontsLoaded = false;
  const screen = render(<App />);
  expect(screen.getByLabelText('Loading CERVICED')).toBeTruthy();
  expect(screen.queryByText('Navigation mounted')).toBeNull();
  mockFontsLoaded = true;
});
