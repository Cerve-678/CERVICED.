// src/screens/auth/LoginScreen.tsx
import React, { useState, useCallback, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import {
  ActivityIndicator,
  Alert,
  Platform,
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
import { supabase } from '../../lib/supabase';
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

  const renderError = (field: 'email' | 'password') => {
    if (!touched[field] || !errors[field]) return null;
    return <Text style={[styles.errorText, { color: '#DC2626' }]}>{errors[field]}</Text>;
  };

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
    const { error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    setIsLoading(false);

    if (error) {
      Alert.alert('Session expired', 'Please sign in with your password to reconnect Face ID.');
      await disableBiometric();
      setBiometricEnabled(false);
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
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    logger.log('[Login] signInWithPassword result — error:', error?.message ?? 'none', '| session:', data?.session?.user?.id ?? 'no session');
    setIsLoading(false);

    if (error) {
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
      return;
    }

    maybePromptEnableBiometric(data.session?.refresh_token);
    logger.log('[Login] Success — waiting for onAuthStateChange...');
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
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      setIsLoading(false);
      if (error) {
        logger.error('[Login] Apple sign-in failed:', error);
        Alert.alert('Sign in failed', "We couldn't sign you in just now. Please try again.");
        return;
      }
      maybePromptEnableBiometric(data.session?.refresh_token);
      // On success, AuthContext.onAuthStateChange handles navigation
    } catch (e: any) {
      // A concurrent/duplicate attempt (or one that lands after the user is
      // already signed in via an earlier in-flight call) must not show a
      // false failure alert — check the real auth state before alerting.
      if (e.code !== 'ERR_REQUEST_CANCELED' && !isLoggedIn) {
        Alert.alert('Sign in failed', 'Something went wrong. Please try again.');
      }
    } finally {
      isAppleInFlightRef.current = false;
    }
  };

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />

      <KeyboardDismissView style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: 120 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back */}
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: t.surface, borderColor: t.border }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
            activeOpacity={0.6}
          >
            <Text style={[styles.backIcon, { color: t.text }]}>{'<'}</Text>
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: t.text }]}>Welcome Back</Text>
          </View>

          {/* Form Card */}
          <View style={[styles.formCard, { backgroundColor: t.card, borderColor: t.border }]}>
            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: t.sub }]}>EMAIL</Text>
              <View style={[styles.inputWrap, { backgroundColor: t.surface, borderColor: touched['email'] && errors.email ? '#DC2626' : t.border }]}>
                <TextInput
                  style={[styles.input, { color: t.text }]}
                  value={email}
                  onChangeText={setEmail}
                  onBlur={() => markTouched('email')}
                  placeholder="sarah@example.com"
                  placeholderTextColor={t.sub}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              {renderError('email')}
            </View>

            {/* Password */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: t.sub }]}>PASSWORD</Text>
              <View style={[styles.inputWrap, styles.passwordInputWrap, { backgroundColor: t.surface, borderColor: touched['password'] && errors.password ? '#DC2626' : t.border }]}>
                <TextInput
                  style={[styles.input, styles.passwordInput, { color: t.text }]}
                  value={password}
                  onChangeText={setPassword}
                  onBlur={() => markTouched('password')}
                  placeholder="••••••••"
                  placeholderTextColor={t.sub}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowPassword(v => !v); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.eyeText, { color: t.sub }]}>{showPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>
              {renderError('password')}
            </View>

            {/* Forgot password */}
            <TouchableOpacity
              style={styles.forgotLink}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); navigation.navigate('ForgotPassword'); }}
              activeOpacity={0.6}
            >
              <Text style={[styles.forgotLinkText, { color: t.accent }]}>Forgot password?</Text>
            </TouchableOpacity>

            {/* Biometric */}
            {biometricEnabled && (
              <TouchableOpacity
                style={[styles.biometricBtn, { borderColor: t.accent }]}
                onPress={handleBiometricLogin}
                activeOpacity={0.6}
                disabled={isLoading}
              >
                <Text style={[styles.biometricText, { color: t.accent }]}>
                  Sign in with {biometricLabel}
                </Text>
              </TouchableOpacity>
            )}

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: t.accent }]}
              onPress={handleLogin}
              activeOpacity={0.75}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitText}>LOG IN</Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={[styles.dividerLine, { backgroundColor: t.border }]} />
              <Text style={[styles.dividerLabel, { color: t.sub }]}>OR</Text>
              <View style={[styles.dividerLine, { backgroundColor: t.border }]} />
            </View>

            {/* Social */}
            <View style={styles.socialRow}>
              {(['Instagram', 'Google'] as const).map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.socialBtn, { backgroundColor: t.surface, borderColor: t.border }]}
                  onPress={() => handleSocialLogin(p)}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.socialLabel, { color: t.text }]}>{p}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.socialBtn, { backgroundColor: t.surface, borderColor: t.border }]}
                onPress={handleAppleLogin}
                activeOpacity={0.6}
                disabled={isLoading}
              >
                <Text style={[styles.socialLabel, { color: t.text }]}>Apple</Text>
              </TouchableOpacity>
            </View>

            {/* Sign Up link */}
            <View style={styles.signUpRow}>
              <Text style={[styles.signUpText, { color: t.sub }]}>
                Don't have an account?{' '}
              </Text>
              <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.navigate('SignUpStep1'); }}>
                <Text style={[styles.signUpLink, { color: t.accent }]}>Sign Up</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardDismissView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 16 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  backIcon: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 18,
  },
  header: { marginBottom: 28 },
  headerTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 32,
    letterSpacing: 1,
  },
  formCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  inputWrap: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'android' ? 10 : 13,
  },
  input: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 15,
    letterSpacing: 0.3,
    padding: 0,
  },
  passwordInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
  },
  eyeBtn: { paddingLeft: 8 },
  eyeText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    marginTop: 5,
    marginLeft: 2,
  },
  forgotLink: {
    alignSelf: 'flex-end',
    marginBottom: 16,
    marginTop: -4,
  },
  forgotLinkText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    fontWeight: '600',
  },
  biometricBtn: {
    borderRadius: 100,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
  },
  biometricText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  submitBtn: {
    borderRadius: 100,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  submitText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    letterSpacing: 1,
    color: '#FFFFFF',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    letterSpacing: 2,
    marginHorizontal: 16,
  },
  socialRow: { flexDirection: 'row', gap: 10 },
  socialBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 13,
    alignItems: 'center',
  },
  socialLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    fontWeight: '600',
  },
  signUpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  signUpText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
  },
  signUpLink: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
  },
});
