// src/screens/auth/LoginScreen.tsx
import React, { useState, useCallback, useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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

type Props = StackScreenProps<RootStackParamList, 'Login'>;

const L = { bg: '#F5F1EC', surface: '#EDE8E2', card: '#FFFFFF', accent: '#AF9197', text: '#000000', sub: '#7E6667', border: 'rgba(126,102,103,0.14)' };
const D = { bg: '#1A1815', surface: '#201D1A', card: '#252220', accent: '#AF9197', text: '#F0ECE7', sub: '#7E6667', border: 'rgba(126,102,103,0.18)' };

export default function LoginScreen({ navigation }: Props) {
  const { isDarkMode } = useTheme();
  const t = isDarkMode ? D : L;
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Face ID');

  useEffect(() => {
    (async () => {
      const available = await isBiometricAvailable();
      if (!available) return;
      const [enabled, label] = await Promise.all([isBiometricEnabled(), getBiometricLabel()]);
      setBiometricAvailable(true);
      setBiometricEnabled(enabled);
      setBiometricLabel(label);
    })();
  }, []);

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

    console.log('[Login] Attempting signInWithPassword for:', email.trim());
    setIsLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    console.log('[Login] signInWithPassword result — error:', error?.message ?? 'none', '| session:', data?.session?.user?.id ?? 'no session');
    setIsLoading(false);

    if (error) {
      Alert.alert('Login failed', 'Incorrect email or password. Please try again.');
      return;
    }

    if (biometricAvailable && !biometricEnabled && data.session?.refresh_token) {
      const token = data.session.refresh_token;
      Alert.alert(
        `Enable ${biometricLabel}?`,
        `Sign in faster next time using ${biometricLabel} instead of your password.`,
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Enable',
            onPress: async () => {
              await enableBiometric(token);
              setBiometricEnabled(true);
            },
          },
        ]
      );
    }
    console.log('[Login] Success — waiting for onAuthStateChange...');
  };

  const handleSocialLogin = (provider: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Alert.alert('Coming soon', `${provider} login will be available soon.`);
  };

  const handleAppleLogin = async () => {
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
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      setIsLoading(false);
      if (error) Alert.alert('Sign in failed', error.message);
      // On success, AuthContext.onAuthStateChange handles navigation
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Sign in failed', 'Something went wrong. Please try again.');
      }
    }
  };

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
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
              <View style={[styles.inputWrap, { backgroundColor: t.surface, borderColor: touched['password'] && errors.password ? '#DC2626' : t.border }]}>
                <TextInput
                  style={[styles.input, { color: t.text }]}
                  value={password}
                  onChangeText={setPassword}
                  onBlur={() => markTouched('password')}
                  placeholder="••••••••"
                  placeholderTextColor={t.sub}
                  secureTextEntry
                />
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
                  {biometricLabel === 'Face ID' ? '' : ''} Sign in with {biometricLabel}
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
      </KeyboardAvoidingView>
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
