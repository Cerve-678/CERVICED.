// src/screens/auth/SignUpStep2Screen.tsx
import React, { useState, useCallback } from 'react';
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
import { useTheme } from '../../contexts/ThemeContext';
import { useRegistration } from '../../contexts/RegistrationContext';
import SignUpHeader from '../../components/SignUpHeader';
import { FieldRow, FormCard, PrimaryButton, ScreenTitle, useFieldInputStyle } from '../../components/signup/FormKit';
import { Ionicons } from '@expo/vector-icons';
import { validateEmail, validatePassword, validatePhone, validateDob } from '../../utils/validation';
import { PasswordRequirements } from '../../components/PasswordRequirements';
import { useAuth } from '../../contexts/AuthContext';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';
import { ThemedBackground } from '../../components/ThemedBackground';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';

type Props = StackScreenProps<RootStackParamList, 'SignUpStep2'>;

interface FormErrors {
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  dob?: string;
}


export default function SignUpStep2Screen({ navigation }: Props) {
  const { isDarkMode, palette: t } = useTheme();
  const { data, updateData, resetData, totalSteps } = useRegistration();
  const { user, hatState } = useAuth();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState(data.name);
  const [email, setEmail] = useState(data.email);
  const [phone, setPhone] = useState(data.phone);
  const [password, setPassword] = useState(data.password);
  const [dobDay, setDobDay] = useState(data.dobDay);
  const [dobMonth, setDobMonth] = useState(data.dobMonth);
  const [dobYear, setDobYear] = useState(data.dobYear);
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showPassword, setShowPassword] = useState(false);

  const isClientSwitch = data.fromClientSwitch;
  const isAppleSignup = data.fromAppleSignup;
  const isProvider = data.accountType === 'provider';

  const validate = useCallback((): FormErrors => {
    const errs: FormErrors = {};
    if (!name.trim()) errs.name = 'Name is required';
    if (!email.trim()) errs.email = 'Email is required';
    else if (!validateEmail(email)) errs.email = 'Enter a valid email';
    const phoneErr = validatePhone(phone);
    if (phoneErr) errs.phone = phoneErr;
    if (!isClientSwitch && !isAppleSignup) {
      if (!password) errs.password = 'Password is required';
      else {
        const e = validatePassword(password);
        if (e) errs.password = e;
      }
    }
    if (isProvider) {
      const dobErr = validateDob(dobDay, dobMonth, dobYear);
      if (dobErr) errs.dob = dobErr;
    }
    return errs;
  }, [name, email, phone, password, isClientSwitch, isProvider, dobDay, dobMonth, dobYear]);

  const markTouched = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    setErrors(validate());
  };

  const handleContinue = () => {
    const errs = validate();
    setErrors(errs);
    setTouched({ name: true, email: true, phone: true, password: true, dob: true });
    if (Object.keys(errs).length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }

    if (user && email.trim().toLowerCase() === user.email.toLowerCase() && !isClientSwitch && !isAppleSignup) {
      const becomingProvider = !hatState.owned.provider;
      const becomingClient = hatState.owned.provider && !hatState.owned.client;

      if (becomingProvider || becomingClient) {
        Alert.alert(
          'Already have an account',
          `${email.trim()} is linked to your existing ${hatState.owned.provider ? 'provider' : 'client'} account.\n\nWould you like to use it to ${becomingProvider ? 'become a provider' : 'set up your client profile'} instead?`,
          [
            {
              text: `Yes, use ${user.name?.split(' ')[0] || 'my'} details`,
              onPress: () => {
                resetData();
                if (becomingProvider) {
                  updateData({ accountType: 'provider', fromProviderSwitch: true, name: user.name, email: user.email, phone: user.phone });
                } else {
                  updateData({ accountType: 'user', fromClientSwitch: true, name: user.name, email: user.email, phone: user.phone });
                }
                navigation.navigate('SignUpStep3');
              },
            },
            { text: 'Use a different email', style: 'cancel' },
          ]
        );
        return;
      }
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    updateData({
      name, email, phone,
      ...(isClientSwitch || isAppleSignup ? {} : { password }),
      ...(isProvider ? { dobDay, dobMonth, dobYear } : {}),
    });
    navigation.navigate('SignUpStep3');
  };

  const inputStyle = useFieldInputStyle();
  const fieldError = (field: keyof FormErrors) => (touched[field] ? errors[field] : undefined);

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />

      <KeyboardDismissView style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <SignUpHeader onBack={() => navigation.goBack()} currentStep={2} totalSteps={totalSteps} />
          <ScreenTitle title="Create your login" subtitle="What you'll log in with." />

          <FormCard>
            <FieldRow label="YOUR NAME" error={fieldError('name')}>
              <TextInput
                style={inputStyle} value={name} onChangeText={setName} onBlur={() => markTouched('name')}
                placeholder="Sarah Johnson" placeholderTextColor={t.sub} textContentType="name"
              />
            </FieldRow>
            <FieldRow label={isProvider ? 'PERSONAL EMAIL' : 'EMAIL'} error={fieldError('email')}>
              <TextInput
                style={inputStyle} value={email} onChangeText={setEmail} onBlur={() => markTouched('email')}
                placeholder="sarah@example.com" placeholderTextColor={t.sub}
                keyboardType="email-address" autoCapitalize="none" textContentType="emailAddress"
                editable={!isAppleSignup}
              />
            </FieldRow>
            <FieldRow label="MOBILE" error={fieldError('phone')}>
              <TextInput
                style={inputStyle} value={phone} onChangeText={setPhone} onBlur={() => markTouched('phone')}
                placeholder="+44 7700 900000" placeholderTextColor={t.sub} keyboardType="phone-pad" textContentType="telephoneNumber"
              />
            </FieldRow>
            {/* Providers only; client DOB is collected on Step 3 */}
            {isProvider && (
              <FieldRow label="DATE OF BIRTH" error={fieldError('dob')}>
                <View style={styles.dobRow}>
                  {[
                    { value: dobDay, set: setDobDay, ph: 'DD', max: 2, width: 34 },
                    { value: dobMonth, set: setDobMonth, ph: 'MM', max: 2, width: 34 },
                    { value: dobYear, set: setDobYear, ph: 'YYYY', max: 4, width: 56 },
                  ].map((f, i) => (
                    <View key={f.ph} style={styles.dobPart}>
                      {i > 0 && <Text style={[styles.dobSlash, { color: t.sub }]}>/</Text>}
                      <TextInput
                        style={[inputStyle, { width: f.width }]}
                        value={f.value}
                        onChangeText={v => { if (v.length <= f.max) f.set(v.replace(/[^0-9]/g, '')); }}
                        onBlur={() => markTouched('dob')}
                        placeholder={f.ph}
                        placeholderTextColor={t.sub}
                        keyboardType="number-pad"
                        maxLength={f.max}
                      />
                    </View>
                  ))}
                </View>
              </FieldRow>
            )}
          </FormCard>

          {!isClientSwitch && !isAppleSignup && (
            <FormCard style={styles.passwordCard}>
              <View style={styles.passwordInner}>
                <FieldRow
                  label="PASSWORD"
                  error={fieldError('password')}
                  right={(
                    <TouchableOpacity
                      onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowPassword(v => !v); }}
                      activeOpacity={0.7}
                      hitSlop={10}
                      accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    >
                      <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={t.sub} />
                    </TouchableOpacity>
                  )}
                >
                  <TextInput
                    style={inputStyle} value={password} onChangeText={setPassword} onBlur={() => markTouched('password')}
                    placeholder="••••••••" placeholderTextColor={t.sub} secureTextEntry={!showPassword} textContentType="newPassword"
                  />
                </FieldRow>
                <View style={styles.rules}>
                  <PasswordRequirements password={password} layout="chips" goodColor={t.accentText} goodFill={t.accentDim} pendingColor={t.sub} />
                </View>
              </View>
            </FormCard>
          )}

          <PrimaryButton label="CONTINUE" onPress={handleContinue} style={styles.continueBtn} />
          {!user && (
            <Text style={[styles.loginLink, { color: t.sub }]}>
              Already have an account?{' '}
              <Text style={{ color: t.accentText, fontWeight: '700' }} onPress={() => navigation.navigate('Login')}>Log in</Text>
            </Text>
          )}
        </ScrollView>
      </KeyboardDismissView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 16, flexGrow: 1 },
  dobRow: { flexDirection: 'row', alignItems: 'center' },
  dobPart: { flexDirection: 'row', alignItems: 'center' },
  dobSlash: { fontFamily: 'Jura-VariableFont_wght', fontSize: 16, fontWeight: '600', marginHorizontal: 6 },
  passwordCard: { marginTop: 12 },
  passwordInner: { paddingBottom: 12 },
  rules: { paddingHorizontal: 16, marginTop: -6 },
  continueBtn: { marginTop: 24 },
  loginLink: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, textAlign: 'center', marginTop: 16 },
});
