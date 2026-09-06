// src/screens/auth/SignUpStep2Screen.tsx
import React, { useState, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import {
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
import { useTheme } from '../../contexts/ThemeContext';
import { useRegistration } from '../../contexts/RegistrationContext';
import StepProgressIndicator from '../../components/StepProgressIndicator';
import { validateEmail, validatePassword, validatePhone, validateDob, getPasswordStrength } from '../../utils/validation';
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
  const { user } = useAuth();
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
  const isProvider = data.accountType === 'provider';

  const validate = useCallback((): FormErrors => {
    const errs: FormErrors = {};
    if (!name.trim()) errs.name = 'Name is required';
    if (!email.trim()) errs.email = 'Email is required';
    else if (!validateEmail(email)) errs.email = 'Enter a valid email';
    const phoneErr = validatePhone(phone);
    if (phoneErr) errs.phone = phoneErr;
    if (!isClientSwitch) {
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

  const renderError = (field: keyof FormErrors) => {
    if (!touched[field] || !errors[field]) return null;
    return <Text style={styles.errorText}>{errors[field]}</Text>;
  };

  const handleContinue = () => {
    const errs = validate();
    setErrors(errs);
    setTouched({ name: true, email: true, phone: true, password: true, dob: true });
    if (Object.keys(errs).length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }

    if (user && email.trim().toLowerCase() === user.email.toLowerCase() && !isClientSwitch) {
      const becomingProvider = user.accountType !== 'provider';
      const becomingClient  = user.accountType === 'provider' && !user.hasClientProfile;

      // Already holds both hats: there is nothing left to create on this email,
      // and falling through would run the cold-signup path against an address
      // Supabase already knows — which surfaced as a dead-end "an account with
      // this email already exists" at the very last step, five screens later,
      // with no mention of the fact that both hats were already set up.
      if (!becomingProvider && !becomingClient) {
        Alert.alert(
          'You already have both',
          `${email.trim()} already has a client account and a provider account. ` +
          'Switch between them any time from your profile — there\'s nothing to set up here.',
          [
            { text: 'Got it', onPress: () => navigation.goBack() },
            { text: 'Use a different email', style: 'cancel' },
          ]
        );
        return;
      }

      Alert.alert(
        'Already have an account',
        `${email.trim()} is linked to your existing ${user.accountType === 'provider' ? 'provider' : 'client'} account.\n\nWould you like to use it to ${becomingProvider ? 'become a provider' : 'set up your client profile'} instead?`,
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

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    updateData({
      name, email, phone,
      ...(isClientSwitch ? {} : { password }),
      ...(isProvider ? { dobDay, dobMonth, dobYear } : {}),
    });
    navigation.navigate('SignUpStep3');
  };

  const strength = getPasswordStrength(password);

  const inputBorder = (field: keyof FormErrors) =>
    touched[field] && errors[field] ? '#DC2626' : t.border;

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

          <StepProgressIndicator currentStep={2} totalSteps={totalSteps} />

          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: t.text }]}>Create Account</Text>
          </View>

          <View style={[styles.formCard, { backgroundColor: t.card, borderColor: t.border }]}>
            {/* Name */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: t.sub }]}>YOUR NAME</Text>
              <View style={[styles.inputWrap, { backgroundColor: t.surface, borderColor: inputBorder('name') }]}>
                <TextInput
                  style={[styles.input, { color: t.text }]}
                  value={name}
                  onChangeText={setName}
                  onBlur={() => markTouched('name')}
                  placeholder="Sarah Johnson"
                  placeholderTextColor={t.sub}
                />
              </View>
              {renderError('name')}
            </View>

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: t.sub }]}>
                {data.accountType === 'provider' ? 'PERSONAL EMAIL' : 'EMAIL'}
              </Text>
              <View style={[styles.inputWrap, { backgroundColor: t.surface, borderColor: inputBorder('email') }]}>
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

            {/* Phone */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: t.sub }]}>PHONE NUMBER</Text>
              <View style={[styles.inputWrap, { backgroundColor: t.surface, borderColor: inputBorder('phone') }]}>
                <TextInput
                  style={[styles.input, { color: t.text }]}
                  value={phone}
                  onChangeText={setPhone}
                  onBlur={() => markTouched('phone')}
                  placeholder="+44 7700 900000"
                  placeholderTextColor={t.sub}
                  keyboardType="phone-pad"
                />
              </View>
              {renderError('phone')}
            </View>

            {/* Date of birth — providers only; client DOB is collected on Step 3 */}
            {isProvider && (
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: t.sub }]}>DATE OF BIRTH</Text>
                <View style={styles.dobRow}>
                  {[
                    { value: dobDay, set: setDobDay, ph: 'DD', max: 2, flex: 1 },
                    { value: dobMonth, set: setDobMonth, ph: 'MM', max: 2, flex: 1 },
                    { value: dobYear, set: setDobYear, ph: 'YYYY', max: 4, flex: 1.5 },
                  ].map((f, i) => (
                    <View key={f.ph} style={{ flex: f.flex, flexDirection: 'row', alignItems: 'center' }}>
                      {i > 0 && <Text style={[styles.dobSlash, { color: t.sub }]}>/</Text>}
                      <View style={[styles.inputWrap, styles.dobField, { backgroundColor: t.surface, borderColor: inputBorder('dob') }]}>
                        <TextInput
                          style={[styles.input, { color: t.text, textAlign: 'center' }]}
                          value={f.value}
                          onChangeText={v => { if (v.length <= f.max) f.set(v.replace(/[^0-9]/g, '')); }}
                          onBlur={() => markTouched('dob')}
                          placeholder={f.ph}
                          placeholderTextColor={t.sub}
                          keyboardType="number-pad"
                          maxLength={f.max}
                        />
                      </View>
                    </View>
                  ))}
                </View>
                {renderError('dob')}
              </View>
            )}

            {/* Password */}
            {!isClientSwitch && (
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: t.sub }]}>PASSWORD</Text>
                <View style={[styles.inputWrap, styles.inputWrapRow, { backgroundColor: t.surface, borderColor: inputBorder('password') }]}>
                  <TextInput
                    style={[styles.input, styles.inputWithEye, { color: t.text }]}
                    value={password}
                    onChangeText={setPassword}
                    onBlur={() => markTouched('password')}
                    placeholder="••••••••"
                    placeholderTextColor={t.sub}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowPassword(v => !v); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.eyeText, { color: t.sub }]}>{showPassword ? 'Hide' : 'Show'}</Text>
                  </TouchableOpacity>
                </View>
                {renderError('password')}
                {password.length > 0 && (
                  <>
                    <View style={styles.strengthRow}>
                      <View style={[styles.strengthTrack, { backgroundColor: t.border }]}>
                        <View style={[styles.strengthFill, { width: strength.width as any, backgroundColor: strength.color }]} />
                      </View>
                      <Text style={[styles.strengthText, { color: t.sub }]}>{strength.label}</Text>
                    </View>
                    <PasswordRequirements password={password} goodColor={t.accent} pendingColor={t.sub} />
                  </>
                )}
              </View>
            )}

            {/* Continue */}
            <TouchableOpacity
              style={[styles.continueBtn, { backgroundColor: t.accent }]}
              onPress={handleContinue}
              activeOpacity={0.75}
            >
              <Text style={styles.continueBtnText}>CONTINUE</Text>
            </TouchableOpacity>
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
  backIcon: { fontFamily: 'BakbakOne-Regular', fontSize: 18 },
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
  inputWrapRow: { flexDirection: 'row', alignItems: 'center' },
  inputWithEye: { flex: 1, paddingRight: 8 },
  eyeText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    fontWeight: '600',
  },
  dobRow: { flexDirection: 'row', alignItems: 'center' },
  dobField: { flex: 1, paddingHorizontal: 8 },
  dobSlash: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 16,
    marginHorizontal: 6,
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
    color: '#DC2626',
    marginTop: 5,
    marginLeft: 2,
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
  },
  continueBtnText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    letterSpacing: 1,
    color: '#FFFFFF',
  },
});
