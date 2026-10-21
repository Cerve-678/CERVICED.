// src/screens/auth/EmailVerificationScreen.tsx
import React, { useEffect, useState, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import {
  ActivityIndicator,
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
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  invokeSendAccountEmail,
  resendSignupOtp,
  upsertVerifiedUserProfile,
  verifySignupOtp,
} from '../../services/databaseService';
import { isBiometricAvailable, getBiometricLabel, enableBiometric } from '../../services/biometricService';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';
import { ThemedBackground } from '../../components/ThemedBackground';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';
import { logger } from '../../utils/logger';
import { BOTTOM_SAFE_GAP } from '../../utils/bottomSafeGap';

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
  // A short wait before the code can be resent, so a second tap doesn't
  // send a second email while the first is still arriving.
  const RESEND_WAIT_S = 30;
  const [resendIn, setResendIn] = useState(RESEND_WAIT_S);
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn(n => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

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
      let session: Awaited<ReturnType<typeof verifySignupOtp>>;
      try {
        session = await verifySignupOtp(email, token);
      } catch {
        Alert.alert('Invalid code', 'The code is incorrect or has expired. Try resending.');
        return;
      }
      const meta = session.userMetadata as Record<string, any>;
      const dob = meta['dob'] ?? '';

      const profilePayload = {
        id: session.userId,
        email: session.email ?? email,
        name: meta['name'] ?? '',
        phone: meta['phone'] ?? '',
        dob: dob || null,
        role: meta['role'] ?? 'user',
        // Set the hat ON for a client signup — the column defaults to false, so
        // leaving it out entirely would read as having no client profile and
        // lose the client tab. A provider signing up starts without one until
        // they add it (addClientProfile), which is the point of the column: it
        // is no longer inferred from whether `dob` happens to be set.
        //
        // Omitted rather than written as `false` for a provider, because this
        // is an UPSERT and an upsert only updates the columns it names. Writing
        // false would mean any re-run of this screen against an existing row —
        // a repeated verification, a retry — silently strips a client hat the
        // account had already added. Omitting it lets the column DEFAULT false
        // apply on insert while leaving an existing value untouched.
        ...((meta['role'] ?? 'user') !== 'provider' ? { has_client_profile: true } : {}),
        login_method: 'email',
        service_interests:     meta['service_interests']     ?? [],
        business_name:         meta['business_name']         ?? null,
        business_email:        meta['business_email']        ?? null,
        business_type:         meta['business_type']         ?? null,
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
        location_text:         meta['location']              ?? null,
        maintenance_frequency: meta['maintenance_frequency'] ?? null,
        referral_source:       meta['referral_source']       ?? null,
        gender:                meta['gender']                ?? null,
        has_kids:              meta['has_kids']               ?? false,
        // Staged on users (INT), copied to providers.years_experience by
        // InfoRegScreen's first-save prefill. Signup sends it as a numeric
        // string; coerce and drop anything non-numeric rather than upserting a
        // bad value into an INT column.
        years_experience:      meta['years_experience'] != null && !Number.isNaN(parseInt(String(meta['years_experience']), 10))
                                 ? parseInt(String(meta['years_experience']), 10)
                                 : null,
        accessibility_notes:   meta['accessibility_notes']     ?? null,
        languages_spoken:      meta['languages_spoken']        ?? [],
        specialties:           meta['specialties']             ?? [],
        price_range:               meta['price_range']               ?? null,
        preferred_contact_methods: meta['preferred_contact_methods'] ?? [],
        preferred_payment_methods: meta['preferred_payment_methods'] ?? [],
        external_booking_url:      meta['external_booking_url']      ?? null,
      };

      try {
        await upsertVerifiedUserProfile(profilePayload);
      } catch (upsertError) {
        // This is the account's only chance to save its signup answers — the
        // auth user already exists at this point regardless of outcome, and
        // nothing later retries it. Silently swallowing this (as before,
        // logger.warn only) left the user signed in with a blank profile and
        // no indication anything went wrong. Retry once in place; only
        // surface failure to the user if the retry also fails.
        logger.error('Profile upsert failed, retrying once:', upsertError);
        try {
          await upsertVerifiedUserProfile(profilePayload);
        } catch (retryError) {
          logger.error('Profile upsert retry also failed:', retryError);
          Alert.alert(
            'Almost there',
            "Your account was created, but we couldn't save some of your details just now. " +
            'You can fill in anything missing from Settings.'
          );
        }
      }

      // Non-blocking: the account exists either way and nothing here should
      // stand between the user and being signed in. The template, recipient
      // and name are all resolved server-side — this only says which welcome.
      invokeSendAccountEmail(
        meta['role'] === 'provider' ? 'provider_welcome' : 'client_welcome',
      ).catch((e) => {
        logger.error('[email] welcome email failed to send:', e);
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // onAuthStateChange fires after verifyOtp and handles login state via loadUserProfile.
      // No manual login() call needed — avoids double-write and the race where loadUserProfile
      // would override an early login() call with setIsLoggedIn(false) if the upsert hadn't
      // finished yet. Navigation to MainTabs happens automatically when isLoggedIn flips true.

      // Offer biometric sign-in for this brand-new account right away. Uses
      // Alert.alert (not a custom modal) because RootNavigation unmounts this
      // whole screen the instant isLoggedIn flips true — a native Alert is
      // OS-level and survives that unmount, a React modal wouldn't.
      if (session.refreshToken) {
        const refreshToken = session.refreshToken;
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
    try {
      await resendSignupOtp(email);
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
      setResendIn(RESEND_WAIT_S);
      Alert.alert('Sent!', 'A new code has been sent to your email.');
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Error', "Couldn't resend the code. Please try again.");
    } finally {
      setResending(false);
    }
  };

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />
      <KeyboardDismissView>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: BOTTOM_SAFE_GAP }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.content, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 32 }]}>
            <Text style={[styles.step, { color: t.sub }]}>LAST STEP</Text>

            <View style={[styles.iconTile, { backgroundColor: t.accentDim }]}>
              <Ionicons name="mail-outline" size={30} color={t.accentText} />
            </View>

            <Text style={[styles.title, { color: t.text }]}>Check your email</Text>
            <Text style={[styles.subtitle, { color: t.sub }]}>
              We sent a 6-digit code to <Text style={{ color: t.text, fontWeight: '700' }}>{email}</Text>
            </Text>

            <View style={styles.otpRow}>
              {otp.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={ref => { inputRefs.current[index] = ref; }}
                  style={[
                    styles.otpBox,
                    { color: t.text, backgroundColor: t.card, borderColor: digit ? t.accent : t.border, borderWidth: digit ? 2 : 1 },
                  ]}
                  value={digit}
                  onChangeText={val => handleOtpChange(val, index)}
                  onKeyPress={e => handleKeyPress(e, index)}
                  keyboardType="number-pad"
                  maxLength={6}
                  textAlign="center"
                  selectionColor={t.accent}
                  autoFocus={index === 0}
                  textContentType="oneTimeCode"
                  accessibilityLabel={`Digit ${index + 1}`}
                />
              ))}
            </View>

            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: t.border }]}
              onPress={handleResend}
              activeOpacity={0.6}
              disabled={resending || resendIn > 0}
            >
              {resending ? (
                <ActivityIndicator color={t.text} />
              ) : (
                <Text style={[styles.secondaryBtnText, { color: resendIn > 0 ? t.sub : t.accentText }]}>
                  {resendIn > 0 ? `Resend code in 0:${String(resendIn).padStart(2, '0')}` : 'Resend code'}
                </Text>
              )}
            </TouchableOpacity>

            <View style={{ flex: 1 }} />

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: t.accent }]}
              onPress={handleVerify}
              activeOpacity={0.75}
              disabled={isVerifying}
            >
              {isVerifying ? (
                <ActivityIndicator color={t.onAccent} />
              ) : (
                <Text style={[styles.primaryBtnText, { color: t.onAccent }]}>VERIFY & FINISH</Text>
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
      </KeyboardDismissView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 20 },
  step: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '700', letterSpacing: 1, marginBottom: 28 },
  iconTile: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 30, lineHeight: 36, letterSpacing: 0.5, marginBottom: 8 },
  subtitle: { fontFamily: 'Jura-VariableFont_wght', fontSize: 15, lineHeight: 22, marginBottom: 28 },
  otpRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  otpBox: { flex: 1, height: 58, borderRadius: 14, fontSize: 24, fontFamily: 'BakbakOne-Regular' },
  secondaryBtn: { alignSelf: 'flex-start', minHeight: 44, borderRadius: 100, borderWidth: 1, paddingHorizontal: 16, justifyContent: 'center' },
  secondaryBtnText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '700' },
  primaryBtn: { minHeight: 56, borderRadius: 100, alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  primaryBtnText: { fontFamily: 'BakbakOne-Regular', fontSize: 15, letterSpacing: 1.5 },
  backLink: { alignSelf: 'center', paddingVertical: 14 },
  backLinkText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '600' },
});
