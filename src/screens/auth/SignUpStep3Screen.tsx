// src/screens/auth/SignUpStep3Screen.tsx
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
import { validateEmail, validateDob } from '../../utils/validation';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';

type Props = StackScreenProps<RootStackParamList, 'SignUpStep3'>;

interface FormErrors {
  dob?: string;
  businessName?: string;
  businessEmail?: string;
}

export default function SignUpStep3Screen({ navigation }: Props) {
  const { theme, isDarkMode } = useTheme();
  const { data, updateData, totalSteps } = useRegistration();
  const insets = useSafeAreaInsets();

  // User fields
  const [dobDay, setDobDay] = useState(data.dobDay);
  const [dobMonth, setDobMonth] = useState(data.dobMonth);
  const [dobYear, setDobYear] = useState(data.dobYear);

  // Provider fields
  const [businessName, setBusinessName] = useState(data.businessName);
  const [businessEmail, setBusinessEmail] = useState(data.businessEmail);

  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const isUser = data.accountType === 'user';

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
    return <Text style={[styles.errorText, { color: isDarkMode ? '#FF453A' : '#FF3B30' }]}>{errors[field]}</Text>;
  };

  const handleContinue = () => {
    const errs = validate();
    setErrors(errs);

    if (isUser) {
      setTouched({ dob: true });
    } else {
      setTouched({ businessName: true, businessEmail: true });
    }

    if (Object.keys(errs).length > 0) return;

    if (isUser) {
      updateData({ dobDay, dobMonth, dobYear });
    } else {
      updateData({ businessName, businessEmail });
    }
    navigation.navigate('SignUpStep4');
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

          {/* Progress */}
          <StepProgressIndicator currentStep={3} totalSteps={totalSteps} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>
              {isUser ? 'Personal Details' : 'Business Details'}
            </Text>
          </View>

          {/* Form Card */}
          <View style={[styles.formCard, glassStyle()]}>
            {isUser ? (
              /* User: DOB */
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.text }]}>DATE OF BIRTH</Text>
                <View style={styles.dobRow}>
                  {[
                    { value: dobDay, set: setDobDay, ph: 'DD', max: 2, flex: 1 },
                    { value: dobMonth, set: setDobMonth, ph: 'MM', max: 2, flex: 1 },
                    { value: dobYear, set: setDobYear, ph: 'YYYY', max: 4, flex: 1.5 },
                  ].map((f, i) => (
                    <View key={f.ph} style={{ flex: f.flex, flexDirection: 'row', alignItems: 'center' }}>
                      {i > 0 && (
                        <Text style={[styles.dobSlash, { color: theme.secondaryText }]}>/</Text>
                      )}
                      <View style={[styles.inputWrap, styles.dobField, inputGlass(!!touched['dob'] && !!errors.dob)]}>
                        <TextInput
                          style={[styles.input, { color: theme.text, textAlign: 'center' }]}
                          value={f.value}
                          onChangeText={t => { if (t.length <= f.max) f.set(t.replace(/[^0-9]/g, '')); }}
                          onBlur={() => markTouched('dob')}
                          placeholder={f.ph}
                          placeholderTextColor={theme.secondaryText}
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
              /* Provider: Business fields */
              <>
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: theme.text }]}>BUSINESS NAME</Text>
                  <View style={[styles.inputWrap, inputGlass(!!touched['businessName'] && !!errors.businessName)]}>
                    <TextInput
                      style={[styles.input, { color: theme.text }]}
                      value={businessName}
                      onChangeText={setBusinessName}
                      onBlur={() => markTouched('businessName')}
                      placeholder="Glow Studio"
                      placeholderTextColor={theme.secondaryText}
                    />
                  </View>
                  {renderError('businessName')}
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: theme.text }]}>BUSINESS EMAIL</Text>
                  <View style={[styles.inputWrap, inputGlass(!!touched['businessEmail'] && !!errors.businessEmail)]}>
                    <TextInput
                      style={[styles.input, { color: theme.text }]}
                      value={businessEmail}
                      onChangeText={setBusinessEmail}
                      onBlur={() => markTouched('businessEmail')}
                      placeholder="hello@glowstudio.com"
                      placeholderTextColor={theme.secondaryText}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                  {renderError('businessEmail')}
                </View>
              </>
            )}

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
  dobRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dobField: {
    flex: 1,
    paddingHorizontal: 8,
  },
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
    borderWidth: 1.5,
    borderColor: 'rgba(218,112,214,0.4)',
  },
  continueBtnText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    letterSpacing: 1,
  },
});
