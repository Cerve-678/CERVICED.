// src/screens/auth/SignUpStep3Screen.tsx
import React, { useState, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import {
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
import { FieldRow, FormCard, PrimaryButton, ScreenTitle, SectionLabel, useFieldInputStyle } from '../../components/signup/FormKit';
import { Ionicons } from '@expo/vector-icons';
import { validateEmail, validateDob } from '../../utils/validation';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';
import { ThemedBackground } from '../../components/ThemedBackground';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';

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
  // The client→provider upgrade enters the flow at this step, skipping Step 2
  // where a provider normally gives their date of birth — so it has to be asked
  // for here. Without it the app creates providers with no DOB at all, and
  // AuthContext (which reads `dob != null` as the provider's client-hat marker)
  // drops their client hat on the next launch.
  const needsDob = isUser || data.fromProviderSwitch;

  const validate = useCallback((): FormErrors => {
    const errs: FormErrors = {};
    if (needsDob) {
      const dobErr = validateDob(dobDay, dobMonth, dobYear);
      if (dobErr) errs.dob = dobErr;
    }
    if (!isUser) {
      if (!businessName.trim()) errs.businessName = 'Business name is required';
      if (!businessEmail.trim()) errs.businessEmail = 'Business email is required';
      else if (!validateEmail(businessEmail)) errs.businessEmail = 'Enter a valid email';
    }
    return errs;
  }, [isUser, needsDob, dobDay, dobMonth, dobYear, businessName, businessEmail]);

  const markTouched = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    setErrors(validate());
  };

  const handleContinue = () => {
    const errs = validate();
    setErrors(errs);

    setTouched({
      ...(needsDob ? { dob: true } : {}),
      ...(isUser ? {} : { businessName: true, businessEmail: true }),
    });

    if (Object.keys(errs).length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (needsDob) {
      updateData({ dobDay, dobMonth, dobYear });
    }
    if (!isUser) {
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

  const inputStyle = useFieldInputStyle();
  const fieldError = (field: keyof FormErrors) => (touched[field] ? errors[field] : undefined);

  const dobRow = (
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
  );

  const handleRow = (label: string, value: string, set: (v: string) => void) => (
    <FieldRow label={label}>
      <View style={styles.prefixRow}>
        <Text style={[inputStyle, { color: t.sub }]}>@</Text>
        <TextInput
          style={[inputStyle, styles.flex]} value={value} onChangeText={set}
          placeholder="glowstudio" placeholderTextColor={t.sub} autoCapitalize="none" autoCorrect={false}
        />
      </View>
    </FieldRow>
  );

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />

      <KeyboardDismissView style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <SignUpHeader onBack={() => navigation.goBack()} currentStep={3} totalSteps={totalSteps} />

          {isUser ? (
            <>
              <ScreenTitle title="About you" subtitle="So we can show you services that suit you." />
              <FormCard>{dobRow}</FormCard>
            </>
          ) : (
            <>
              <ScreenTitle title="Your business" subtitle="What clients see on your profile." />
              {needsDob && <FormCard style={styles.cardGap}>{dobRow}</FormCard>}
              <FormCard>
                <FieldRow label="BUSINESS NAME" error={fieldError('businessName')}>
                  <TextInput
                    style={inputStyle} value={businessName} onChangeText={setBusinessName}
                    onBlur={() => markTouched('businessName')} placeholder="Glow Studio" placeholderTextColor={t.sub}
                  />
                </FieldRow>
                <FieldRow label="BUSINESS EMAIL" error={fieldError('businessEmail')}>
                  <TextInput
                    style={inputStyle} value={businessEmail} onChangeText={setBusinessEmail}
                    onBlur={() => markTouched('businessEmail')} placeholder="hello@glowstudio.com" placeholderTextColor={t.sub}
                    keyboardType="email-address" autoCapitalize="none"
                  />
                </FieldRow>
                <FieldRow label="BUSINESS PHONE">
                  <TextInput
                    style={inputStyle} value={businessPhone} onChangeText={setBusinessPhone}
                    placeholder="+44 7700 900000 (optional)" placeholderTextColor={t.sub} keyboardType="phone-pad"
                  />
                </FieldRow>
              </FormCard>

              <View style={styles.sectionGap}>
                <SectionLabel title="ONLINE" hint="Optional" />
              </View>
              <FormCard>
                {handleRow('INSTAGRAM', instagram, setInstagram)}
                {handleRow('TIKTOK', tiktok, setTiktok)}
                <FieldRow label="WEBSITE">
                  <TextInput
                    style={inputStyle} value={website} onChangeText={setWebsite}
                    placeholder="glowstudio.com" placeholderTextColor={t.sub} autoCapitalize="none" keyboardType="url"
                  />
                </FieldRow>
              </FormCard>

              {data.externalBookingUrl !== '' && (
                <View style={[styles.bookingRow, { backgroundColor: t.accentDim }]}>
                  <Ionicons name="link-outline" size={20} color={t.accentText} />
                  <View style={styles.flex}>
                    <Text style={[styles.bookingLabel, { color: t.accentText }]}>CLIENTS BOOK VIA</Text>
                    <Text style={[styles.bookingUrl, { color: t.text }]} numberOfLines={1}>
                      {data.externalBookingUrl.replace(/^https?:\/\//, '')}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => navigation.navigate('SignUpStep1')} hitSlop={10} activeOpacity={0.6}>
                    <Text style={[styles.bookingChange, { color: t.accentText }]}>Change</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}

          <PrimaryButton label="CONTINUE" onPress={handleContinue} style={styles.continueBtn} />
        </ScrollView>
      </KeyboardDismissView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 16, flexGrow: 1 },
  cardGap: { marginBottom: 12 },
  sectionGap: { marginTop: 22 },
  dobRow: { flexDirection: 'row', alignItems: 'center' },
  dobPart: { flexDirection: 'row', alignItems: 'center' },
  dobSlash: { fontFamily: 'Jura-VariableFont_wght', fontSize: 16, fontWeight: '600', marginHorizontal: 6 },
  prefixRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  bookingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 14, marginTop: 12 },
  bookingLabel: { fontFamily: 'Jura-VariableFont_wght', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  bookingUrl: { fontFamily: 'Jura-VariableFont_wght', fontSize: 15, fontWeight: '700', marginTop: 2 },
  bookingChange: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '700' },
  continueBtn: { marginTop: 24 },
});
