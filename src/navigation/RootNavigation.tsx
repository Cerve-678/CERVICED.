import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';
import * as Notifications from 'expo-notifications';
import ClientTabNavigation from './client/ClientTabNavigator';
import ProviderTabNavigation from './provider/ProviderTabNavigator';
import { RootStackParamList } from './types';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { navigationRef } from './navigationRef';
import { resolveModeChange } from './modeController';
import { handleNotificationTap } from '../services/notificationTapHandler';
import { lightTheme, darkTheme, clientLightTheme, clientDarkTheme } from '../constants/theme';
import ErrorBoundary from '../components/ErrorBoundary';

// Auth screens
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import ClaimProviderScreen from '../screens/auth/ClaimProviderScreen';
import SignUpStep1Screen from '../screens/auth/SignUpStep1Screen';
import SignUpStep2Screen from '../screens/auth/SignUpStep2Screen';
import SignUpStep3Screen from '../screens/auth/SignUpStep3Screen';
import SignUpStep4Screen from '../screens/auth/SignUpStep4Screen';
import SignUpStep5Screen from '../screens/auth/SignUpStep5Screen';
import EmailVerificationScreen from '../screens/auth/EmailVerificationScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import ResetPasswordOTPScreen from '../screens/auth/ResetPasswordOTPScreen';
import NewPasswordScreen from '../screens/auth/NewPasswordScreen';
import ReactivateAccountScreen from '../screens/auth/ReactivateAccountScreen';

const Stack = createStackNavigator<RootStackParamList>();

