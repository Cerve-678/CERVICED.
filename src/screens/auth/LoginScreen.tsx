// src/screens/auth/LoginScreen.tsx
import React, { useState, useCallback, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import {
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import { validateEmail } from '../../utils/validation';
import {
  refreshAuthSession,
  signInWithAppleIdToken,
  signInWithEmailPassword,
} from '../../services/databaseService';
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  isBiometricAvailable,
  isBiometricEnabled,
  getBiometricLabel,
  getBiometricRefreshToken,
  enableBiometric,
  authenticateWithBiometrics,
  disableBiometric,
} from '../../services/biometricService';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';
import { ThemedBackground } from '../../components/ThemedBackground';
import { Ionicons } from '@expo/vector-icons';
import { FieldRow, FormCard, PrimaryButton, ScreenTitle, useFieldInputStyle } from '../../components/signup/FormKit';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';
import { logger } from '../../utils/logger';
import { useAuth } from '../../contexts/AuthContext';

type Props = StackScreenProps<RootStackParamList, 'Login'>;


export default function LoginScreen({ navigation }: Props) {
  const { isDarkMode, palette: t } = useTheme();
  const { isLoggedIn } = useAuth();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Face ID');
  // Guards re-entrant taps synchronously — see handleAppleLogin below.
  const isAppleInFlightRef = useRef(false);

  // useFocusEffect (not a mount-only useEffect) — a failed login attempt
  // doesn't unmount this screen, and a stale one-time check could otherwise
  // get stuck reporting "unavailable" for the rest of that session even
  // after Face ID becomes available. Re-checking on every focus self-heals.
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      const available = await isBiometricAvailable();
      if (cancelled) return;
      setBiometricAvailable(available);
      if (!available) return;
      const [enabled, label] = await Promise.all([isBiometricEnabled(), getBiometricLabel()]);
      if (cancelled) return;
      setBiometricEnabled(enabled);
      setBiometricLabel(label);
    })();
    return () => { cancelled = true; };
  }, []));

  // Shared by every successful sign-in path (password, Apple) — offers to
  // remember this device via biometrics instead of typing credentials again.
  const maybePromptEnableBiometric = useCallback((refreshToken: string | undefined) => {
    if (!biometricAvailable || biometricEnabled || !refreshToken) return;
    Alert.alert(
      `Enable ${biometricLabel}?`,
      `Sign in faster next time using ${biometricLabel} instead of your password.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Enable',
          onPress: async () => {
            await enableBiometric(refreshToken);
            setBiometricEnabled(true);
          },
        },
      ]
    );
  }, [biometricAvailable, biometricEnabled, biometricLabel]);

  const validate = useCallback(() => {
    const errs: { email?: string; password?: string } = {};
    if (!email.trim()) errs.email = 'Email is required';
    else if (!validateEmail(email)) errs.email = 'Enter a valid email';
    if (!password) errs.password = 'Password is required';
    return errs;
  }, [email, password]);

  const markTouched = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    setErrors(validate());
  };

  const inputStyle = useFieldInputStyle();
  const fieldError = (field: 'email' | 'password') => (touched[field] ? errors[field] : undefined);

  const handleBiometricLogin = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const authenticated = await authenticateWithBiometrics(biometricLabel);
    if (!authenticated) return;

    const refreshToken = await getBiometricRefreshToken();
    if (!refreshToken) {
      Alert.alert('Session expired', 'Please sign in with your password to reconnect Face ID.');
      await disableBiometric();
      setBiometricEnabled(false);
      return;
    }

    setIsLoading(true);
    try {
      await refreshAuthSession(refreshToken);
    } catch {
      Alert.alert('Session expired', 'Please sign in with your password to reconnect Face ID.');
      await disableBiometric();
      setBiometricEnabled(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    const errs = validate();
    setErrors(errs);
    setTouched({ email: true, password: true });
    if (Object.keys(errs).length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    logger.log('[Login] Attempting signInWithPassword for:', email.trim());
    setIsLoading(true);
    try {
      const session = await signInWithEmailPassword(email.trim(), password);
      logger.log('[Login] signInWithPassword result — session:', session.userId);
      maybePromptEnableBiometric(session.refreshToken ?? undefined);
      logger.log('[Login] Success — waiting for onAuthStateChange...');
    } catch (error) {
      // A 4xx (bad credentials / unconfirmed) is the user's details; a 5xx,
      // rate-limit, or no-status (network) is our problem, not their password —
      // log those so we can see them, and give an accurate, non-blaming message.
      const status = (error as { status?: number }).status;
      if (!status || status >= 500 || status === 429) {
        logger.error('[Login] sign-in failed (server/network):', error);
        Alert.alert('Login failed', "We couldn't sign you in just now. Please try again.");
      } else {
        Alert.alert('Login failed', 'Incorrect email or password. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialLogin = (provider: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Alert.alert('Coming soon', `${provider} login will be available soon.`);
  };

  const handleAppleLogin = async () => {
    // Synchronous re-entry guard — `disabled={isLoading}` on the button only
    // takes effect after a re-render, leaving a brief window where a fast
    // double-tap fires this handler twice concurrently. A second concurrent
    // AppleAuthentication.signInAsync() call while the first is still in
    // flight rejects (the native sheet is already showing/dismissed), which
    // used to surface a "Sign in failed" alert even though the FIRST call's
    // signInWithIdToken had already succeeded and logged the user in.
    if (isAppleInFlightRef.current) return;
    isAppleInFlightRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        Alert.alert('Sign in failed', 'No identity token received from Apple.');
        return;
      }
      setIsLoading(true);
      const session = await signInWithAppleIdToken(credential.identityToken);
      setIsLoading(false);
      maybePromptEnableBiometric(session.refreshToken ?? undefined);
      // On success, AuthContext.onAuthStateChange handles navigation
    } catch (e: any) {
      // A concurrent/duplicate attempt (or one that lands after the user is
      // already signed in via an earlier in-flight call) must not show a
      // false failure alert — check the real auth state before alerting.
      if (e.code !== 'ERR_REQUEST_CANCELED' && !isLoggedIn) {
        Alert.alert('Sign in failed', 'Something went wrong. Please try again.');
      }
    } finally {
      setIsLoading(false);
      isAppleInFlightRef.current = false;
    }
  };

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      <KeyboardDismissView style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: t.card, borderColor: t.border }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={20} color={t.text} />
          </TouchableOpacity>

          <ScreenTitle title="Welcome back" subtitle="Log in to your account." />

          <FormCard>
            <FieldRow label="EMAIL" error={fieldError('email')}>
              <TextInput
                style={inputStyle} value={email} onChangeText={setEmail} onBlur={() => markTouched('email')}
                placeholder="sarah@example.com" placeholderTextColor={t.sub}
                keyboardType="email-address" autoCapitalize="none" textContentType="emailAddress"
              />
            </FieldRow>
            <FieldRow
              label="PASSWORD"
              error={fieldError('password')}
              right={(
                <TouchableOpacity
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowPassword(v => !v); }}
                  hitSlop={10}
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={t.sub} />
                </TouchableOpacity>
              )}
            >
              <TextInput
                style={inputStyle} value={password} onChangeText={setPassword} onBlur={() => markTouched('password')}
                placeholder="••••••••" placeholderTextColor={t.sub} secureTextEntry={!showPassword}
                autoCapitalize="none" textContentType="password"
              />
            </FieldRow>
          </FormCard>

          <TouchableOpacity
            style={styles.forgotLink}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); navigation.navigate('ForgotPassword'); }}
            activeOpacity={0.6}
            hitSlop={8}
          >
            <Text style={[styles.forgotLinkText, { color: t.accentText }]}>Forgot password?</Text>
          </TouchableOpacity>

          <PrimaryButton label="LOG IN" onPress={handleLogin} loading={isLoading} />

          {biometricEnabled && (
            <TouchableOpacity
              style={[styles.outlineBtn, { borderColor: t.accent, marginTop: 10 }]}
              onPress={handleBiometricLogin}
              activeOpacity={0.6}
              disabled={isLoading}
            >
              <Ionicons name="scan-outline" size={18} color={t.accentText} />
              <Text style={[styles.outlineText, { color: t.accentText }]}>Sign in with {biometricLabel}</Text>
            </TouchableOpacity>
          )}

          <View style={styles.divider}>
            <View style={[styles.dividerLine, { backgroundColor: t.border }]} />
            <Text style={[styles.dividerLabel, { color: t.sub }]}>OR CONTINUE WITH</Text>
            <View style={[styles.dividerLine, { backgroundColor: t.border }]} />
          </View>

          <TouchableOpacity
            style={[styles.appleBtn, { backgroundColor: t.text }]}
            onPress={handleAppleLogin}
            activeOpacity={0.75}
            disabled={isLoading}
            accessibilityLabel="Continue with Apple"
          >
            <Ionicons name="logo-apple" size={18} color={t.bg} />
            <Text style={[styles.outlineText, { color: t.bg }]}>Continue with Apple</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.outlineBtn, { borderColor: t.border, marginTop: 10 }]}
            onPress={() => handleSocialLogin('Google')}
            activeOpacity={0.7}
          >
            <Text style={[styles.outlineText, { color: t.text }]}>Continue with Google</Text>
          </TouchableOpacity>

          <Text style={[styles.signUpText, { color: t.sub }]}>
            Don't have an account?{' '}
            <Text
              style={{ color: t.accentText, fontWeight: '700' }}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.navigate('SignUpStep1'); }}
            >
              Sign up
            </Text>
          </Text>
        </ScrollView>
      </KeyboardDismissView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 16, flexGrow: 1 },
  backBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  forgotLink: { alignSelf: 'flex-end', paddingVertical: 14 },
  forgotLinkText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '700' },
  outlineBtn: { minHeight: 56, borderRadius: 100, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  appleBtn: { minHeight: 56, borderRadius: 100, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  outlineText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 16, fontWeight: '700' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 24 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerLabel: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '700', letterSpacing: 1.5 },
  signUpText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, textAlign: 'center', marginTop: 24 },
});
