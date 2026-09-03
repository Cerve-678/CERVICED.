// src/screens/auth/SignUpStep5Screen.tsx
import React, { useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  LayoutChangeEvent,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { useRegistration } from '../../contexts/RegistrationContext';
import { useAuth } from '../../contexts/AuthContext';
import StepProgressIndicator from '../../components/StepProgressIndicator';
import { invokeSendAccountEmail, signUpWithEmail } from '../../services/databaseService';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';
import { ThemedBackground } from '../../components/ThemedBackground';
import { LANGUAGE_OPTS, ACCESSIBILITY_OPTS } from '../../features/business-details/options';
import { recognizeLanguage } from '../../data/languages';
import { toUserMessage } from '../../utils/userFacingError';
import { logger } from '../../utils/logger';

type Props = StackScreenProps<RootStackParamList, 'SignUpStep5'>;

const SERVICE_CATEGORIES = ['HAIR', 'NAILS', 'LASHES', 'BROWS', 'MUA', 'AESTHETICS', 'OTHER'];
const LOCATIONS = ['Birmingham', 'Manchester', 'London'];
const FREQUENCIES = ['Every week', 'Bi-weekly', 'Monthly', '3 months', 'Occasionally'];
const REFERRAL_SOURCES = ['Instagram', 'TikTok', 'Snapchat', 'X', 'Referral', 'Google', 'YouTube', 'Friend', 'Other'];

// Provider "Tell me more" — more descriptive/personal detail than Step 4's
// operational logistics. Specialties mirror InfoRegScreen's per-service
// techniqueTags vocabulary so signup's answer is a familiar starting point,
// not a competing taxonomy.
// Same list AboutYouScreen edits post-signup (ACCESSIBILITY_OPTS) — this used
// to be a hand-duplicated local list with different wording/items and a
// 'None of these' sentinel the shared vocabulary doesn't have, which meant a
// value picked here could show as a garbled/unmatched chip later. Selecting
// nothing already means nothing, same as every other multi-select in this
// screen, so no explicit opt-out option is needed.
const ACCESSIBILITY_OPTIONS = ACCESSIBILITY_OPTS;
// Same list AboutYouScreen edits post-signup (LANGUAGE_OPTS), plus 'Other' —
// keeping one source of truth avoids the earlier BSL-missing desync bug
// (see options.ts) where a language chosen here had no chip later.
const LANGUAGE_OPTIONS = [...LANGUAGE_OPTS, 'Other'];

// Specialty chip options, tailored per service category selected in Step 4
// (data.serviceInterests) — a provider who picked NAILS sees nail-relevant
// options, not hair techniques. 'Other' always trails each list and reveals
// a free-text input rather than being just another chip (see
// specialtiesOther state below).
const SPECIALTY_OPTIONS_BY_CATEGORY: Record<string, string[]> = {
  HAIR: ['Balayage', 'Colour correction', 'Curly/coily hair', 'Braids & extensions', 'Bridal styling', 'Other'],
  NAILS: ['Gel', 'Acrylics', 'Nail art', 'BIAB', 'Sculpted nails', 'Other'],
  LASHES: ['Classic', 'Volume', 'Hybrid', 'Lash lift', 'Lash tint', 'Other'],
  BROWS: ['Microblading', 'Brow lamination', 'Threading', 'Henna brows', 'Tinting', 'Other'],
  MUA: ['Bridal', 'Editorial', 'Glam', 'Special occasion', 'Airbrush', 'Other'],
  AESTHETICS: ['Facials', 'Chemical peels', 'Microneedling', 'Dermaplaning', 'Sensitive skin', 'Mature skin', 'Other'],
  OTHER: ['Other'],
};


export default function SignUpStep5Screen({ navigation }: Props) {
  const { isDarkMode, palette: t } = useTheme();
  const { data, updateData, resetData, totalSteps } = useRegistration();
  const { user, upgradeToProvider, addClientProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const servicesY  = useRef(0);
  const locationY  = useRef(0);
  const frequencyY = useRef(0);
  const referralY  = useRef(0);
  const accessibilityY = useRef(0);
  const languagesY     = useRef(0);
  const specialtiesY   = useRef(0);
  const [isLoading,  setIsLoading]  = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const isProvider = data.accountType === 'provider';

  // Client-only (services/location moved to Step 4 for providers)
  const [selectedInterests, setSelectedInterests] = useState<string[]>(data.serviceInterests);
  const [selectedLocations, setSelectedLocations] = useState<string[]>(data.serviceLocations);
  const [selectedFrequency, setSelectedFrequency] = useState<string>(data.maintenanceFrequency);
  const [selectedReferral,  setSelectedReferral]  = useState<string>(data.referralSource);
  // Provider-only "Tell me more"
  const [selectedAccessibility, setSelectedAccessibility] = useState<string[]>(data.accessibilityNotes ? data.accessibilityNotes.split('|').filter(Boolean) : []);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(data.languagesSpoken);
  const [languagesOther, setLanguagesOther] = useState<string>(data.languagesOther);
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>(data.specialties);
  const [specialtiesOther, setSpecialtiesOther] = useState<string>(data.specialtiesOther);
  // Category-aware options: union of every selected service category's list
  // (a provider offering both HAIR and NAILS sees both lists combined), deduped,
  // 'Other' always trailing regardless of category order.
  const specialtyOptions = React.useMemo(() => {
    const categories = data.serviceInterests.length ? data.serviceInterests : ['OTHER'];
    const combined = categories.flatMap(cat => SPECIALTY_OPTIONS_BY_CATEGORY[cat] ?? []);
    const withoutOther = combined.filter(o => o !== 'Other');
    const deduped = withoutOther.filter((o, i) => withoutOther.indexOf(o) === i);
    return [...deduped, 'Other'];
  }, [data.serviceInterests]);
  // Personalisation — optional, affects home feed section gating
  const [selectedGender,    setSelectedGender]    = useState<'female' | 'male' | 'non-binary' | 'prefer-not-to-say' | null>(data.gender);
  const [hasKids,           setHasKids]           = useState<boolean>(data.has_kids ?? false);

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

  const toggleAccessibility = (item: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedAccessibility(prev => prev.includes(item) ? prev.filter(a => a !== item) : [...prev, item]);
  };

  const toggleLanguage = (item: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedLanguages(prev => prev.includes(item) ? prev.filter(l => l !== item) : [...prev, item]);
  };

  const toggleSpecialty = (item: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedSpecialties(prev => prev.includes(item) ? prev.filter(s => s !== item) : [...prev, item]);
  };

  // 'Other' plus its free-text value is folded into one flat list to store —
  // e.g. ['Balayage', 'Other'] + "Colour matching for grey coverage" becomes
  // ['Balayage', 'Colour matching for grey coverage'], never the literal
  // string 'Other' itself.
  const finalSpecialties = selectedSpecialties.includes('Other') && specialtiesOther.trim()
    ? [...selectedSpecialties.filter(s => s !== 'Other'), specialtiesOther.trim()]
    : selectedSpecialties.filter(s => s !== 'Other');

  // recognizeLanguage normalises casing/aliases (e.g. "french" → "French")
  // so a typed language matches the canonical name AboutYouScreen already
  // knows about, instead of creating a near-duplicate chip later.
  const finalLanguages = selectedLanguages.includes('Other') && languagesOther.trim()
    ? [...selectedLanguages.filter(l => l !== 'Other'), recognizeLanguage(languagesOther)]
    : selectedLanguages.filter(l => l !== 'Other');

  const submitSignUp = async () => {
    updateData(isProvider ? {
      accessibilityNotes: selectedAccessibility.join('|'),
      languagesSpoken: finalLanguages,
      languagesOther,
      specialties: finalSpecialties,
      specialtiesOther,
      referralSource: selectedReferral,
    } : {
      serviceInterests: selectedInterests,
      serviceLocations: selectedLocations,
      maintenanceFrequency: selectedFrequency,
      referralSource: selectedReferral,
      gender: selectedGender,
      has_kids: hasKids,
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
          gender: selectedGender,
          has_kids: hasKids,
        });
        // Non-blocking, logged rather than swallowed. Server-side resolves
        // the recipient and wording; this only names which welcome it is.
        invokeSendAccountEmail('client_welcome').catch((e) => {
          logger.error('[email] welcome email failed to send:', e);
        });
        resetData();
        navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
      } catch (e: any) {
        Alert.alert('Oops!', toUserMessage(e, "We couldn't finish setting up your account. Please try again.", 'signup:addClientProfile'));
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (data.fromProviderSwitch) {
      try {
        await upgradeToProvider(data.businessName.trim(), data.businessEmail.trim(), {
          businessPhone: data.businessPhone, instagram: data.instagram, tiktok: data.tiktok, website: data.website,
          businessType: data.businessType,
          dobDay: data.dobDay, dobMonth: data.dobMonth, dobYear: data.dobYear,
          serviceInterests: data.serviceInterests, serviceLocations: data.serviceLocations,
          priceRange: data.priceRange, teamSize: data.teamSize,
          preferredContactMethods: data.preferredContactMethods,
          preferredPaymentMethods: data.preferredPaymentMethods,
          accessibilityNotes: selectedAccessibility.join('|'),
          languagesSpoken: finalLanguages, specialties: finalSpecialties,
          referralSource: selectedReferral,
        });
        // Non-blocking, logged rather than swallowed. Server-side resolves
        // the recipient and wording; this only names which welcome it is.
        invokeSendAccountEmail('provider_welcome').catch((e) => {
          logger.error('[email] welcome email failed to send:', e);
        });
        resetData();
        navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
      } catch (e: any) {
        Alert.alert('Oops!', toUserMessage(e, "We couldn't finish setting up your provider account. Please try again.", 'signup:upgradeToProvider'));
      } finally {
        setIsLoading(false);
      }
      return;
    }

    const personalEmail = data.email.trim();
    // DOB is collected for both account types now (client: Step 3, provider:
    // Step 2) — this used to be gated to accountType === 'user' only, which
    // silently discarded every provider's DOB even after they'd entered it.
    const dob = data.dobDay && data.dobMonth && data.dobYear
      ? `${data.dobYear}-${data.dobMonth.padStart(2, '0')}-${data.dobDay.padStart(2, '0')}`
      : '';

    try {
      const authData = await signUpWithEmail({
        email: personalEmail,
        password: data.password,
        metadata: {
            name: data.name, phone: data.phone, role: data.accountType, dob,
            business_name: data.businessName || null, business_email: data.businessEmail || null,
            business_type: data.businessType || null,
            business_phone: data.businessPhone || null, instagram: data.instagram || null,
            tiktok: data.tiktok || null, website: data.website || null,
            hair_type: data.hairType || null, skin_type: data.skinType || null,
            allergies: data.allergies, skin_concerns: data.skinConcerns,
            style_vibe: data.styleVibe || null, treatment_history: data.treatmentHistory,
            medical_notes: data.medicalNotes || null, photography_consent: data.photographyConsent,
            service_interests: isProvider ? data.serviceInterests : selectedInterests,
            service_locations: isProvider ? data.serviceLocations : selectedLocations,
            location: isProvider ? (data.location || null) : null,
            maintenance_frequency: selectedFrequency, referral_source: selectedReferral,
            gender: selectedGender || null, has_kids: hasKids,
            price_range: isProvider ? (data.priceRange || null) : null,
            team_size: isProvider ? (data.teamSize || null) : null,
            preferred_contact_methods: isProvider ? data.preferredContactMethods : null,
            accessibility_notes: isProvider ? (selectedAccessibility.join('|') || null) : null,
            languages_spoken: isProvider ? finalLanguages : null,
            specialties: isProvider ? finalSpecialties : null,
            preferred_payment_methods: isProvider ? data.preferredPaymentMethods : null,
        },
      });

      if (!authData.hasIdentity) {
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
      Alert.alert('Oops!', toUserMessage(e, "We couldn't create your account. Please try again.", 'signup:submit'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleComplete = () => {
    // Every flow — fresh signup AND provider/client switches — must complete
    // Step 5's required fields before submitting. (Switches used to skip this.)
    const firstEmptyY = isProvider
      ? (!selectedAccessibility.length ? accessibilityY : !selectedLanguages.length ? languagesY : !selectedSpecialties.length ? specialtiesY : !selectedReferral ? referralY : null)
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

        <StepProgressIndicator currentStep={5} totalSteps={totalSteps} stepLabel="Tell Me More" />

        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: t.text }]}>Tell me more</Text>
          <Text style={[styles.headerSubtitle, { color: t.sub }]}>
            {isProvider
              ? 'A few finishing touches for your provider profile'
              : "Personalise your experience — skip anything you'd like"}
          </Text>
        </View>

        {isProvider ? (
          <>
            {renderSection(accessibilityY, 'ACCESSIBILITY', "Does your space have any of these? Select all that apply", ACCESSIBILITY_OPTIONS, item => selectedAccessibility.includes(item), toggleAccessibility, true)}

            {/* Languages spoken — 'Other' reveals a free-text input, same
                pattern as Specialties below, so a language outside the
                fixed list can still be added instead of being lost. */}
            <View onLayout={(e: LayoutChangeEvent) => { languagesY.current = e.nativeEvent.layout.y; }}>
              <Text style={[styles.sectionLabel, { color: showErrors && !selectedLanguages.length ? '#DC2626' : t.text }]}>
                LANGUAGES SPOKEN{showErrors && !selectedLanguages.length ? '  — required' : ''}
              </Text>
              <Text style={[styles.sectionSub, { color: t.sub }]}>Which languages can you offer appointments in?</Text>
              <View style={styles.chipsContainer}>
                {LANGUAGE_OPTIONS.map(item => (
                  <TouchableOpacity key={item} style={chipStyle(selectedLanguages.includes(item))} onPress={() => toggleLanguage(item)} activeOpacity={0.6}>
                    <Text style={chipTextStyle(selectedLanguages.includes(item))}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {selectedLanguages.includes('Other') && (
                <View style={[styles.otherInputWrap, { backgroundColor: t.surface, borderColor: t.border }]}>
                  <TextInput
                    style={[styles.otherInput, { color: t.text }]}
                    value={languagesOther}
                    onChangeText={setLanguagesOther}
                    placeholder="Tell us more..."
                    placeholderTextColor={t.sub}
                  />
                </View>
              )}
            </View>

            {/* Specialties — options depend on the service categories picked in Step 4 */}
            <View onLayout={(e: LayoutChangeEvent) => { specialtiesY.current = e.nativeEvent.layout.y; }}>
              <Text style={[styles.sectionLabel, { color: showErrors && !selectedSpecialties.length ? '#DC2626' : t.text }]}>
                SPECIALTIES{showErrors && !selectedSpecialties.length ? '  — required' : ''}
              </Text>
              <Text style={[styles.sectionSub, { color: t.sub }]}>
                {data.serviceInterests.some(c => c === 'HAIR' || c === 'AESTHETICS')
                  ? 'What client needs or hair/skin types do you specialise in?'
                  : 'What do you specialise in? You can add more later'}
              </Text>
              <View style={styles.chipsContainer}>
                {specialtyOptions.map(item => (
                  <TouchableOpacity key={item} style={chipStyle(selectedSpecialties.includes(item))} onPress={() => toggleSpecialty(item)} activeOpacity={0.6}>
                    <Text style={chipTextStyle(selectedSpecialties.includes(item))}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {selectedSpecialties.includes('Other') && (
                <View style={[styles.otherInputWrap, { backgroundColor: t.surface, borderColor: t.border }]}>
                  <TextInput
                    style={[styles.otherInput, { color: t.text }]}
                    value={specialtiesOther}
                    onChangeText={setSpecialtiesOther}
                    placeholder="Tell us more..."
                    placeholderTextColor={t.sub}
                  />
                </View>
              )}
            </View>

            {renderSection(referralY, 'REFERRAL', 'Where did you hear about us?', REFERRAL_SOURCES, item => selectedReferral === item, selectReferral, true)}
          </>
        ) : (
          <>
            {renderSection(servicesY, 'SERVICES', "Select all services you're interested in", SERVICE_CATEGORIES, item => selectedInterests.includes(item), toggleInterest, true)}
            {renderSection(locationY, 'LOCATION', 'Where are you willing to get services from?', LOCATIONS, item => selectedLocations.includes(item), toggleLocation, true)}
            {renderSection(frequencyY, 'FREQUENCY', 'How often do you get your maintenance done?', FREQUENCIES, item => selectedFrequency === item, selectFrequency, true)}
            {renderSection(referralY, 'REFERRAL', 'Where did you hear about us?', REFERRAL_SOURCES, item => selectedReferral === item, selectReferral, true)}

            {/* Gender — optional, personalises the home feed */}
            <View>
              <Text style={[styles.sectionLabel, { color: t.text }]}>GENDER  <Text style={[styles.skipText, { color: t.sub, fontSize: 11 }]}>optional</Text></Text>
              <Text style={[styles.sectionSub, { color: t.sub }]}>Helps us show you relevant services</Text>
              <View style={styles.chipsContainer}>
                {(['female', 'male', 'non-binary', 'prefer-not-to-say'] as const).map(g => {
                  const label: Record<string, string> = { female: 'FEMALE', male: 'MALE', 'non-binary': 'NON-BINARY', 'prefer-not-to-say': 'PREFER NOT TO SAY' };
                  const isSelected = selectedGender === g;
                  return (
                    <TouchableOpacity
                      key={g}
                      style={{ borderRadius: 100, borderWidth: 1, paddingVertical: 11, paddingHorizontal: 18, backgroundColor: isSelected ? t.accent : t.surface, borderColor: isSelected ? t.accent : t.border }}
                      onPress={() => { Haptics.selectionAsync().catch(() => {}); setSelectedGender(isSelected ? null : g); }}
                      activeOpacity={0.6}
                    >
                      <Text style={{ fontFamily: 'BakbakOne-Regular' as const, fontSize: 13, letterSpacing: 0.8, color: isSelected ? '#FFFFFF' : t.sub }}>{label[g]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Kids toggle — optional */}
            <View style={[styles.kidsToggleRow, { backgroundColor: t.card, borderColor: t.border }]}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[styles.sectionLabel, { color: t.text, marginBottom: 4 }]}>KIDS BEAUTY SERVICES</Text>
                <Text style={[styles.sectionSub, { color: t.sub, marginBottom: 0 }]}>Show me kids' beauty services</Text>
              </View>
              <Switch
                value={hasKids}
                onValueChange={v => { Haptics.selectionAsync().catch(() => {}); setHasKids(v); }}
                trackColor={{ false: '#D1D1D6', true: t.accent }}
                thumbColor={hasKids ? '#fff' : '#f4f3f4'}
              />
            </View>
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
  otherInputWrap: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginTop: -22,
    marginBottom: 32,
  },
  otherInput: { fontFamily: 'Jura-VariableFont_wght', fontSize: 15, letterSpacing: 0.3, padding: 0 },
  actionsSection: { alignItems: 'center' },
  completeBtn: { borderRadius: 100, paddingVertical: 15, alignItems: 'center', width: '100%' },
  completeBtnText: { fontFamily: 'BakbakOne-Regular', fontSize: 15, letterSpacing: 1, color: '#FFFFFF' },
  skipBtn: { marginTop: 16, paddingVertical: 8 },
  skipText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '600' },
  kidsToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 32,
  },
});