export default function RootNavigation() {
  const { isLoggedIn, isLoading, activeMode, isSwitching, switchingTo, pendingReactivation } = useAuth();
  const { theme: colors, isDarkMode } = useTheme();

  // The switch overlay always uses the DESTINATION hat's real accent (not a
  // hardcoded placeholder color) — same "you're switching identity" signal
  // used elsewhere for this transition, now actually on-brand instead of an
  // unrelated magenta that matches neither hat's palette.
  const switchingDestinationTheme = switchingTo === 'provider'
    ? (isDarkMode ? darkTheme : lightTheme)
    : (isDarkMode ? clientDarkTheme : clientLightTheme);

  const MainTabsComponent = activeMode === 'provider' ? ProviderTabNavigation : ClientTabNavigation;

  // Resolves any requestMode() callers (e.g. the notification tap handler,
  // and switchMode()'s manual toggle — both funnel through the same
  // registerModeSetter path) once MainTabsComponent has actually re-rendered
  // for the new activeMode — not merely once AuthContext's state has been
  // set. setActiveMode and this component's re-render happen on React's own
  // schedule; resolving here (post-commit, one more tick to let the
  // freshly-mounted tab navigator initialise) is what lets callers safely
  // deep-link into the new hat's stack instead of racing a fixed timeout
  // against a device-dependent mount time. Passes the LANDED activeMode
  // through — if two requests overlapped, whichever caller didn't get the
  // mode it asked for is responsible for noticing (see modeController.ts).
  //
  // Before resolving, the MainTabs route is reset so the incoming hat opens on
  // its OWN home tab. Swapping MainTabsComponent alone doesn't do that: React
  // Navigation keeps the nested tab state on the MainTabs route and rehydrates
  // the new navigator from it, keeping any route name the two hats happen to
  // share ('Becca', 'Profile') focused. Since the manual switch control lives
  // on the Profile tab of both hats, that meant every switch landed on the
  // other hat's Profile tab instead of Home/ProviderHome — and any shared
  // screen name pushed inside it carried over too. Resetting to a bare
  // MainTabs route drops that stale state, so each tab navigator starts at its
  // own initialRouteName (Home / ProviderHome), which is the same thing the
  // in-place upgrade flows already do on completion (SignUpStep5Screen).
  //
  // Reset synchronously here, before the rAF below resolves requestMode()
  // callers: a notification tap that switches hats deep-links immediately
  // after that resolve, so its target must land on top of the fresh home
  // stack, not get wiped by a reset that happens after it.
  const previousModeRef = useRef(activeMode);
  useEffect(() => {
    const modeChanged = previousModeRef.current !== activeMode;
    previousModeRef.current = activeMode;
    // isLoggedIn gates it because MainTabs only exists on the authenticated
    // branch below — a mode change resolved while the auth stack is mounted
    // (profile restore during login) would otherwise dispatch a RESET no
    // navigator can handle.
    if (modeChanged && isLoggedIn && navigationRef.isReady()) {
      navigationRef.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    }
    const id = requestAnimationFrame(() => resolveModeChange(activeMode));
    return () => cancelAnimationFrame(id);
  }, [activeMode, isLoggedIn]);

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

  // Account is mid-30-day grace period — hold here instead of the normal
  // logged-in/logged-out branches below until they reactivate or decline.
  if (pendingReactivation) {
    return <ReactivateAccountScreen />;
  }

  return (
    <>
    <Modal visible={isSwitching} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent>
      <View style={[styles.switchOverlay, { backgroundColor: isDarkMode ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.5)' }]}>
        <View style={[styles.switchCard, { backgroundColor: switchingDestinationTheme.surfaceRaised, borderColor: switchingDestinationTheme.accent + '40' }]}>
          <ActivityIndicator size="large" color={switchingDestinationTheme.accent} />
          {/* State the hat being left as well as the one being entered — the
              two trees look alike on arrival, so direction is the only cue the
              user gets that the switch did what they expected. */}
          <Text style={[styles.switchFrom, { color: switchingDestinationTheme.sub }]}>
            Leaving {switchingTo === 'provider' ? 'Client' : 'Provider'} Mode
          </Text>
          <Text style={[styles.switchText, { color: switchingDestinationTheme.text }]}>
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
          // ── Authenticated screens ───────────────────────────────────────────
          // SignUpStep1-5 are included here so logged-in users can navigate the
          // in-place upgrade flows (client→provider, provider→client) and the
          // "create a separate client account" path (ProviderAccountScreen's
          // "Create new account" button lands on SignUpStep1, the role picker)
          // without leaving the authenticated session.
          <>
            <Stack.Screen
              name="MainTabs"
              component={MainTabsComponent}
              // animation 'none' so the hat-switch reset above swaps the tab
              // tree instantly instead of sliding a new card in from the right
              // — the switch is an identity change behind a full-screen
              // overlay, not a push. MainTabs only ever sits at the bottom of
              // this stack, so nothing else animates on it: screens pushed
              // above it (SignUpStep*, ClaimProvider) still use their own
              // horizontal transition in both directions.
              options={{ cardStyle: { backgroundColor: '#F5E6FA' }, animation: 'none' }}
            />
            {/* MainTabs' own tabs each carry their own ErrorBoundary already;
                these upgrade-flow screens sit as MainTabs' siblings, not
                inside it, so they need the same per-screen boundary the auth
                stack below gets — otherwise a crash here still falls through
                to App.tsx's single root boundary. */}
            <Stack.Screen name="SignUpStep1">{(props) => <ErrorBoundary><SignUpStep1Screen {...props} /></ErrorBoundary>}</Stack.Screen>
            <Stack.Screen name="SignUpStep2">{(props) => <ErrorBoundary><SignUpStep2Screen {...props} /></ErrorBoundary>}</Stack.Screen>
            <Stack.Screen name="SignUpStep3">{(props) => <ErrorBoundary><SignUpStep3Screen {...props} /></ErrorBoundary>}</Stack.Screen>
            <Stack.Screen name="SignUpStep4">{(props) => <ErrorBoundary><SignUpStep4Screen {...props} /></ErrorBoundary>}</Stack.Screen>
            <Stack.Screen name="SignUpStep5">{(props) => <ErrorBoundary><SignUpStep5Screen {...props} /></ErrorBoundary>}</Stack.Screen>
            {/* Reachable from ProviderProfileScreen's "Claim this business"
                CTA on an unclaimed listing — a logged-in client claiming a
                business ends up on the same SignUpStep1 upgrade path
                already registered above, just entered from a different
                starting point. */}
            <Stack.Screen name="ClaimProvider">{(props) => <ErrorBoundary><ClaimProviderScreen {...props} /></ErrorBoundary>}</Stack.Screen>
          </>
        ) : (
          // ── Auth screens only ───────────────────────────────────────────────
          // Every logged-in tab already gets its own ErrorBoundary (see
          // ClientTabNavigator/ProviderTabNavigator) so a crash in one tab
          // doesn't blank the others. These auth screens run before any tab
          // navigator exists, so without a boundary per screen here, a crash
          // on e.g. SignUpStep3 would fall through to App.tsx's single root
          // boundary instead — same fix, same reasoning, applied to the one
          // place that was still missing it.
          <>
            <Stack.Screen name="Welcome">{(props) => <ErrorBoundary><WelcomeScreen {...props} /></ErrorBoundary>}</Stack.Screen>
            <Stack.Screen name="Login">{(props) => <ErrorBoundary><LoginScreen {...props} /></ErrorBoundary>}</Stack.Screen>
            <Stack.Screen name="ClaimProvider">{(props) => <ErrorBoundary><ClaimProviderScreen {...props} /></ErrorBoundary>}</Stack.Screen>
            <Stack.Screen name="SignUpStep1">{(props) => <ErrorBoundary><SignUpStep1Screen {...props} /></ErrorBoundary>}</Stack.Screen>
            <Stack.Screen name="SignUpStep2">{(props) => <ErrorBoundary><SignUpStep2Screen {...props} /></ErrorBoundary>}</Stack.Screen>
            <Stack.Screen name="SignUpStep3">{(props) => <ErrorBoundary><SignUpStep3Screen {...props} /></ErrorBoundary>}</Stack.Screen>
            <Stack.Screen name="SignUpStep4">{(props) => <ErrorBoundary><SignUpStep4Screen {...props} /></ErrorBoundary>}</Stack.Screen>
            <Stack.Screen name="SignUpStep5">{(props) => <ErrorBoundary><SignUpStep5Screen {...props} /></ErrorBoundary>}</Stack.Screen>
            <Stack.Screen name="EmailVerification" options={{ gestureEnabled: false }}>{(props) => <ErrorBoundary><EmailVerificationScreen {...props} /></ErrorBoundary>}</Stack.Screen>
            <Stack.Screen name="ForgotPassword">{(props) => <ErrorBoundary><ForgotPasswordScreen {...props} /></ErrorBoundary>}</Stack.Screen>
            <Stack.Screen name="ResetPasswordOTP">{(props) => <ErrorBoundary><ResetPasswordOTPScreen {...props} /></ErrorBoundary>}</Stack.Screen>
            <Stack.Screen name="NewPassword">{(props) => <ErrorBoundary><NewPasswordScreen {...props} /></ErrorBoundary>}</Stack.Screen>
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  switchCard: {
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 36,
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
  },
  switchFrom: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  switchText: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
