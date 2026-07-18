// src/screens/auth/SignUpStep3Screen.tsx
import React, { useState, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
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
import StepProgressIndicator from '../../components/StepProgressIndicator';
import { validateEmail, validateDob } from '../../utils/validation';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';
import { ThemedBackground } from '../../components/ThemedBackground';

type Props = StackScreenProps<RootStackParamList, 'SignUpStep3'>;

interface FormErrors {
  dob?: string;
  businessName?: string;
  businessEmail?: string;
}


export default function SignUpStep3Screen({ navigation }: Props) {
  const { isDarkMode, palette: t } = useTheme();
  const { data, updateData, totalSteps } = useRegistration();
  const insets = useSafeAreaInsets();

  const [dobDay, setDobDay] = useState(data.dobDay);
  const [dobMonth, setDobMonth] = useState(data.dobMonth);
  const [dobYear, setDobYear] = useState(data.dobYear);

  const [businessName, setBusinessName] = useState(data.businessName);
  const [businessEmail, setBusinessEmail] = useState(data.businessEmail);
  const [businessPhone, setBusinessPhone] = useState(data.businessPhone);
  const [instagram, setInstagram] = useState(data.instagram);
  const [tiktok, setTiktok] = useState(data.tiktok);
  const [website, setWebsite] = useState(data.website);

  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const isUser = data.accountType === 'user';

  const validate = useCallback((): FormErrors => {
    const errs: FormErrors = {};
    if (isUser) {
      const dobErr = validateDob(dobDay, dobMonth, dobYear);
      if (dobErr) errs.dob = dobErr;
    } else {
      if (!businessName.trim()) errs.businessName = 'Business name is required';
      if (!businessEmail.trim()) errs.businessEmail = 'Business email is required';
      else if (!validateEmail(businessEmail)) errs.businessEmail = 'Enter a valid email';
    }
    return errs;
  }, [isUser, dobDay, dobMonth, dobYear, businessName, businessEmail]);

  const markTouched = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    setErrors(validate());
  };

  const renderError = (field: keyof FormErrors) => {
    if (!touched[field] || !errors[field]) return null;
    return <Text style={styles.errorText}>{errors[field]}</Text>;
  };

  const inputBorder = (field: keyof FormErrors) =>
    touched[field] && errors[field] ? '#DC2626' : t.border;

  const handleContinue = () => {
    const errs = validate();
    setErrors(errs);

    if (isUser) setTouched({ dob: true });
    else setTouched({ businessName: true, businessEmail: true });

    if (Object.keys(errs).length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (isUser) {
      updateData({ dobDay, dobMonth, dobYear });
    } else {
      updateData({
        businessName,
        businessEmail,
        businessPhone: businessPhone.trim(),
        instagram: instagram.replace(/^@/, '').trim(),
        tiktok: tiktok.replace(/^@/, '').trim(),
        website: website.trim(),
      });
    }
    navigation.navigate('SignUpStep4');
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

          <StepProgressIndicator currentStep={3} totalSteps={totalSteps} />

          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: t.text }]}>
              {isUser ? 'Personal Details' : 'Business Details'}
            </Text>
          </View>

          <View style={[styles.formCard, { backgroundColor: t.card, borderColor: t.border }]}>
            {isUser ? (
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: t.sub }]}>DATE OF BIRTH</Text>
                <View style={styles.dobRow}>
                  {[
                    { value: dobDay, set: setDobDay, ph: 'DD', max: 2, flex: 1 },
                    { value: dobMonth, set: setDobMonth, ph: 'MM', max: 2, flex: 1 },
                    { value: dobYear, set: setDobYear, ph: 'YYYY', max: 4, flex: 1.5 },
                  ].map((f, i) => (
                    <View key={f.ph} style={{ flex: f.flex, flexDirection: 'row', alignItems: 'center' }}>
                      {i > 0 && (
                        <Text style={[styles.dobSlash, { color: t.sub }]}>/</Text>
                      )}
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
            ) : (
              <>
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: t.sub }]}>BUSINESS NAME</Text>
                  <View style={[styles.inputWrap, { backgroundColor: t.surface, borderColor: inputBorder('businessName') }]}>
                    <TextInput
                      style={[styles.input, { color: t.text }]}
                      value={businessName}
                      onChangeText={setBusinessName}
                      onBlur={() => markTouched('businessName')}
                      placeholder="Glow Studio"
                      placeholderTextColor={t.sub}
                    />
                  </View>
                  {renderError('businessName')}
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: t.sub }]}>BUSINESS EMAIL</Text>
                  <View style={[styles.inputWrap, { backgroundColor: t.surface, borderColor: inputBorder('businessEmail') }]}>
                    <TextInput
                      style={[styles.input, { color: t.text }]}
                      value={businessEmail}
                      onChangeText={setBusinessEmail}
                      onBlur={() => markTouched('businessEmail')}
                      placeholder="hello@glowstudio.com"
                      placeholderTextColor={t.sub}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                  {renderError('businessEmail')}
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: t.sub }]}>
                    BUSINESS PHONE{' '}
                    <Text style={[styles.optionalTag, { color: t.sub }]}>optional</Text>
                  </Text>
                  <View style={[styles.inputWrap, { backgroundColor: t.surface, borderColor: t.border }]}>
                    <TextInput
                      style={[styles.input, { color: t.text }]}
                      value={businessPhone}
                      onChangeText={setBusinessPhone}
                      placeholder="+44 7700 900000"
                      placeholderTextColor={t.sub}
                      keyboardType="phone-pad"
                    />
                  </View>
                </View>

                <View style={[styles.sectionDivider, { borderColor: t.border }]}>
                  <Text style={[styles.sectionDividerText, { color: t.sub }]}>SOCIAL & ONLINE PRESENCE</Text>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: t.sub }]}>
                    INSTAGRAM <Text style={[styles.optionalTag, { color: t.sub }]}>optional</Text>
                  </Text>
                  <View style={[styles.prefixWrap, { backgroundColor: t.surface, borderColor: t.border }]}>
                    <Text style={[styles.prefix, { color: t.sub }]}>@</Text>
                    <TextInput
                      style={[styles.input, { color: t.text, flex: 1 }]}
                      value={instagram}
                      onChangeText={v => setInstagram(v.replace(/^@/, ''))}
                      placeholder="glowstudio"
                      placeholderTextColor={t.sub}
                      autoCapitalize="none"
                    />
                  </View>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: t.sub }]}>
                    TIKTOK <Text style={[styles.optionalTag, { color: t.sub }]}>optional</Text>
                  </Text>
                  <View style={[styles.prefixWrap, { backgroundColor: t.surface, borderColor: t.border }]}>
                    <Text style={[styles.prefix, { color: t.sub }]}>@</Text>
                    <TextInput
                      style={[styles.input, { color: t.text, flex: 1 }]}
                      value={tiktok}
                      onChangeText={v => setTiktok(v.replace(/^@/, ''))}
                      placeholder="glowstudio"
                      placeholderTextColor={t.sub}
                      autoCapitalize="none"
                    />
                  </View>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: t.sub }]}>
                    WEBSITE <Text style={[styles.optionalTag, { color: t.sub }]}>optional</Text>
                  </Text>
                  <View style={[styles.inputWrap, { backgroundColor: t.surface, borderColor: t.border }]}>
                    <TextInput
                      style={[styles.input, { color: t.text }]}
                      value={website}
                      onChangeText={setWebsite}
                      placeholder="www.glowstudio.com"
                      placeholderTextColor={t.sub}
                      keyboardType="url"
                      autoCapitalize="none"
                    />
                  </View>
                </View>
              </>
            )}

            <TouchableOpacity
              style={[styles.continueBtn, { backgroundColor: t.accent }]}
              onPress={handleContinue}
              activeOpacity={0.75}
            >
              <Text style={styles.continueBtnText}>CONTINUE</Text>
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
  dobRow: { flexDirection: 'row', alignItems: 'center' },
  dobField: { flex: 1, paddingHorizontal: 8 },
  dobSlash: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 16,
    marginHorizontal: 6,
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
  optionalTag: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 10,
    fontWeight: '400',
    letterSpacing: 0.3,
    textTransform: 'lowercase',
  },
  sectionDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
    marginBottom: 16,
    paddingTop: 14,
  },
  sectionDividerText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 11,
    letterSpacing: 1.5,
  },
  prefixWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'android' ? 10 : 13,
  },
  prefix: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 15,
    marginRight: 4,
    padding: 0,
  },
});
