// App.tsx - WITH BookingProvider
// These two runtime requires are intentional: Reactotron is dev-only and the
// Stripe native module must not be evaluated in Expo Go. Both must remain
// conditional, ahead of normal app initialisation.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
if (__DEV__) {
  try {
    require('./src/utils/reactotron');
  } catch {
    console.log('Reactotron not configured');
  }
}

import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import AppNavigator from './src/navigation/AppNavigator';
import { FontProvider } from './src/contexts/FontContext';
import { CartProvider } from './src/contexts/CartContext';
import { BookingProvider } from './src/contexts/BookingContext';
import { AuthProvider } from './src/contexts/AuthContext';
import { RegistrationProvider } from './src/contexts/RegistrationContext';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import ErrorBoundary from './src/components/ErrorBoundary';
import { storage, STORAGE_KEYS } from './src/utils/storage';
import { useBookmarkStore } from './src/stores/useBookmarkStore';
import { initSentry } from './src/lib/sentry';
import { installAuthErrorFilter } from './src/utils/logger';
import * as Sentry from '@sentry/react-native';
import { env } from './src/utils/env';

// @stripe/stripe-react-native's native module binding throws at import time
// (TurboModuleRegistry.getEnforcing) when the native module isn't present —
// which is always true under Expo Go, since it only bundles Expo's own
// native modules. A static top-level `import { StripeProvider } from
// '@stripe/stripe-react-native'` would crash the entire app's module load
// under Expo Go before any screen renders. Deferring to a runtime require()
// behind this check keeps that import out of the Expo Go bundle path
// entirely; a real dev/production build (env.isExpoGo === false) still
// resolves and uses the real StripeProvider exactly as before.
const StripeProvider: React.ComponentType<{
  publishableKey: string;
  merchantIdentifier: string;
  children: React.ReactNode;
}> = env.isExpoGo
  ? ({ children }) => <>{children}</>
  : (require('@stripe/stripe-react-native').StripeProvider);

Sentry.init({
  dsn: 'https://ab030af3bc295ecbc70a310530bbfb6d@o4511817937453056.ingest.de.sentry.io/4511817960325200',

  // Privacy-first for a health-adjacent app (medical notes, allergies, DOB,
  // addresses, payment). Do NOT attach IP / cookies / user PII to events.
  sendDefaultPii: false,

  // Capture from release builds only — in dev, errors already show in the
  // terminal via logger. Flip to `true` temporarily to test capture in dev.
  enabled: !__DEV__,
  environment: __DEV__ ? 'development' : 'production',

  // Errors only — no performance tracing.
  tracesSampleRate: 0,

  // Session Replay intentionally OFF: it records screen sessions, which for this
  // app would capture sensitive personal/health data. Re-enable only with full
  // masking if ever needed.
  integrations: [Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

// Initialise crash reporting as early as possible (no-ops without a DSN).
initSentry();
installAuthErrorFilter();

SplashScreen.preventAutoHideAsync();

function AppContent() {
  return <AppNavigator />;
}

function StatusBarBlur() {
  return (
    <>
      <StatusBar translucent backgroundColor="transparent" style="dark" />
      <BlurView intensity={20} tint="light" style={styles.statusBarBlur} />
    </>
  );
}

export default Sentry.wrap(function App() {
  const [appIsReady, setAppIsReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    'BakbakOne-Regular': require('./assets/fonts/BakbakOne-Regular.ttf'),
    'Jura-VariableFont_wght': require('./assets/fonts/Jura-VariableFont_wght.ttf'),
  });

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      await SplashScreen.hideAsync();
    }
  }, [appIsReady]);

  useEffect(() => {
    async function prepare() {
      try {
        if (fontsLoaded || fontError) {
          await initializeApp();
          setAppIsReady(true);
        }
      } catch (e) {
        console.warn('Error during app preparation:', e);
        setAppIsReady(true);
      }
    }
    prepare();
  }, [fontsLoaded, fontError]);

  const initializeApp = async () => {
    try {
      const existingBookmarks = await storage.getItem<string[]>(
        STORAGE_KEYS.BOOKMARKED_VIDEOS,
      );
      if (!existingBookmarks) {
        await storage.setItem(STORAGE_KEYS.BOOKMARKED_VIDEOS, []);
        console.log('Bookmarks storage initialized');
      }

      const { loadBookmarks } = useBookmarkStore.getState();
      await loadBookmarks();
      console.log('Bookmarks loaded into store');

      const settings = await storage.getItem(STORAGE_KEYS.SETTINGS);
      if (!settings) {
        await storage.setItem(STORAGE_KEYS.SETTINGS, {
          notifications: true,
          theme: 'light',
        });
        console.log('Settings storage initialized');
      }
    } catch (error) {
      console.error('Error initializing app storage:', error);
    }
  };

  if (!appIsReady) {
    return null;
  }

  if (fontError) {
    console.error('Font loading error:', fontError);
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.container}>
        <SafeAreaProvider>
          <AuthProvider>
            <ThemeProvider>
              <RegistrationProvider>
                <FontProvider customFontsLoaded={fontsLoaded && !fontError}>
                  <StripeProvider
                    publishableKey={
                      process.env['EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY'] ?? ''
                    }
                    merchantIdentifier="merchant.com.cerviced"
                  >
                    <CartProvider>
                      <BookingProvider>
                        <View
                          style={styles.container}
                          onLayout={onLayoutRootView}
                        >
                          <StatusBarBlur />
                          <AppContent />
                        </View>
                      </BookingProvider>
                    </CartProvider>
                  </StripeProvider>
                </FontProvider>
              </RegistrationProvider>
            </ThemeProvider>
          </AuthProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  statusBarBlur: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 44,
    zIndex: 1000,
  },
});
