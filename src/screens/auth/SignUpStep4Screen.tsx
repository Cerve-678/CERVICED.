// src/screens/auth/SignUpStep4Screen.tsx
import React, { useState } from 'react';
import { BUSINESS_TYPE_OPTS } from '../../features/business-details/options';
import type { BusinessType } from '../../types/database';
import {
  LayoutChangeEvent,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { useRegistration } from '../../contexts/RegistrationContext';
import SignUpHeader from '../../components/SignUpHeader';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';
import { ThemedBackground } from '../../components/ThemedBackground';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';
import AreaPicker from '../../components/AreaPicker';
import { HAIR_TYPES } from '../../constants/hairTypes';
import { Ionicons } from '@expo/vector-icons';
import {
  Chip, ChipWrap, FieldRow, FormCard, PrimaryButton, QuestionCard, ScreenTitle, SectionLabel, SwitchRow, useFieldInputStyle,
} from '../../components/signup/FormKit';

type Props = StackScreenProps<RootStackParamList, 'SignUpStep4'>;

const SKIN_TYPES        = ['Normal', 'Oily', 'Dry', 'Combination', 'Sensitive'];
const SKIN_CONCERNS     = ['Acne', 'Redness', 'Dry patches', 'Oiliness', 'Hyperpigmentation', 'Sensitivity', 'Fine lines', 'Uneven tone', 'None'];
const STYLE_VIBES       = ['Natural', 'Glam', 'Minimal', 'Bold', 'Classic', 'Edgy', 'Soft', 'Trendy'];
const ALLERGENS         = ['Latex', 'Fragrances', 'Dyes / PPD', 'Nuts', 'Nickel', 'Sulfates', 'Parabens', 'Lanolin', 'Shellfish', 'Gluten', 'None known'];
const TREATMENT_HISTORY = ['Facials', 'Lash extensions', 'Brow tinting', 'Hair colour', 'Nails', 'Waxing', 'Dermaplaning', 'Microneedling', 'Chemical peels', 'None'];

// Provider "About your business" — logistics needed for booking + the
// business profile (see supabase/provider_signup_business_fields.sql for
// where each of these lands: price range reuses providers.price_tier,
// team size/contact prefs are staged on `users` then copied across by
// InfoRegScreen's first-save prefill).
// Signup offers exactly the types BUSINESS_TYPE_OPTS defines, with its labels
// — a provider must not be able to pick a type at signup that Business Details
// then can't render, or vice versa.
const BUSINESS_TYPES: { v: BusinessType; l: string }[] =
  BUSINESS_TYPE_OPTS.map(o => ({ v: o.value, l: o.label }));
const SERVICE_CATEGORIES = ['HAIR', 'NAILS', 'LASHES', 'BROWS', 'MUA', 'AESTHETICS', 'OTHER'];
const PRICE_RANGES: { v: 'budget' | 'mid' | 'premium' | 'luxury'; l: string }[] = [
  { v: 'budget',  l: '£15–£35' },
  { v: 'mid',     l: '£35–£65' },
  { v: 'premium', l: '£65–£100' },
  { v: 'luxury',  l: '£100+' },
];
const CONTACT_METHODS: { v: string; l: string }[] = [
  { v: 'in_app',   l: 'In-app messages' },
  { v: 'phone',    l: 'Phone' },
  { v: 'whatsapp', l: 'WhatsApp' },
  { v: 'email',    l: 'Email' },
];
const PAYMENT_METHODS: { v: string; l: string }[] = [
  { v: 'card',        l: 'Card' },
  { v: 'cash',        l: 'Cash' },
  { v: 'bank_transfer', l: 'Bank transfer' },
];


export default function SignUpStep4Screen({ navigation }: Props) {
  const { isDarkMode, palette: t } = useTheme();
  const { data, updateData, totalSteps } = useRegistration();
  const insets = useSafeAreaInsets();

  const scrollRef = React.useRef<ScrollView>(null);
  const hairY           = React.useRef(0);
  const skinY           = React.useRef(0);
  const skinConcernsY   = React.useRef(0);
  const styleVibeY      = React.useRef(0);
  const allergyY        = React.useRef(0);
  const treatmentY      = React.useRef(0);
  const medicalY        = React.useRef(0);
  const consentY        = React.useRef(0);
  const businessTypeY     = React.useRef(0);
  const servicesY         = React.useRef(0);
  const locationY        = React.useRef(0);
  const priceRangeY      = React.useRef(0);
  const contactMethodsY  = React.useRef(0);
  const paymentMethodsY   = React.useRef(0);

  const [selectedHairType,   setSelectedHairType]   = useState<string>(data.hairType);
  const [selectedSkinType,   setSelectedSkinType]   = useState<string>(data.skinType);
  const [selectedConcerns,   setSelectedConcerns]   = useState<string[]>(data.skinConcerns);
  const [selectedStyleVibe,  setSelectedStyleVibe]  = useState<string>(data.styleVibe);
  const [selectedAllergens,  setSelectedAllergens]  = useState<string[]>(data.allergies);
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>(data.treatmentHistory);
  const [medicalNotes,       setMedicalNotes]       = useState<string>(data.medicalNotes);
  const [photoConsent,       setPhotoConsent]       = useState<boolean>(data.photographyConsent);
  const [showErrors,         setShowErrors]         = useState(false);

  // Provider "About your business"
  const [selectedBusinessType, setSelectedBusinessType] = useState<typeof data.businessType>(data.businessType);
  const [selectedServices, setSelectedServices] = useState<string[]>(data.serviceInterests);
  const [selectedLocation, setSelectedLocation] = useState<string>(data.location);
  const [selectedPriceRange, setSelectedPriceRange] = useState<typeof data.priceRange>(data.priceRange);
  const [yearsExperience, setYearsExperience] = useState<string>(data.yearsExperience);
  const [selectedContactMethods, setSelectedContactMethods] = useState<string[]>(
    data.preferredContactMethods.length ? data.preferredContactMethods : ['in_app']
  );
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<string[]>(data.preferredPaymentMethods);

  const isUser = data.accountType === 'user';
  const isProvider = data.accountType === 'provider';
  const usesOwnLink = data.externalBookingUrl !== '';

  const scrollTo = (yRef: React.MutableRefObject<number>) =>
    scrollRef.current?.scrollTo({ y: Math.max(0, yRef.current - 24), animated: true });

  const onLayoutFor = (yRef: React.MutableRefObject<number>) =>
    (e: LayoutChangeEvent) => { yRef.current = e.nativeEvent.layout.y; };

  // Chip already gives the selection haptic, so the handlers below don't.
  const chips = <T extends string>(items: { v: T; l: string }[], isOn: (v: T) => boolean, onPress: (v: T) => void) => (
    <ChipWrap style={styles.chipsInCard}>
      {items.map(({ v, l }) => <Chip key={v} label={l} selected={isOn(v)} onPress={() => onPress(v)} />)}
    </ChipWrap>
  );
  const plain = (items: string[]) => items.map(i => ({ v: i, l: i }));

  const pickHair = (type: string) => {
    const next = selectedHairType === type ? '' : type;
    setSelectedHairType(next);
    if (next) setTimeout(() => scrollTo(skinY), 150);
  };

  const pickSkin = (type: string) => {
    const next = selectedSkinType === type ? '' : type;
    setSelectedSkinType(next);
    if (next) setTimeout(() => scrollTo(skinConcernsY), 150);
  };

  const toggleConcern = (item: string) => {
    setSelectedConcerns(prev => {
      if (item === 'None') return prev.includes('None') ? [] : ['None'];
      const without = prev.filter(c => c !== 'None');
      const next = without.includes(item) ? without.filter(c => c !== item) : [...without, item];
      if (!prev.length && next.length === 1) setTimeout(() => scrollTo(styleVibeY), 150);
      return next;
    });
  };

  const pickStyleVibe = (vibe: string) => {
    const next = selectedStyleVibe === vibe ? '' : vibe;
    setSelectedStyleVibe(next);
    if (next) setTimeout(() => scrollTo(allergyY), 150);
  };

  const toggleAllergen = (item: string) => {
    setSelectedAllergens(prev => {
      if (item === 'None known') return prev.includes('None known') ? [] : ['None known'];
      const without = prev.filter(a => a !== 'None known');
      const next = without.includes(item) ? without.filter(a => a !== item) : [...without, item];
      if (!prev.length && next.length === 1) setTimeout(() => scrollTo(treatmentY), 150);
      return next;
    });
  };

  const toggleTreatment = (item: string) => {
    setSelectedTreatments(prev => {
      if (item === 'None') return prev.includes('None') ? [] : ['None'];
      const without = prev.filter(tr => tr !== 'None');
      const next = without.includes(item) ? without.filter(tr => tr !== item) : [...without, item];
      if (!prev.length && next.length === 1) setTimeout(() => scrollTo(medicalY), 150);
      return next;
    });
  };

  const pickBusinessType = (type: NonNullable<typeof data.businessType> | '') => {
    setSelectedBusinessType(type);
  };

  const toggleService = (category: string) => {
    setSelectedServices(prev => prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]);
  };

  const pickPriceRange = (range: NonNullable<typeof data.priceRange> | '') => {
    setSelectedPriceRange(prev => prev === range ? '' : range);
  };

  const toggleContactMethod = (method: string) => {
    setSelectedContactMethods(prev => prev.includes(method) ? prev.filter(m => m !== method) : [...prev, method]);
  };

  const togglePaymentMethod = (method: string) => {
    setSelectedPaymentMethods(prev => prev.includes(method) ? prev.filter(m => m !== method) : [...prev, method]);
  };

  const saveAndProceed = () => {
    if (isProvider) {
      updateData({
        businessType: selectedBusinessType,
        serviceInterests: selectedServices,
        location: selectedLocation,
        yearsExperience: yearsExperience.trim(),
        priceRange: selectedPriceRange,
        preferredContactMethods: selectedContactMethods,
        preferredPaymentMethods: usesOwnLink ? [] : selectedPaymentMethods,
      });
    } else {
      updateData({
        hairType: selectedHairType,
        skinType: selectedSkinType,
        skinConcerns: selectedConcerns,
        styleVibe: selectedStyleVibe,
        allergies: selectedAllergens,
        treatmentHistory: selectedTreatments,
        medicalNotes,
        photographyConsent: photoConsent,
      });
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    navigation.navigate('SignUpStep5');
  };

  const handleContinue = () => {
    if (isProvider) {
      const firstEmptyY =
        !selectedServices.length      ? servicesY :
        !selectedBusinessType          ? businessTypeY :
        !selectedLocation.trim()      ? locationY :
        !selectedPriceRange           ? priceRangeY :
        !selectedContactMethods.length ? contactMethodsY :
        !usesOwnLink && !selectedPaymentMethods.length ? paymentMethodsY :
        null;
      if (firstEmptyY) {
        setShowErrors(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        scrollTo(firstEmptyY);
        return;
      }
      saveAndProceed();
      return;
    }

    const firstEmptyY =
      !selectedHairType         ? hairY :
      !selectedSkinType         ? skinY :
      !selectedConcerns.length  ? skinConcernsY :
      !selectedStyleVibe        ? styleVibeY :
      !selectedAllergens.length ? allergyY :
      !selectedTreatments.length ? treatmentY :
      null;

    if (firstEmptyY) {
      setShowErrors(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      scrollTo(firstEmptyY);
      return;
    }
    saveAndProceed();
  };

  const inputStyle = useFieldInputStyle();

  return (
    <ThemedBackground style={{ flex: 1 }}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent />

      <KeyboardDismissView style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
        <SignUpHeader onBack={() => navigation.goBack()} currentStep={4} totalSteps={totalSteps} />

        <ScreenTitle
          title={isProvider ? 'About your business' : 'Beauty profile'}
          subtitle={isProvider
            ? 'The essentials clients and bookings need. You can refine the rest later.'
            : 'Help us match you with the right professionals.'}
        />

        {isUser ? (
          <>
            <QuestionCard title="HAIR TYPE" prompt="What's your hair texture?" error={showErrors && !selectedHairType} onLayout={onLayoutFor(hairY)}>
              {chips(plain(HAIR_TYPES), v => selectedHairType === v, pickHair)}
            </QuestionCard>

            <QuestionCard title="SKIN TYPE" prompt="How would you describe your skin?" error={showErrors && !selectedSkinType} onLayout={onLayoutFor(skinY)}>
              {chips(plain(SKIN_TYPES), v => selectedSkinType === v, pickSkin)}
            </QuestionCard>

            <QuestionCard title="SKIN CONCERNS" prompt="Any specific concerns you'd like addressed?" error={showErrors && !selectedConcerns.length} onLayout={onLayoutFor(skinConcernsY)}>
              {chips(plain(SKIN_CONCERNS), v => selectedConcerns.includes(v), toggleConcern)}
            </QuestionCard>

            <QuestionCard title="STYLE VIBE" prompt="What best describes your aesthetic?" error={showErrors && !selectedStyleVibe} onLayout={onLayoutFor(styleVibeY)}>
              {chips(plain(STYLE_VIBES), v => selectedStyleVibe === v, pickStyleVibe)}
            </QuestionCard>

            <QuestionCard title="ALLERGIES" prompt="Select any known allergies or sensitivities." error={showErrors && !selectedAllergens.length} onLayout={onLayoutFor(allergyY)}>
              <View style={[styles.allergyNote, { backgroundColor: isDarkMode ? 'rgba(255,204,0,0.08)' : 'rgba(255,204,0,0.10)', borderColor: 'rgba(255,204,0,0.2)' }]}>
                <Ionicons name="shield-checkmark-outline" size={16} color={isDarkMode ? '#FFD60A' : '#996600'} />
                <Text style={[styles.allergyNoteText, { color: isDarkMode ? '#FFD60A' : '#996600' }]}>
                  Shared with your providers before each appointment, for your safety.
                </Text>
              </View>
              {chips(plain(ALLERGENS), v => selectedAllergens.includes(v), toggleAllergen)}
            </QuestionCard>

            <QuestionCard title="TREATMENT HISTORY" prompt="What treatments have you had before?" error={showErrors && !selectedTreatments.length} onLayout={onLayoutFor(treatmentY)}>
              {chips(plain(TREATMENT_HISTORY), v => selectedTreatments.includes(v), toggleTreatment)}
            </QuestionCard>

            <QuestionCard title="MEDICAL NOTES" hint="Optional" prompt="Any conditions your provider should know about?" onLayout={onLayoutFor(medicalY)}>
              <TextInput
                style={[inputStyle, styles.textArea]}
                value={medicalNotes}
                onChangeText={setMedicalNotes}
                placeholder="e.g. Rosacea, eczema, pregnancy..."
                placeholderTextColor={t.sub}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </QuestionCard>

            <View onLayout={onLayoutFor(consentY)} style={styles.question}>
              <SectionLabel title="PHOTOS" />
              <FormCard>
                <SwitchRow
                  title="Photography consent"
                  subtitle="Allow your provider to photograph your results for their portfolio."
                  value={photoConsent}
                  onValueChange={setPhotoConsent}
                />
              </FormCard>
            </View>
          </>
        ) : (
          <>
            <QuestionCard title="SERVICES YOU OFFER" prompt="Select all categories that apply to your business." error={showErrors && !selectedServices.length} onLayout={onLayoutFor(servicesY)}>
              {chips(plain(SERVICE_CATEGORIES), v => selectedServices.includes(v), toggleService)}
            </QuestionCard>

            <QuestionCard title="BUSINESS TYPE" prompt="How do you run your business?" error={showErrors && !selectedBusinessType} onLayout={onLayoutFor(businessTypeY)}>
              {chips(BUSINESS_TYPES, v => selectedBusinessType === v, pickBusinessType)}
            </QuestionCard>

            <QuestionCard title="WHERE YOU WORK" prompt="Where's your business based?" error={showErrors && !selectedLocation.trim()} onLayout={onLayoutFor(locationY)}>
              <AreaPicker
                value={selectedLocation}
                onChange={setSelectedLocation}
                accentColor={t.accent}
                subtitle="Shown on your public profile and used to place you in local searches — not your exact address."
              />
            </QuestionCard>

            <QuestionCard title="PRICE RANGE" prompt="Where do most of your services sit?" error={showErrors && !selectedPriceRange} onLayout={onLayoutFor(priceRangeY)}>
              {chips(PRICE_RANGES, v => selectedPriceRange === v, pickPriceRange)}
            </QuestionCard>

            <FormCard style={styles.question}>
              <FieldRow label="YEARS OF EXPERIENCE">
                <TextInput
                  style={inputStyle}
                  value={yearsExperience}
                  onChangeText={v => {
                    const digits = v.replace(/[^0-9]/g, '');
                    // Clamp to the 0–80 range the users.years_experience CHECK
                    // enforces, so an absurd value can't fail the whole signup
                    // profile upsert at verification.
                    setYearsExperience(digits && Number(digits) > 80 ? '80' : digits);
                  }}
                  placeholder="e.g. 5 (optional)"
                  placeholderTextColor={t.sub}
                  keyboardType="number-pad"
                  maxLength={2}
                  returnKeyType="done"
                />
              </FieldRow>
            </FormCard>

            <QuestionCard title="CONTACT PREFERENCES" prompt="How should clients reach you?" error={showErrors && !selectedContactMethods.length} onLayout={onLayoutFor(contactMethodsY)}>
              {chips(CONTACT_METHODS, v => selectedContactMethods.includes(v), toggleContactMethod)}
            </QuestionCard>

            {/* Preferred payment type — not asked when bookings happen on the
                professional's own booking page; that page owns payment. */}
            {!usesOwnLink && (
              <QuestionCard title="PREFERRED PAYMENT TYPE" prompt="How do you take payment for off-app services?" error={showErrors && !selectedPaymentMethods.length} onLayout={onLayoutFor(paymentMethodsY)}>
                {chips(PAYMENT_METHODS, v => selectedPaymentMethods.includes(v), togglePaymentMethod)}
              </QuestionCard>
            )}
          </>
        )}

        <PrimaryButton label="CONTINUE" onPress={handleContinue} style={styles.continueBtn} />
        {isUser && (
          <TouchableOpacity style={styles.skipBtn} onPress={saveAndProceed} activeOpacity={0.6}>
            <Text style={[styles.skipText, { color: t.sub }]}>Skip for now</Text>
          </TouchableOpacity>
        )}
        </ScrollView>
      </KeyboardDismissView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16 },
  question: { marginBottom: 22 },
  chipsInCard: { marginBottom: 0 },
  allergyNote: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  allergyNoteText: { flex: 1, fontFamily: 'Jura-VariableFont_wght', fontSize: 12, lineHeight: 17 },
  textArea: { minHeight: 72, fontWeight: '500' },
  continueBtn: { marginTop: 8 },
  skipBtn: { alignSelf: 'center', marginTop: 16, paddingVertical: 8 },
  skipText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '600' },
});
