// src/screens/auth/ResetPasswordOTPScreen.tsx
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
import { supabase } from '../../lib/supabase';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';
import { ThemedBackground } from '../../components/ThemedBackground';

type Props = StackScreenProps<RootStackParamList, 'ResetPasswordOTP'>;

const L = { bg: '#F5F1EC', surface: '#EDE8E2', card: '#FFFFFF', accent: '#AF9197', text: '#000000', sub: '#7E6667', border: 'rgba(126,102,103,0.14)' };
const D = { bg: '#1A1815', surface: '#201D1A', card: '#252220', accent: '#AF9197', text: '#F0ECE7', sub: '#7E6667', border: 'rgba(126,102,103,0.18)' };

export default function ResetPasswordOTPScreen({ navigation, route }: Props) {
  const { isDarkMode } = useTheme();
  const t = isDarkMode ? D : L;
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
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' });
    if (error) {
      setIsVerifying(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Invalid code', 'The code is incorrect or has expired. Try resending.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setIsVerifying(false);
    navigation.navigate('NewPassword');
  };

  const handleResend = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setResending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
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
              <Text style={[styles.iconGlyph, { color: t.accent }]}>🔑</Text>
            </View>

            <Text style={[styles.title, { color: t.text }]}>Enter reset code</Text>
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
                <Text style={styles.primaryBtnText}>VERIFY CODE</Text>
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

            <TouchableOpacity style={styles.backLink} onPress={() => navigation.navigate('Login')} activeOpacity={0.6}>
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
