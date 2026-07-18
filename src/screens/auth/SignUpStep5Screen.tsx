// src/screens/auth/SignUpStep5Screen.tsx
import React, { useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  LayoutChangeEvent,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { useRegistration } from '../../contexts/RegistrationContext';
import { useAuth } from '../../contexts/AuthContext';
import StepProgressIndicator from '../../components/StepProgressIndicator';
import { supabase } from '../../lib/supabase';
import { sendEmail, clientWelcomeEmail, providerWelcomeEmail } from '../../services/emailService';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';
import { ThemedBackground } from '../../components/ThemedBackground';

type Props = StackScreenProps<RootStackParamList, 'SignUpStep5'>;

const SERVICE_CATEGORIES = ['HAIR', 'NAILS', 'LASHES', 'BROWS', 'MUA', 'AESTHETICS', 'OTHER'];
const LOCATIONS = ['Birmingham', 'Manchester', 'London'];
const FREQUENCIES = ['Every week', 'Bi-weekly', 'Monthly', '3 months', 'Occasionally'];
const REFERRAL_SOURCES = ['Instagram', 'TikTok', 'Snapchat', 'X', 'Referral', 'Google', 'YouTube', 'Friend', 'Other'];


export default function SignUpStep5Screen({ navigation }: Props) {
  const { isDarkMode, palette: t } = useTheme();
  const { data, updateData, resetData, totalSteps } = useRegistration();
  const { user, activeMode, updateUser, switchMode, upgradeToProvider, addClientProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const servicesY  = useRef(0);
  const locationY  = useRef(0);
  const frequencyY = useRef(0);
  const referralY  = useRef(0);
  const [isLoading,  setIsLoading]  = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const isProvider = data.accountType === 'provider';

  const [selectedInterests, setSelectedInterests] = useState<string[]>(data.serviceInterests);
  const [selectedLocations, setSelectedLocations] = useState<string[]>(data.serviceLocations);
  const [selectedFrequency, setSelectedFrequency] = useState<string>(data.maintenanceFrequency);
  const [selectedReferral,  setSelectedReferral]  = useState<string>(data.referralSource);

  const chipStyle = (isSelected: boolean) => ({
    borderRadius: 100,
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: 18,
    backgroundColor: isSelected ? t.accent : t.surface,
    borderColor: isSelected ? t.accent : t.border,
  });

  const chipTextStyle = (isSelected: boolean) => ({
    fontFamily: 'BakbakOne-Regular' as const,
    fontSize: 13,
    letterSpacing: 0.8,
    color: isSelected ? '#FFFFFF' : t.sub,
  });

  const scrollTo = (yRef: React.MutableRefObject<number>) => {
    scrollRef.current?.scrollTo({ y: Math.max(0, yRef.current - 24), animated: true });
  };

  const toggleInterest = (category: string) => {
    Haptics.selectionAsync().catch(() => {});
    const next = selectedInterests.includes(category)
      ? selectedInterests.filter(c => c !== category)
      : [...selectedInterests, category];
    setSelectedInterests(next);
    if (!selectedInterests.length && next.length === 1) setTimeout(() => scrollTo(locationY), 150);
  };

  const toggleLocation = (location: string) => {
    Haptics.selectionAsync().catch(() => {});
    const next = selectedLocations.includes(location)
      ? selectedLocations.filter(l => l !== location)
      : [...selectedLocations, location];
    setSelectedLocations(next);
    if (!selectedLocations.length && next.length === 1) setTimeout(() => scrollTo(frequencyY), 150);
  };

  const selectFrequency = (freq: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSelectedFrequency(freq);
    setTimeout(() => scrollTo(referralY), 150);
  };

  const selectReferral = (source: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSelectedReferral(source);
  };

  const getFriendlyError = (message: string): string => {
    const msg = message.toLowerCase();
    if (msg.includes('user already registered') || msg.includes('already been registered') || msg.includes('already exists'))
      return 'An account with this email already exists. Try logging in instead.';
    if (msg.includes('invalid email') || msg.includes('unable to validate email'))
      return "That email address doesn't look right. Please check it and try again.";
    if (msg.includes('password') && msg.includes('weak'))
      return "Your password isn't strong enough. Try mixing letters, numbers, and symbols.";
    if (msg.includes('password') && (msg.includes('short') || msg.includes('characters')))
      return 'Your password needs to be at least 8 characters long.';
    if (msg.includes('rate limit') || msg.includes('too many'))
      return 'Too many attempts. Please wait a moment and try again.';
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('connect'))
      return 'No internet connection. Please check your network and try again.';
    return 'Something went wrong. Please try again.';
  };

  const submitSignUp = async () => {
    updateData({
      serviceInterests: selectedInterests,
      serviceLocations: selectedLocations,
      maintenanceFrequency: selectedFrequency,
      referralSource: selectedReferral,
    });
    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});

    if (data.fromClientSwitch) {
      try {
        await addClientProfile({
          dobDay: data.dobDay, dobMonth: data.dobMonth, dobYear: data.dobYear,
          hairType: data.hairType, skinType: data.skinType, skinConcerns: data.skinConcerns,
          styleVibe: data.styleVibe, allergies: data.allergies, treatmentHistory: data.treatmentHistory,
          medicalNotes: data.medicalNotes, photographyConsent: data.photographyConsent,
          serviceInterests: selectedInterests, serviceLocations: selectedLocations,
          maintenanceFrequency: selectedFrequency, referralSource: selectedReferral,
        });
        if (user?.email) {
          const { subject, html } = clientWelcomeEmail({ name: data.name || user.name });
          sendEmail(user.email, subject, html).catch(() => {});
        }
        resetData();
        navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
      } catch (e: any) {
        Alert.alert('Oops!', getFriendlyError(e?.message ?? ''));
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (data.fromProviderSwitch) {
      try {
        await upgradeToProvider(data.businessName.trim(), data.businessEmail.trim(), {
          businessPhone: data.businessPhone, instagram: data.instagram, tiktok: data.tiktok, website: data.website,
        });
        if (user?.email) {
          const { subject, html } = providerWelcomeEmail({ name: data.name || user.name, businessName: data.businessName.trim() });
          sendEmail(user.email, subject, html).catch(() => {});
        }
        resetData();
        navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
      } catch (e: any) {
        Alert.alert('Oops!', getFriendlyError(e?.message ?? ''));
      } finally {
        setIsLoading(false);
      }
      return;
    }

    const personalEmail = data.email.trim();
    const dob = data.accountType === 'user'
      ? `${data.dobYear}-${data.dobMonth.padStart(2, '0')}-${data.dobDay.padStart(2, '0')}`
      : '';

    try {
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: personalEmail,
        password: data.password,
        options: {
          data: {
            name: data.name, phone: data.phone, role: data.accountType, dob,
            business_name: data.businessName || null, business_email: data.businessEmail || null,
            business_phone: data.businessPhone || null, instagram: data.instagram || null,
            tiktok: data.tiktok || null, website: data.website || null,
            hair_type: data.hairType || null, skin_type: data.skinType || null,
            allergies: data.allergies, skin_concerns: data.skinConcerns,
            style_vibe: data.styleVibe || null, treatment_history: data.treatmentHistory,
            medical_notes: data.medicalNotes || null, photography_consent: data.photographyConsent,
            service_interests: selectedInterests, service_locations: selectedLocations,
            maintenance_frequency: selectedFrequency, referral_source: selectedReferral,
          },
        },
      });

      if (signUpError) {
        Alert.alert('Oops!', getFriendlyError(signUpError.message));
        return;
      }

      if ((authData?.user?.identities?.length ?? 0) === 0) {
        Alert.alert(
          'Account exists',
          'An account with this email already exists.',
          [{ text: 'Log in instead', onPress: () => navigation.navigate('Login') }]
        );
        return;
      }

      resetData();
      navigation.navigate('EmailVerification', { email: personalEmail });
    } catch (e: any) {
      Alert.alert('Oops!', getFriendlyError(e?.message ?? ''));
    } finally {
      setIsLoading(false);
    }
  };

  const handleComplete = () => {
    if (data.fromProviderSwitch || data.fromClientSwitch) { submitSignUp(); return; }
    const firstEmptyY = isProvider
      ? (!selectedInterests.length ? servicesY : !selectedLocations.length ? locationY : !selectedReferral ? referralY : null)
      : (!selectedInterests.length ? servicesY : !selectedLocations.length ? locationY : !selectedFrequency ? frequencyY : !selectedReferral ? referralY : null);

    if (firstEmptyY) {
      setShowErrors(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      scrollTo(firstEmptyY);
      return;
    }
    submitSignUp();
  };

  const renderSection = (
    yRef: React.MutableRefObject<number>,
    label: string,
    sub: string,
    items: string[],
    isSelectedFn: (item: string) => boolean,
    onPress: (item: string) => void,
    required: boolean,
  ) => (
    <View onLayout={(e: LayoutChangeEvent) => { yRef.current = e.nativeEvent.layout.y; }}>
      <Text style={[styles.sectionLabel, { color: showErrors && required && !items.find(isSelectedFn) ? '#DC2626' : t.text }]}>
        {label}{showErrors && required && !items.find(isSelectedFn) ? '  — required' : ''}
      </Text>
      <Text style={[styles.sectionSub, { color: t.sub }]}>{sub}</Text>
      <View style={styles.chipsContainer}>
        {items.map(item => (
          <TouchableOpacity key={item} style={chipStyle(isSelectedFn(item))} onPress={() => onPress(item)} activeOpacity={0.6}>
            <Text style={chipTextStyle(isSelectedFn(item))}>{item}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: t.surface, borderColor: t.border }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
          activeOpacity={0.6}
        >
          <Text style={[styles.backIcon, { color: t.text }]}>{'<'}</Text>
        </TouchableOpacity>

        <StepProgressIndicator currentStep={5} totalSteps={totalSteps} />

        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: t.text }]}>Tell me more</Text>
          <Text style={[styles.headerSubtitle, { color: t.sub }]}>
            {isProvider
              ? 'Help us set up your provider profile'
              : "Personalise your experience — skip anything you'd like"}
          </Text>
        </View>

        {isProvider ? (
          <>
            {renderSection(servicesY, 'SERVICES YOU OFFER', 'Select all categories that apply to your business', SERVICE_CATEGORIES, item => selectedInterests.includes(item), toggleInterest, true)}
            {renderSection(locationY, "WHERE YOU'RE BASED", 'Which cities do you work in?', LOCATIONS, item => selectedLocations.includes(item), toggleLocation, true)}
            {renderSection(referralY, 'REFERRAL', 'Where did you hear about us?', REFERRAL_SOURCES, item => selectedReferral === item, selectReferral, true)}
          </>
        ) : (
          <>
            {renderSection(servicesY, 'SERVICES', "Select all services you're interested in", SERVICE_CATEGORIES, item => selectedInterests.includes(item), toggleInterest, true)}
            {renderSection(locationY, 'LOCATION', 'Where are you willing to get services from?', LOCATIONS, item => selectedLocations.includes(item), toggleLocation, true)}
            {renderSection(frequencyY, 'FREQUENCY', 'How often do you get your maintenance done?', FREQUENCIES, item => selectedFrequency === item, selectFrequency, true)}
            {renderSection(referralY, 'REFERRAL', 'Where did you hear about us?', REFERRAL_SOURCES, item => selectedReferral === item, selectReferral, true)}
          </>
        )}

        {/* Actions */}
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={[styles.completeBtn, { backgroundColor: t.accent }]}
            onPress={handleComplete}
            activeOpacity={0.75}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.completeBtnText}>GET STARTED</Text>
            )}
          </TouchableOpacity>

          {!isLoading && (
            <TouchableOpacity style={styles.skipBtn} onPress={submitSignUp} activeOpacity={0.6}>
              <Text style={[styles.skipText, { color: t.sub }]}>Skip for now</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  scroll: { paddingHorizontal: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  backIcon: { fontFamily: 'BakbakOne-Regular', fontSize: 18 },
  header: { marginBottom: 28 },
  headerTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 32, letterSpacing: 1 },
  headerSubtitle: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, marginTop: 8, lineHeight: 20 },
  sectionLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 13, letterSpacing: 2, marginBottom: 4 },
  sectionSub: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, marginBottom: 14, lineHeight: 18 },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 32 },
  actionsSection: { alignItems: 'center' },
  completeBtn: { borderRadius: 100, paddingVertical: 15, alignItems: 'center', width: '100%' },
  completeBtnText: { fontFamily: 'BakbakOne-Regular', fontSize: 15, letterSpacing: 1, color: '#FFFFFF' },
  skipBtn: { marginTop: 16, paddingVertical: 8 },
  skipText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '600' },
});
