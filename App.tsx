// App.tsx - WITH BookingProvider
if (__DEV__) {
  try {
    require('./src/utils/reactotron');
  } catch (e) {
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
import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import ErrorBoundary from './src/components/ErrorBoundary';
import { storage, STORAGE_KEYS } from './src/utils/storage';
import { useBookmarkStore } from './src/stores/useBookmarkStore';

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

export default function App() {
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
          await new Promise(resolve => setTimeout(resolve, 100));
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
      const existingBookmarks = await storage.getItem<string[]>(STORAGE_KEYS.BOOKMARKED_VIDEOS);
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
          theme: 'light'
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
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <RegistrationProvider>
              <FontProvider customFontsLoaded={fontsLoaded && !fontError}>
                <CartProvider>
                  <BookingProvider>
                    <View style={styles.container} onLayout={onLayoutRootView}>
                      <StatusBarBlur />
                      <AppContent />
                    </View>
                  </BookingProvider>
                </CartProvider>
              </FontProvider>
            </RegistrationProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

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