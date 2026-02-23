// src/screens/auth/SignUpStep2Screen.tsx
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
import { useTheme } from '../../contexts/ThemeContext';
import { useRegistration } from '../../contexts/RegistrationContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import StepProgressIndicator from '../../components/StepProgressIndicator';
import { validateEmail, validatePassword, validatePhone, getPasswordStrength } from '../../utils/validation';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = StackScreenProps<RootStackParamList, 'SignUpStep2'>;

interface FormErrors {
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
}

export default function SignUpStep2Screen({ navigation }: Props) {
  const { theme, isDarkMode } = useTheme();
  const { data, updateData, totalSteps } = useRegistration();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState(data.name);
  const [email, setEmail] = useState(data.email);
  const [phone, setPhone] = useState(data.phone);
  const [password, setPassword] = useState(data.password);
  const [errors, setErrors] = useState<FormErrors>({});
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

  const validate = useCallback((): FormErrors => {
    const errs: FormErrors = {};
    if (!name.trim()) errs.name = 'Name is required';
    if (!email.trim()) errs.email = 'Email is required';
    else if (!validateEmail(email)) errs.email = 'Enter a valid email';
    const phoneErr = validatePhone(phone);
    if (phoneErr) errs.phone = phoneErr;
    if (!password) errs.password = 'Password is required';
    else {
      const e = validatePassword(password);
      if (e) errs.password = e;
    }
    return errs;
  }, [name, email, phone, password]);

  const markTouched = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    setErrors(validate());
  };

  const renderError = (field: keyof FormErrors) => {
    if (!touched[field] || !errors[field]) return null;
    return <Text style={[styles.errorText, { color: isDarkMode ? '#FF453A' : '#FF3B30' }]}>{errors[field]}</Text>;
  };

  const handleContinue = () => {
    const errs = validate();
    setErrors(errs);
    setTouched({ name: true, email: true, phone: true, password: true });
    if (Object.keys(errs).length > 0) return;

    updateData({ name, email, phone, password });
    navigation.navigate('SignUpStep3');
  };

  const strength = getPasswordStrength(password);

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

          {/* Progress */}
          <StepProgressIndicator currentStep={2} totalSteps={totalSteps} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Create Account</Text>
          </View>

          {/* Form Card */}
          <View style={[styles.formCard, glassStyle()]}>
            {/* Name */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>NAME</Text>
              <View style={[styles.inputWrap, inputGlass(!!touched['name'] && !!errors.name)]}>
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  value={name}
                  onChangeText={setName}
                  onBlur={() => markTouched('name')}
                  placeholder="Sarah Johnson"
                  placeholderTextColor={theme.secondaryText}
                />
              </View>
              {renderError('name')}
            </View>

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

            {/* Phone */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>PHONE NUMBER</Text>
              <View style={[styles.inputWrap, inputGlass(!!touched['phone'] && !!errors.phone)]}>
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  value={phone}
                  onChangeText={setPhone}
                  onBlur={() => markTouched('phone')}
                  placeholder="+44 7700 900000"
                  placeholderTextColor={theme.secondaryText}
                  keyboardType="phone-pad"
                />
              </View>
              {renderError('phone')}
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
              {password.length > 0 && (
                <View style={styles.strengthRow}>
                  <View style={[styles.strengthTrack, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.25)' }]}>
                    <View style={[styles.strengthFill, { width: strength.width as any, backgroundColor: strength.color }]} />
                  </View>
                  <Text style={[styles.strengthText, { color: theme.secondaryText }]}>{strength.label}</Text>
                </View>
              )}
            </View>

            {/* Continue */}
            <TouchableOpacity
              style={[styles.continueBtn, { backgroundColor: isDarkMode ? theme.accent : 'rgba(218,112,214,0.35)' }]}
              onPress={handleContinue}
              activeOpacity={0.8}
            >
              <Text style={[styles.continueBtnText, { color: isDarkMode ? '#fff' : theme.text }]}>
                CONTINUE
              </Text>
            </TouchableOpacity>
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
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 10,
  },
  strengthTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  strengthFill: {
    height: '100%',
    borderRadius: 2,
  },
  strengthText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    fontWeight: '600',
  },
  continueBtn: {
    borderRadius: 100,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(218,112,214,0.4)',
  },
  continueBtnText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    letterSpacing: 1,
  },
});
