// src/screens/auth/LoginScreen.tsx
import React, { useState, useCallback } from 'react';
import {
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
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import { validateEmail } from '../../utils/validation';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = StackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { login } = useAuth();
  const { theme, isDarkMode } = useTheme();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const glassStyle = (active?: boolean) => ({
    backgroundColor: active
      ? (isDarkMode ? 'rgba(58, 58, 60, 0.8)' : 'rgba(255, 255, 255, 0.35)')
      : (isDarkMode ? 'rgba(58, 58, 60, 0.6)' : 'rgba(255, 255, 255, 0.15)'),
    borderTopColor: isDarkMode ? theme.border : (active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.7)'),
    borderLeftColor: isDarkMode ? theme.border : (active ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.5)'),
    borderRightColor: isDarkMode ? theme.border : 'rgba(255,255,255,0.2)',
    borderBottomColor: isDarkMode ? theme.border : 'rgba(255,255,255,0.2)',
  });

  const inputGlass = (hasError: boolean) => ({
    backgroundColor: isDarkMode ? 'rgba(58, 58, 60, 0.6)' : 'rgba(255, 255, 255, 0.12)',
    borderTopColor: hasError ? 'rgba(255,59,48,0.6)' : (isDarkMode ? theme.border : 'rgba(255,255,255,0.8)'),
    borderLeftColor: hasError ? 'rgba(255,59,48,0.4)' : (isDarkMode ? theme.border : 'rgba(255,255,255,0.6)'),
    borderRightColor: hasError ? 'rgba(255,59,48,0.3)' : (isDarkMode ? theme.border : 'rgba(255,255,255,0.2)'),
    borderBottomColor: hasError ? 'rgba(255,59,48,0.3)' : (isDarkMode ? theme.border : 'rgba(255,255,255,0.2)'),
  });

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
    return <Text style={[styles.errorText, { color: isDarkMode ? '#FF453A' : '#FF3B30' }]}>{errors[field]}</Text>;
  };

  const handleLogin = () => {
    const errs = validate();
    setErrors(errs);
    setTouched({ email: true, password: true });
    if (Object.keys(errs).length > 0) return;

    login({
      name: email.split('@')[0] ?? '',
      email,
      phone: '',
      dob: '',
      accountType: 'user',
      loginMethod: 'email',
    });
  };

  const handleSocialLogin = (provider: string) => {
    login({
      name: `${provider} User`,
      email: `${provider.toLowerCase()}@user.com`,
      phone: '',
      dob: '',
      accountType: 'user',
      loginMethod: provider.toLowerCase(),
    });
  };

  return (
    <ThemedBackground style={styles.bg}>
      <StatusBar barStyle={theme.statusBar} translucent />

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
            style={[styles.backBtn, glassStyle()]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Text style={[styles.backIcon, { color: theme.text }]}>{'<'}</Text>
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Welcome Back</Text>
          </View>

          {/* Form Card */}
          <View style={[styles.formCard, glassStyle()]}>
            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>EMAIL</Text>
              <View style={[styles.inputWrap, inputGlass(!!touched['email'] && !!errors.email)]}>
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  value={email}
                  onChangeText={setEmail}
                  onBlur={() => markTouched('email')}
                  placeholder="sarah@example.com"
                  placeholderTextColor={theme.secondaryText}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              {renderError('email')}
            </View>

            {/* Password */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>PASSWORD</Text>
              <View style={[styles.inputWrap, inputGlass(!!touched['password'] && !!errors.password)]}>
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  value={password}
                  onChangeText={setPassword}
                  onBlur={() => markTouched('password')}
                  placeholder="••••••••"
                  placeholderTextColor={theme.secondaryText}
                  secureTextEntry
                />
              </View>
              {renderError('password')}
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: isDarkMode ? theme.accent : 'rgba(218,112,214,0.35)' }]}
              onPress={handleLogin}
              activeOpacity={0.8}
            >
              <Text style={[styles.submitText, { color: isDarkMode ? '#fff' : theme.text }]}>
                LOG IN
              </Text>
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={[styles.dividerLine, { backgroundColor: isDarkMode ? theme.border : 'rgba(255,255,255,0.4)' }]} />
              <Text style={[styles.dividerLabel, { color: theme.secondaryText }]}>OR</Text>
              <View style={[styles.dividerLine, { backgroundColor: isDarkMode ? theme.border : 'rgba(255,255,255,0.4)' }]} />
            </View>

            {/* Social */}
            <View style={styles.socialRow}>
              {['Instagram', 'Google', 'Apple'].map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.socialBtn, glassStyle()]}
                  onPress={() => handleSocialLogin(p)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.socialLabel, { color: theme.text }]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Sign Up link */}
            <View style={styles.signUpRow}>
              <Text style={[styles.signUpText, { color: theme.secondaryText }]}>
                Don't have an account?{' '}
              </Text>
              <TouchableOpacity onPress={() => navigation.navigate('SignUpStep1')}>
                <Text style={[styles.signUpLink, { color: theme.accent }]}>Sign Up</Text>
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
    borderWidth: 1.5,
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
    fontWeight: '900',
    letterSpacing: 1,
  },
  formCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 20,
    overflow: 'hidden',
  },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
    letterSpacing: 1,
    marginBottom: 8,
  },
  inputWrap: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'android' ? 10 : 13,
    overflow: 'hidden',
  },
  input: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 15,
    letterSpacing: 0.5,
    padding: 0,
  },
  errorText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    marginTop: 6,
    marginLeft: 4,
  },
  submitBtn: {
    borderRadius: 100,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(218,112,214,0.4)',
  },
  submitText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    letterSpacing: 1,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerLabel: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    letterSpacing: 2,
    marginHorizontal: 16,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 10,
  },
  socialBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 13,
    alignItems: 'center',
    overflow: 'hidden',
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
