// src/screens/auth/EmailVerificationScreen.tsx
import React, { useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import { supabase } from '../../lib/supabase';
import { sendEmail, clientWelcomeEmail, providerWelcomeEmail } from '../../services/emailService';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = StackScreenProps<RootStackParamList, 'EmailVerification'>;

export default function EmailVerificationScreen({ navigation, route }: Props) {
  const { theme, isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();
  const email = route.params?.email ?? '';

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isVerifying, setIsVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const glassStyle = () => ({
    backgroundColor: isDarkMode ? 'rgba(58,58,60,0.6)' : 'rgba(255,255,255,0.15)',
    borderTopColor: isDarkMode ? theme.border : 'rgba(255,255,255,0.7)',
    borderLeftColor: isDarkMode ? theme.border : 'rgba(255,255,255,0.5)',
    borderRightColor: isDarkMode ? theme.border : 'rgba(255,255,255,0.2)',
    borderBottomColor: isDarkMode ? theme.border : 'rgba(255,255,255,0.2)',
  });

  const handleOtpChange = (value: string, index: number) => {
    // Handle paste of full 6-digit code
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
      Alert.alert('Enter code', 'Please enter the 6-digit code from your email.');
      return;
    }
    setIsVerifying(true);
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });
    if (error) {
      setIsVerifying(false);
      Alert.alert('Invalid code', 'The code is incorrect or has expired. Try resending.');
      return;
    }
    // OTP verified — send welcome email
    if (data.session) {
      const meta = data.session.user.user_metadata as Record<string, string>;
      const toEmail = meta['role'] === 'provider'
        ? (meta['business_email'] || data.session.user.email!)
        : data.session.user.email!;
      try {
        const template = meta['role'] === 'provider'
          ? providerWelcomeEmail({ name: meta['name'] ?? '', ...(meta['business_name'] ? { businessName: meta['business_name'] } : {}) })
          : clientWelcomeEmail({ name: meta['name'] ?? '' });
        await sendEmail(toEmail, template.subject, template.html);
      } catch (_) { /* Non-fatal */ }
    }
    setIsVerifying(false);
    // AuthContext onAuthStateChange fires automatically and navigates to main app
  };

  const handleResend = async () => {
    setResending(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    setResending(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
      Alert.alert('Sent!', 'A new code has been sent to your email.');
    }
  };

  return (
    <ThemedBackground style={styles.bg}>
      <StatusBar barStyle={theme.statusBar} translucent />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.content, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }]}>
          {/* Icon */}
          <Text style={styles.icon}>✉️</Text>

          {/* Title */}
          <Text style={[styles.title, { color: theme.text }]}>Check your email</Text>

          {/* Subtitle */}
          <Text style={[styles.subtitle, { color: theme.secondaryText }]}>
            We sent a 6-digit code to
          </Text>
          <Text style={[styles.email, { color: theme.text }]}>{email}</Text>

          {/* OTP Input */}
          <View style={styles.otpRow}>
            {otp.map((digit, index) => (
              <TextInput
                key={index}
                ref={ref => { inputRefs.current[index] = ref; }}
                style={[
                  styles.otpBox,
                  {
                    color: theme.text,
                    backgroundColor: isDarkMode ? 'rgba(58,58,60,0.8)' : 'rgba(255,255,255,0.6)',
                    borderColor: digit ? theme.accent : (isDarkMode ? theme.border : 'rgba(255,255,255,0.6)'),
                  },
                ]}
                value={digit}
                onChangeText={val => handleOtpChange(val, index)}
                onKeyPress={e => handleKeyPress(e, index)}
                keyboardType="number-pad"
                maxLength={6}
                textAlign="center"
                selectionColor={theme.accent}
                autoFocus={index === 0}
              />
            ))}
          </View>

          {/* Verify button */}
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: isDarkMode ? theme.accent : 'rgba(218,112,214,0.35)' }]}
            onPress={handleVerify}
            activeOpacity={0.8}
            disabled={isVerifying}
          >
            {isVerifying ? (
              <ActivityIndicator color={isDarkMode ? '#fff' : theme.text} />
            ) : (
              <Text style={[styles.primaryBtnText, { color: isDarkMode ? '#fff' : theme.text }]}>
                VERIFY EMAIL
              </Text>
            )}
          </TouchableOpacity>

          {/* Resend */}
          <TouchableOpacity
            style={[styles.resendBtn, glassStyle()]}
            onPress={handleResend}
            activeOpacity={0.7}
            disabled={resending}
          >
            {resending ? (
              <ActivityIndicator color={theme.text} />
            ) : (
              <Text style={[styles.resendText, { color: theme.text }]}>Resend code</Text>
            )}
          </TouchableOpacity>

          {/* Back to login */}
          <TouchableOpacity
            style={styles.backLink}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.7}
          >
            <Text style={[styles.backLinkText, { color: theme.secondaryText }]}>
              Back to log in
            </Text>
          </TouchableOpacity>
        </View>
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
  icon: {
    fontSize: 64,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontFamily: 'BakbakOne-Regular',
    fontWeight: '900',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 4,
  },
  email: {
    fontSize: 16,
    fontWeight: '700',
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
    fontWeight: '700',
  },
  primaryBtn: {
    width: '100%',
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  primaryBtnText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },
  resendBtn: {
    width: '100%',
    height: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  resendText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  backLink: {
    paddingVertical: 8,
  },
  backLinkText: {
    fontSize: 14,
  },
});
