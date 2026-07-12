import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';
import * as Notifications from 'expo-notifications';
import TabNavigation from './TabNavigator';
import ProviderTabNavigation from './ProviderTabNavigator';
import { RootStackParamList } from './types';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { navigationRef } from './navigationRef';
import { handleNotificationTap } from '../services/notificationTapHandler';

// Auth screens
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import SignUpStep1Screen from '../screens/auth/SignUpStep1Screen';
import SignUpStep2Screen from '../screens/auth/SignUpStep2Screen';
import SignUpStep3Screen from '../screens/auth/SignUpStep3Screen';
import SignUpStep4Screen from '../screens/auth/SignUpStep4Screen';
import SignUpStep5Screen from '../screens/auth/SignUpStep5Screen';
import EmailVerificationScreen from '../screens/auth/EmailVerificationScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import ResetPasswordOTPScreen from '../screens/auth/ResetPasswordOTPScreen';
import NewPasswordScreen from '../screens/auth/NewPasswordScreen';

const Stack = createStackNavigator<RootStackParamList>();

export default function RootNavigation() {
  const { isLoggedIn, isLoading, activeMode, isSwitching, switchingTo } = useAuth();
  const { theme: colors } = useTheme();
  const MainTabsComponent = activeMode === 'provider' ? ProviderTabNavigation : TabNavigation;

  // Track whether NavigationContainer has finished mounting
  const [isNavReady, setIsNavReady] = useState(false);
  // Dedup guard — prevents the same notification firing both hooks
  const handledNotifRef = useRef<string | null>(null);

  // Cold-start tap: app was killed, user tapped the notification, app launched
  const lastNotifResponse = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!isNavReady || !lastNotifResponse) return;
    const id = lastNotifResponse.notification.request.identifier;
    if (handledNotifRef.current === id) return;
    handledNotifRef.current = id;
    const data = lastNotifResponse.notification.request.content.data;
    handleNotificationTap(data as any);
  }, [isNavReady, lastNotifResponse]);

  // Background/foreground tap: app was running or suspended
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const id = response.notification.request.identifier;
      if (handledNotifRef.current === id) return;
      handledNotifRef.current = id;
      const data = response.notification.request.content.data;
      handleNotificationTap(data as any);
    });
    return () => sub.remove();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <>
    <Modal visible={isSwitching} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.switchOverlay}>
        <View style={styles.switchCard}>
          <ActivityIndicator size="large" color="#DA70D6" />
          <Text style={styles.switchText}>
            Switching to {switchingTo === 'provider' ? 'Provider' : 'Client'} Mode
          </Text>
        </View>
      </View>
    </Modal>
    <NavigationContainer ref={navigationRef} onReady={() => setIsNavReady(true)}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          cardStyle: { backgroundColor: 'transparent' },
          cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
          gestureEnabled: true,
          gestureDirection: 'horizontal',
        }}
      >
        {isLoggedIn ? (
          // ── Authenticated screens only ──────────────────────────────────────
          // No auth screens here — having Login in both branches means React
          // Navigation keeps the user on LoginScreen after isLoggedIn flips true.
          <Stack.Screen
            name="MainTabs"
            component={MainTabsComponent}
            options={{ cardStyle: { backgroundColor: '#F5E6FA' } }}
          />
        ) : (
          // ── Auth screens only ───────────────────────────────────────────────
          <>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="SignUpStep1" component={SignUpStep1Screen} />
            <Stack.Screen name="SignUpStep2" component={SignUpStep2Screen} />
            <Stack.Screen name="SignUpStep3" component={SignUpStep3Screen} />
            <Stack.Screen name="SignUpStep4" component={SignUpStep4Screen} />
            <Stack.Screen name="SignUpStep5" component={SignUpStep5Screen} />
            <Stack.Screen name="EmailVerification" component={EmailVerificationScreen} options={{ gestureEnabled: false }} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="ResetPasswordOTP" component={ResetPasswordOTPScreen} />
            <Stack.Screen name="NewPassword" component={NewPasswordScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
    </>
  );
}

const styles = StyleSheet.create({
  switchOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  switchCard: {
    backgroundColor: 'rgba(28,16,34,0.97)',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 36,
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: 'rgba(218,112,214,0.25)',
  },
  switchText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
