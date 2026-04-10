import React, { useRef, useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';
import * as Notifications from 'expo-notifications';
import TabNavigation from './TabNavigator';
import ProviderTabNavigation from './ProviderTabNavigator';
import { RootStackParamList } from './types';
import { useAuth } from '../contexts/AuthContext';
import type { AccountType } from '../contexts/AuthContext';

// Auth screens
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import SignUpStep1Screen from '../screens/auth/SignUpStep1Screen';
import SignUpStep2Screen from '../screens/auth/SignUpStep2Screen';
import SignUpStep3Screen from '../screens/auth/SignUpStep3Screen';
import SignUpStep4Screen from '../screens/auth/SignUpStep4Screen';
import EmailVerificationScreen from '../screens/auth/EmailVerificationScreen';
import AccountSetupScreen from '../screens/auth/AccountSetupScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import ResetPasswordOTPScreen from '../screens/auth/ResetPasswordOTPScreen';
import NewPasswordScreen from '../screens/auth/NewPasswordScreen';

const Stack = createStackNavigator<RootStackParamList>();

export default function RootNavigation() {
  const { isLoggedIn, isLoading, user } = useAuth();
  const isProvider = user?.accountType === 'provider';
  const MainTabsComponent = isProvider ? ProviderTabNavigation : TabNavigation;

  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  const lastNotificationResponse = Notifications.useLastNotificationResponse();

  // Track previous account type so we can detect manual role switches and
  // redirect to the correct landing tab immediately (without needing an app restart).
  const prevAccountTypeRef = useRef<AccountType | undefined>(user?.accountType);
  useEffect(() => {
    const prev = prevAccountTypeRef.current;
    const curr = user?.accountType;
    prevAccountTypeRef.current = curr;

    // Only act when the role has actually changed (not on first mount)
    if (!prev || !curr || prev === curr) return;

    const nav = navigationRef.current;
    if (!nav) return;

    // The new tab navigator (ProviderTabNavigation or TabNavigation) may not have
    // finished mounting by the time this effect fires, so we ALWAYS schedule the
    // setTimeout — never bail out early with isReady(). By 500ms the navigator
    // will be fully ready.
    setTimeout(() => {
      if (!nav.isReady()) return;
      if (curr === 'user') {
        nav.navigate('MainTabs', { screen: 'Home' } as any);
      } else {
        nav.navigate('MainTabs', { screen: 'Profile' } as any);
      }
    }, 500);
  }, [user?.accountType]);

  useEffect(() => {
    if (!lastNotificationResponse || !isLoggedIn) return;
    const data = lastNotificationResponse.notification.request.content.data as Record<string, any>;
    const nav = navigationRef.current;
    if (!nav?.isReady()) return;

    const bookingId: string | undefined = data?.booking_id ?? data?.bookingId;

    if (bookingId) {
      if (isProvider) {
        nav.navigate('MainTabs', {
          screen: 'ProviderHome',
          params: { screen: 'BookingDetail', params: { bookingId } },
        } as any);
      } else {
        nav.navigate('MainTabs', {
          screen: 'Home',
          params: { screen: 'Bookings', params: { openBookingId: bookingId } },
        } as any);
      }
    } else {
      if (isProvider) {
        nav.navigate('MainTabs', {
          screen: 'ProviderHome',
          params: { screen: 'Notifications' },
        } as any);
      } else {
        nav.navigate('MainTabs', {
          screen: 'Home',
          params: { screen: 'Notifications' },
        } as any);
      }
    }
  }, [lastNotificationResponse, isLoggedIn, isProvider]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5E6FA' }}>
        <ActivityIndicator size="large" color="#a342c3" />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
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
          <Stack.Screen
            name="MainTabs"
            component={MainTabsComponent}
            options={{
              cardStyle: { backgroundColor: '#F5E6FA' },
            }}
          />
        ) : (
          <>
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="SignUpStep1" component={SignUpStep1Screen} />
            <Stack.Screen name="SignUpStep2" component={SignUpStep2Screen} />
            <Stack.Screen name="SignUpStep3" component={SignUpStep3Screen} />
            <Stack.Screen name="SignUpStep4" component={SignUpStep4Screen} />
            <Stack.Screen name="EmailVerification" component={EmailVerificationScreen} />
            <Stack.Screen name="AccountSetup" component={AccountSetupScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="ResetPasswordOTP" component={ResetPasswordOTPScreen} />
            <Stack.Screen name="NewPassword" component={NewPasswordScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
