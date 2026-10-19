// src/screens/auth/SignUpStep5Screen.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  LayoutChangeEvent,
  Modal,
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
import SignUpHeader from '../../components/SignUpHeader';
import { Ionicons } from '@expo/vector-icons';
import { invokeSendAccountEmail, signUpWithEmail } from '../../services/databaseService';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';
import { ThemedBackground } from '../../components/ThemedBackground';
import { LANGUAGE_OPTS, ACCESSIBILITY_OPTS, ALL_SPECIALTIES, SPECIALTIES_MAP } from '../../features/business-details/options';
import { SpecialityMultiSelect } from '../../components/SpecialityMultiSelect';
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



// Shown once the second hat is actually on the account, in place of dropping
// the user straight into a differently-shaped app with no acknowledgement.
// Only reachable from the two switch flows — a first-time signup has no
// "second hat" to celebrate and goes to MainTabs directly, as before.
const HAT_CELEBRATION = {
  client: {
    title: "You can book now too!",
    body: "Your client profile is ready. Browse providers, book appointments and save your favourites \u2014 your business stays exactly as it was.",
  },
  provider: {
    title: "You're a provider now!",
    body: "Your provider profile is ready. Add your services, portfolio and availability so clients can find and book you.",
  },
} as const;

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
  // Which hat was just added, or null for "not celebrating". Doubles as the
  // modal's visibility flag so the two can't disagree.
  const [celebratedHat, setCelebratedHat] = useState<'client' | 'provider' | null>(null);
  const celebrationScale   = useRef(new Animated.Value(0.6)).current;
  const celebrationOpacity = useRef(new Animated.Value(0)).current;

  // Same spring/fade as the provider go-live celebration on ProviderHomeScreen,
  // so the app has one celebration feel rather than two. Deliberately NOT the
  // same card colour: that one paints on `surface` (the page tone), where
  // DESIGN_SYSTEM's Cards convention is `card` — used below.
  useEffect(() => {
    if (!celebratedHat) return;
    celebrationScale.setValue(0.6);
    celebrationOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(celebrationScale, { toValue: 1, tension: 120, friction: 8, useNativeDriver: true }),
      Animated.timing(celebrationOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [celebratedHat, celebrationScale, celebrationOpacity]);

  // The navigation that used to happen the instant the hat was added. Deferred
  // to the modal's dismissal, so resetData() can't blank the form out behind a
  // half-transparent backdrop. Android's back button routes here too — closing
  // the modal without this would strand the user on a signup step for a hat
  // they already have.
  const finishHatSwitch = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setCelebratedHat(null);
    resetData();
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  };

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
  // The same vocabulary Search's Speciality filter and the profile editors
  // use (SPECIALTIES_MAP), for every service type picked in Step 4, so what a
  // provider picks here is exactly what clients filter on. Picked in the same
  // searchable sheet as the filter; a term typed that isn't listed can still
  // be added, which replaces the old "Other" box.
  const specialtyOptions = React.useMemo(() => {
    const combined = data.serviceInterests.flatMap(cat => SPECIALTIES_MAP[cat] ?? []);
    return combined.length ? [...new Set(combined)] : ALL_SPECIALTIES;
  }, [data.serviceInterests]);
  // Personalisation — optional, affects home feed section gating
  const [selectedGender,    setSelectedGender]    = useState<'female' | 'male' | 'non-binary' | 'prefer-not-to-say' | null>(data.gender);
  const [hasKids,           setHasKids]           = useState<boolean>(data.has_kids ?? false);

  const chipStyle = (isSelected: boolean) => ({
    borderRadius: 100,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: isSelected ? t.accent : t.card,
    borderColor: isSelected ? t.accent : t.border,
  });

  const chipTextStyle = (isSelected: boolean) => ({
    fontFamily: 'Jura-VariableFont_wght' as const,
    fontSize: 13,
    fontWeight: '700' as const,
    color: isSelected ? t.onAccent : t.text,
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
      specialties: selectedSpecialties,
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
        // the recipient and wording; this only names which email it is.
        // NOT 'client_welcome' — this account is already on CERVICED as a
        // provider, so the new-signup welcome would greet them as a stranger.
        invokeSendAccountEmail('client_hat_added').catch((e) => {
          logger.error('[email] client hat email failed to send:', e);
        });
        // resetData + navigation now happen when the celebration is dismissed.
        setCelebratedHat('client');
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
          yearsExperience: data.yearsExperience,
          priceRange: data.priceRange,
          externalBookingUrl: data.externalBookingUrl,
          preferredContactMethods: data.preferredContactMethods,
          preferredPaymentMethods: data.preferredPaymentMethods,
          accessibilityNotes: selectedAccessibility.join('|'),
          languagesSpoken: finalLanguages, specialties: selectedSpecialties,
          referralSource: selectedReferral,
        });
        // Non-blocking, logged rather than swallowed. Server-side resolves
        // the recipient and wording; this only names which email it is.
        // The mirror of the client case above: an existing client gaining the
        // provider hat, not a brand-new provider signing up.
        invokeSendAccountEmail('provider_hat_added').catch((e) => {
          logger.error('[email] provider hat email failed to send:', e);
        });
        // resetData + navigation now happen when the celebration is dismissed.
        setCelebratedHat('provider');
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
            years_experience: isProvider ? (data.yearsExperience || null) : null,
            maintenance_frequency: selectedFrequency, referral_source: selectedReferral,
            gender: selectedGender || null, has_kids: hasKids,
            price_range: isProvider ? (data.priceRange || null) : null,
            external_booking_url: isProvider ? (data.externalBookingUrl || null) : null,
            preferred_contact_methods: isProvider ? data.preferredContactMethods : null,
            accessibility_notes: isProvider ? (selectedAccessibility.join('|') || null) : null,
            languages_spoken: isProvider ? finalLanguages : null,
            specialties: isProvider ? selectedSpecialties : null,
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
      <Text style={[styles.sectionLabel, { color: showErrors && required && !items.find(isSelectedFn) ? '#DC2626' : t.accentText }]}>
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
        <SignUpHeader onBack={() => navigation.goBack()} currentStep={5} totalSteps={totalSteps} />

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
              <Text style={[styles.sectionLabel, { color: showErrors && !selectedLanguages.length ? '#DC2626' : t.accentText }]}>
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
                <View style={[styles.otherInputWrap, { backgroundColor: t.card, borderColor: t.border }]}>
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
              <Text style={[styles.sectionLabel, { color: showErrors && !selectedSpecialties.length ? '#DC2626' : t.accentText }]}>
                SPECIALTIES{showErrors && !selectedSpecialties.length ? '  — required' : ''}
              </Text>
              <Text style={[styles.sectionSub, { color: t.sub }]}>
                {data.serviceInterests.some(c => c === 'HAIR' || c === 'AESTHETICS')
                  ? 'What client needs or hair/skin types do you specialise in?'
                  : 'What do you specialise in? You can add more later'}
              </Text>
              <SpecialityMultiSelect
                selected={selectedSpecialties}
                onChange={setSelectedSpecialties}
                options={specialtyOptions}
                palette={t}
                placeholder="Search specialities"
              />
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
              <Text style={[styles.sectionLabel, { color: t.accentText }]}>GENDER  <Text style={[styles.skipText, { color: t.sub, fontSize: 11 }]}>optional</Text></Text>
              <Text style={[styles.sectionSub, { color: t.sub }]}>Helps us show you relevant services</Text>
              <View style={styles.chipsContainer}>
                {(['female', 'male', 'non-binary', 'prefer-not-to-say'] as const).map(g => {
                  const label: Record<string, string> = { female: 'FEMALE', male: 'MALE', 'non-binary': 'NON-BINARY', 'prefer-not-to-say': 'PREFER NOT TO SAY' };
                  const isSelected = selectedGender === g;
                  return (
                    <TouchableOpacity
                      key={g}
                      style={chipStyle(isSelected)}
                      onPress={() => { Haptics.selectionAsync().catch(() => {}); setSelectedGender(isSelected ? null : g); }}
                      activeOpacity={0.6}
                    >
                      <Text style={chipTextStyle(isSelected)}>{label[g]}</Text>
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

      {/* Second-hat celebration. Dismissing it is what completes the switch. */}
      <Modal
        visible={celebratedHat !== null}
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        animationType="fade"
        onRequestClose={finishHatSwitch}
      >
        <View style={styles.celebrateBackdrop}>
          <Animated.View
            style={[
              styles.celebrateCard,
              {
                backgroundColor: t.card,
                opacity: celebrationOpacity,
                transform: [{ scale: celebrationScale }],
              },
            ]}
          >
            <Ionicons name="sparkles-outline" size={44} color={t.accent} />
            <Text style={[styles.celebrateTitle, { color: t.text }]}>
              {celebratedHat ? HAT_CELEBRATION[celebratedHat].title : ''}
            </Text>
            <Text style={[styles.celebrateBody, { color: t.sub }]}>
              {celebratedHat ? HAT_CELEBRATION[celebratedHat].body : ''}
            </Text>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={finishHatSwitch}
              style={[styles.celebrateBtn, { backgroundColor: t.accent }]}
            >
              <Text style={[styles.celebrateBtnText, { color: t.onAccent }]}>Let's go</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  scroll: { paddingHorizontal: 16 },
  header: { marginBottom: 22 },
  headerTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 30, lineHeight: 36, letterSpacing: 0.5 },
  headerSubtitle: { fontFamily: 'Jura-VariableFont_wght', fontSize: 15, marginTop: 4, lineHeight: 21 },
  sectionLabel: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '700', letterSpacing: 1.2, marginBottom: 2 },
  sectionSub: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, marginBottom: 10, lineHeight: 18 },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 24 },
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
  completeBtn: { borderRadius: 100, minHeight: 56, justifyContent: 'center', alignItems: 'center', width: '100%' },
  completeBtnText: { fontFamily: 'BakbakOne-Regular', fontSize: 15, letterSpacing: 1.5, color: '#FFFFFF' },
  skipBtn: { marginTop: 16, paddingVertical: 8 },
  skipText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '600' },
  // Second-hat celebration. Typography follows this screen's fonts rather than
  // the go-live modal's raw fontWeights, so it reads as part of signup.
  celebrateBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  celebrateCard: {
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
  },
  celebrateTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 22,
    letterSpacing: 1,
    marginTop: 12,
    textAlign: 'center',
  },
  celebrateBody: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  celebrateBtn: {
    marginTop: 22,
    borderRadius: 100,
    paddingVertical: 13,
    paddingHorizontal: 36,
  },
  // Colour comes from t.onAccent at the call site, never a hardcoded white:
  // by the time this shows, activeMode has already flipped, so a client-hat
  // celebration in dark mode paints on the PALE blue-grey client accent.
  celebrateBtnText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    letterSpacing: 1,
  },
  kidsToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
  },
});
