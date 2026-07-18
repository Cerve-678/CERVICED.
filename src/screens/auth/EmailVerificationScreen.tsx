// src/screens/auth/EmailVerificationScreen.tsx
import React, { useState, useRef } from 'react';
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
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { sendEmail, clientWelcomeEmail, providerWelcomeEmail } from '../../services/emailService';
import { isBiometricAvailable, getBiometricLabel, enableBiometric } from '../../services/biometricService';
import { upsertUserAfterVerification } from '../../services/databaseService';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';
import { ThemedBackground } from '../../components/ThemedBackground';
import { logger } from '../../utils/logger';

type Props = StackScreenProps<RootStackParamList, 'EmailVerification'>;


export default function EmailVerificationScreen({ navigation, route }: Props) {
  useAuth(); // keep context mounted so auth state is available
  const { isDarkMode, palette: t } = useTheme();
  const insets = useSafeAreaInsets();
  const email = route.params?.email ?? '';

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isVerifying, setIsVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const handleOtpChange = (value: string, index: number) => {
    if (value.length === 6) {
      const digits = value.split('').slice(0, 6);
      setOtp(digits);
      inputRefs.current[5]?.focus();
      return;
    }
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const token = otp.join('');
    if (token.length < 6) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Enter code', 'Please enter the 6-digit code from your email.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setIsVerifying(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
      if (error) {
        Alert.alert('Invalid code', 'The code is incorrect or has expired. Try resending.');
        return;
      }

      const session = data?.session;
      if (!session) {
        Alert.alert('Verification failed', 'Could not sign in. Please try resending the code.');
        return;
      }

      const meta = session.user.user_metadata as Record<string, any>;
      const dob = meta['dob'] ?? '';

      const { error: upsertError } = await supabase.from('users').upsert({
        id: session.user.id,
        email: session.user.email ?? email,
        name: meta['name'] ?? '',
        phone: meta['phone'] ?? '',
        dob: dob || null,
        role: meta['role'] ?? 'user',
        login_method: 'email',
        service_interests:     meta['service_interests']     ?? [],
        business_name:         meta['business_name']         ?? null,
        business_email:        meta['business_email']        ?? null,
        business_phone:        meta['business_phone']        ?? null,
        instagram:             meta['instagram']             ?? null,
        tiktok:                meta['tiktok']                ?? null,
        website:               meta['website']               ?? null,
        hair_type:             meta['hair_type']             ?? null,
        skin_type:             meta['skin_type']             ?? null,
        allergies:             meta['allergies']             ?? [],
        skin_concerns:         meta['skin_concerns']         ?? [],
        style_vibe:            meta['style_vibe']            ?? null,
        treatment_history:     meta['treatment_history']     ?? [],
        medical_notes:         meta['medical_notes']         ?? null,
        photography_consent:   meta['photography_consent']   ?? true,
        service_locations:     meta['service_locations']     ?? [],
        maintenance_frequency: meta['maintenance_frequency'] ?? null,
        referral_source:       meta['referral_source']       ?? null,
        gender:                meta['gender']                ?? null,
        has_kids:              meta['has_kids']              ?? false,
      }, { onConflict: 'id' });

      if (upsertError) {
        logger.warn('Profile upsert error:', upsertError.message);
      }

      const toEmail = meta['role'] === 'provider'
        ? (meta['business_email'] || session.user.email!)
        : session.user.email!;
      const template = meta['role'] === 'provider'
        ? providerWelcomeEmail({ name: meta['name'] ?? '', ...(meta['business_name'] ? { businessName: meta['business_name'] } : {}) })
        : clientWelcomeEmail({ name: meta['name'] ?? '' });
      sendEmail(toEmail, template.subject, template.html).catch(() => {});

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // onAuthStateChange fires after verifyOtp and handles login state via loadUserProfile.
      // No manual login() call needed — avoids double-write and the race where loadUserProfile
      // would override an early login() call with setIsLoggedIn(false) if the upsert hadn't
      // finished yet. Navigation to MainTabs happens automatically when isLoggedIn flips true.

      // Offer biometric sign-in for this brand-new account right away. Uses
      // Alert.alert (not a custom modal) because RootNavigation unmounts this
      // whole screen the instant isLoggedIn flips true — a native Alert is
      // OS-level and survives that unmount, a React modal wouldn't.
      if (session.refresh_token) {
        const refreshToken = session.refresh_token;
        isBiometricAvailable().then(async (available) => {
          if (!available) return;
          const label = await getBiometricLabel();
          Alert.alert(
            `Enable ${label}?`,
            `Sign in faster next time using ${label} instead of your password.`,
            [
              { text: 'Not now', style: 'cancel' },
              { text: 'Enable', onPress: () => { enableBiometric(refreshToken).catch(() => {}); } },
            ]
          );
        }).catch(() => {});
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      logger.error('OTP verification error:', err);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setResending(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    setResending(false);
    if (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Error', "Couldn't resend the code. Please try again.");
    } else {
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
      Alert.alert('Sent!', 'A new code has been sent to your email.');
    }
  };

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.content, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }]}>

            <View style={[styles.iconCircle, { backgroundColor: t.surface }]}>
              <Text style={[styles.iconGlyph, { color: t.accent }]}>✉️</Text>
            </View>

            <Text style={[styles.title, { color: t.text }]}>Check your email</Text>
            <Text style={[styles.subtitle, { color: t.sub }]}>We sent a 6-digit code to</Text>
            <Text style={[styles.emailText, { color: t.text }]}>{email}</Text>

            <View style={styles.otpRow}>
              {otp.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={ref => { inputRefs.current[index] = ref; }}
                  style={[
                    styles.otpBox,
                    {
                      color: t.text,
                      backgroundColor: t.surface,
                      borderColor: digit ? t.accent : t.border,
                    },
                  ]}
                  value={digit}
                  onChangeText={val => handleOtpChange(val, index)}
                  onKeyPress={e => handleKeyPress(e, index)}
                  keyboardType="number-pad"
                  maxLength={6}
                  textAlign="center"
                  selectionColor={t.accent}
                  autoFocus={index === 0}
                />
              ))}
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: t.accent }]}
              onPress={handleVerify}
              activeOpacity={0.75}
              disabled={isVerifying}
            >
              {isVerifying ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryBtnText}>VERIFY EMAIL</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryBtn, { backgroundColor: t.surface, borderColor: t.border }]}
              onPress={handleResend}
              activeOpacity={0.6}
              disabled={resending}
            >
              {resending ? (
                <ActivityIndicator color={t.text} />
              ) : (
                <Text style={[styles.secondaryBtnText, { color: t.text }]}>Resend code</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backLink}
              onPress={() => {
                // Reset to Welcome → Login so the back arrow on Login still works
                navigation.reset({ index: 1, routes: [{ name: 'Welcome' }, { name: 'Login' }] });
              }}
              activeOpacity={0.6}
            >
              <Text style={[styles.backLinkText, { color: t.sub }]}>Back to log in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  iconGlyph: { fontSize: 36 },
  title: {
    fontSize: 28,
    fontFamily: 'BakbakOne-Regular',
    letterSpacing: 0.5,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 4,
  },
  emailText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 32,
  },
  otpRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 36,
  },
  otpBox: {
    width: 48,
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    fontSize: 22,
    fontFamily: 'BakbakOne-Regular',
  },
  primaryBtn: {
    width: '100%',
    height: 52,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  primaryBtnText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    letterSpacing: 1,
    color: '#FFFFFF',
  },
  secondaryBtn: {
    width: '100%',
    height: 52,
    borderRadius: 100,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  secondaryBtnText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  backLink: { paddingVertical: 8 },
  backLinkText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
  },
});
