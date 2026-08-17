// src/screens/auth/SignUpStep4Screen.tsx
import React, { useState } from 'react';
import {
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
import StepProgressIndicator from '../../components/StepProgressIndicator';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../../navigation/types';
import { ThemedBackground } from '../../components/ThemedBackground';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';
import { CityMultiSelect } from '../../components/CityMultiSelect';

type Props = StackScreenProps<RootStackParamList, 'SignUpStep4'>;

const HAIR_TYPES        = ['Straight', 'Wavy', 'Curly', 'Coily', '4A', '4B', '4C'];
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
const BUSINESS_TYPES: { v: 'salon' | 'studio' | 'home_based' | 'mobile'; l: string }[] = [
  { v: 'salon', l: 'Salon' },
  { v: 'studio', l: 'Studio' },
  { v: 'home_based', l: 'Home Studio' },
  { v: 'mobile', l: 'Mobile' },
];
const SERVICE_CATEGORIES = ['HAIR', 'NAILS', 'LASHES', 'BROWS', 'MUA', 'AESTHETICS', 'OTHER'];
const PRICE_RANGES: { v: 'budget' | 'mid' | 'premium' | 'luxury'; l: string }[] = [
  { v: 'budget',  l: '£15–£35' },
  { v: 'mid',     l: '£35–£65' },
  { v: 'premium', l: '£65–£100' },
  { v: 'luxury',  l: '£100+' },
];
const TEAM_SIZES: { v: 'solo' | 'small_team' | 'large_team'; l: string }[] = [
  { v: 'solo',        l: 'Just me' },
  { v: 'small_team',  l: '2–5 people' },
  { v: 'large_team',  l: '6+ people' },
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
  const teamSizeY        = React.useRef(0);
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
  const [selectedLocations, setSelectedLocations] = useState<string[]>(data.serviceLocations);
  const [selectedPriceRange, setSelectedPriceRange] = useState<typeof data.priceRange>(data.priceRange);
  const [selectedTeamSize, setSelectedTeamSize] = useState<typeof data.teamSize>(data.teamSize);
  const [selectedContactMethods, setSelectedContactMethods] = useState<string[]>(
    data.preferredContactMethods.length ? data.preferredContactMethods : ['in_app']
  );
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<string[]>(data.preferredPaymentMethods);

  const isUser = data.accountType === 'user';
  const isProvider = data.accountType === 'provider';

  const scrollTo = (yRef: React.MutableRefObject<number>) =>
    scrollRef.current?.scrollTo({ y: Math.max(0, yRef.current - 24), animated: true });

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

  const pickHair = (type: string) => {
    Haptics.selectionAsync().catch(() => {});
    const next = selectedHairType === type ? '' : type;
    setSelectedHairType(next);
    if (next) setTimeout(() => scrollTo(skinY), 150);
  };

  const pickSkin = (type: string) => {
    Haptics.selectionAsync().catch(() => {});
    const next = selectedSkinType === type ? '' : type;
    setSelectedSkinType(next);
    if (next) setTimeout(() => scrollTo(skinConcernsY), 150);
  };

  const toggleConcern = (item: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedConcerns(prev => {
      if (item === 'None') return prev.includes('None') ? [] : ['None'];
      const without = prev.filter(c => c !== 'None');
      const next = without.includes(item) ? without.filter(c => c !== item) : [...without, item];
      if (!prev.length && next.length === 1) setTimeout(() => scrollTo(styleVibeY), 150);
      return next;
    });
  };

  const pickStyleVibe = (vibe: string) => {
    Haptics.selectionAsync().catch(() => {});
    const next = selectedStyleVibe === vibe ? '' : vibe;
    setSelectedStyleVibe(next);
    if (next) setTimeout(() => scrollTo(allergyY), 150);
  };

  const toggleAllergen = (item: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedAllergens(prev => {
      if (item === 'None known') return prev.includes('None known') ? [] : ['None known'];
      const without = prev.filter(a => a !== 'None known');
      const next = without.includes(item) ? without.filter(a => a !== item) : [...without, item];
      if (!prev.length && next.length === 1) setTimeout(() => scrollTo(treatmentY), 150);
      return next;
    });
  };

  const toggleTreatment = (item: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedTreatments(prev => {
      if (item === 'None') return prev.includes('None') ? [] : ['None'];
      const without = prev.filter(tr => tr !== 'None');
      const next = without.includes(item) ? without.filter(tr => tr !== item) : [...without, item];
      if (!prev.length && next.length === 1) setTimeout(() => scrollTo(medicalY), 150);
      return next;
    });
  };

  const pickBusinessType = (type: NonNullable<typeof data.businessType> | '') => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedBusinessType(type);
  };

  const toggleService = (category: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedServices(prev => prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]);
  };

  const pickPriceRange = (range: NonNullable<typeof data.priceRange> | '') => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedPriceRange(prev => prev === range ? '' : range);
  };

  const pickTeamSize = (size: NonNullable<typeof data.teamSize> | '') => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedTeamSize(prev => prev === size ? '' : size);
  };

  const toggleContactMethod = (method: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedContactMethods(prev => prev.includes(method) ? prev.filter(m => m !== method) : [...prev, method]);
  };

  const togglePaymentMethod = (method: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedPaymentMethods(prev => prev.includes(method) ? prev.filter(m => m !== method) : [...prev, method]);
  };

  const saveAndProceed = () => {
    if (isProvider) {
      updateData({
        businessType: selectedBusinessType,
        serviceInterests: selectedServices,
        serviceLocations: selectedLocations,
        priceRange: selectedPriceRange,
        teamSize: selectedTeamSize,
        preferredContactMethods: selectedContactMethods,
        preferredPaymentMethods: selectedPaymentMethods,
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
        !selectedBusinessType          ? businessTypeY :
        !selectedServices.length      ? servicesY :
        !selectedLocations.length     ? locationY :
        !selectedPriceRange           ? priceRangeY :
        !selectedTeamSize             ? teamSizeY :
        !selectedContactMethods.length ? contactMethodsY :
        !selectedPaymentMethods.length ? paymentMethodsY :
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
        {/* Back */}
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: t.surface, borderColor: t.border }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); navigation.goBack(); }}
          activeOpacity={0.6}
        >
          <Text style={[styles.backIcon, { color: t.text }]}>{'<'}</Text>
        </TouchableOpacity>

        <StepProgressIndicator currentStep={4} totalSteps={totalSteps} stepLabel={isProvider ? 'About Your Business' : 'Beauty Profile'} />

        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: t.text }]}>{isProvider ? 'About Your Business' : 'Beauty Profile'}</Text>
          <Text style={[styles.headerSubtitle, { color: t.sub }]}>
            {isProvider
              ? "The essentials clients and bookings need — you can refine the rest later in the app"
              : 'Help us match you with the right professionals'}
          </Text>
        </View>

        {isUser ? (
          <>
            {/* Hair Type */}
            <View onLayout={(e: LayoutChangeEvent) => { hairY.current = e.nativeEvent.layout.y; }}>
              <Text style={[styles.sectionLabel, { color: showErrors && !selectedHairType ? '#DC2626' : t.text }]}>
                HAIR TYPE{showErrors && !selectedHairType ? '  — required' : ''}
              </Text>
              <Text style={[styles.sectionSub, { color: t.sub }]}>What's your hair texture?</Text>
              <View style={styles.chipsContainer}>
                {HAIR_TYPES.map(type => (
                  <TouchableOpacity key={type} style={chipStyle(selectedHairType === type)} onPress={() => pickHair(type)} activeOpacity={0.6}>
                    <Text style={chipTextStyle(selectedHairType === type)}>{type}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Skin Type */}
            <View onLayout={(e: LayoutChangeEvent) => { skinY.current = e.nativeEvent.layout.y; }}>
              <Text style={[styles.sectionLabel, { color: showErrors && !selectedSkinType ? '#DC2626' : t.text }]}>
                SKIN TYPE{showErrors && !selectedSkinType ? '  — required' : ''}
              </Text>
              <Text style={[styles.sectionSub, { color: t.sub }]}>How would you describe your skin?</Text>
              <View style={styles.chipsContainer}>
                {SKIN_TYPES.map(type => (
                  <TouchableOpacity key={type} style={chipStyle(selectedSkinType === type)} onPress={() => pickSkin(type)} activeOpacity={0.6}>
                    <Text style={chipTextStyle(selectedSkinType === type)}>{type}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Skin Concerns */}
            <View onLayout={(e: LayoutChangeEvent) => { skinConcernsY.current = e.nativeEvent.layout.y; }}>
              <Text style={[styles.sectionLabel, { color: showErrors && !selectedConcerns.length ? '#DC2626' : t.text }]}>
                SKIN CONCERNS{showErrors && !selectedConcerns.length ? '  — required' : ''}
              </Text>
              <Text style={[styles.sectionSub, { color: t.sub }]}>Any specific concerns you'd like addressed?</Text>
              <View style={styles.chipsContainer}>
                {SKIN_CONCERNS.map(item => (
                  <TouchableOpacity key={item} style={chipStyle(selectedConcerns.includes(item))} onPress={() => toggleConcern(item)} activeOpacity={0.6}>
                    <Text style={chipTextStyle(selectedConcerns.includes(item))}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Style Vibe */}
            <View onLayout={(e: LayoutChangeEvent) => { styleVibeY.current = e.nativeEvent.layout.y; }}>
              <Text style={[styles.sectionLabel, { color: showErrors && !selectedStyleVibe ? '#DC2626' : t.text }]}>
                STYLE VIBE{showErrors && !selectedStyleVibe ? '  — required' : ''}
              </Text>
              <Text style={[styles.sectionSub, { color: t.sub }]}>What best describes your aesthetic?</Text>
              <View style={styles.chipsContainer}>
                {STYLE_VIBES.map(vibe => (
                  <TouchableOpacity key={vibe} style={chipStyle(selectedStyleVibe === vibe)} onPress={() => pickStyleVibe(vibe)} activeOpacity={0.6}>
                    <Text style={chipTextStyle(selectedStyleVibe === vibe)}>{vibe}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Allergies */}
            <View onLayout={(e: LayoutChangeEvent) => { allergyY.current = e.nativeEvent.layout.y; }}>
              <Text style={[styles.sectionLabel, { color: showErrors && !selectedAllergens.length ? '#DC2626' : t.text }]}>
                ALLERGIES{showErrors && !selectedAllergens.length ? '  — required' : ''}
              </Text>
              <Text style={[styles.sectionSub, { color: t.sub }]}>
                Select any known allergies or sensitivities
              </Text>
              <View style={[styles.allergyNote, { backgroundColor: isDarkMode ? 'rgba(255,204,0,0.08)' : 'rgba(255,204,0,0.10)', borderColor: 'rgba(255,204,0,0.2)' }]}>
                <Text style={[styles.allergyNoteText, { color: isDarkMode ? '#FFD60A' : '#996600' }]}>
                  ⚠ This is shared with your providers before each appointment for your safety
                </Text>
              </View>
              <View style={styles.chipsContainer}>
                {ALLERGENS.map(item => (
                  <TouchableOpacity
                    key={item}
                    style={chipStyle(selectedAllergens.includes(item))}
                    onPress={() => toggleAllergen(item)}
                    activeOpacity={0.6}
                  >
                    <Text style={chipTextStyle(selectedAllergens.includes(item))}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Treatment History */}
            <View onLayout={(e: LayoutChangeEvent) => { treatmentY.current = e.nativeEvent.layout.y; }}>
              <Text style={[styles.sectionLabel, { color: showErrors && !selectedTreatments.length ? '#DC2626' : t.text }]}>
                TREATMENT HISTORY{showErrors && !selectedTreatments.length ? '  — required' : ''}
              </Text>
              <Text style={[styles.sectionSub, { color: t.sub }]}>What treatments have you had before?</Text>
              <View style={styles.chipsContainer}>
                {TREATMENT_HISTORY.map(item => (
                  <TouchableOpacity key={item} style={chipStyle(selectedTreatments.includes(item))} onPress={() => toggleTreatment(item)} activeOpacity={0.6}>
                    <Text style={chipTextStyle(selectedTreatments.includes(item))}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Medical Notes */}
            <View onLayout={(e: LayoutChangeEvent) => { medicalY.current = e.nativeEvent.layout.y; }}>
              <Text style={[styles.sectionLabel, { color: t.text }]}>MEDICAL NOTES</Text>
              <Text style={[styles.sectionSub, { color: t.sub }]}>
                Any conditions your provider should know about (optional)
              </Text>
              <View style={[styles.textAreaWrap, { backgroundColor: t.surface, borderColor: t.border }]}>
                <TextInput
                  style={[styles.textArea, { color: t.text }]}
                  value={medicalNotes}
                  onChangeText={setMedicalNotes}
                  placeholder="e.g. Rosacea, eczema, pregnancy..."
                  placeholderTextColor={t.sub}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>
            </View>

            {/* Photography Consent */}
            <View
              onLayout={(e: LayoutChangeEvent) => { consentY.current = e.nativeEvent.layout.y; }}
              style={[styles.consentRow, { backgroundColor: t.card, borderColor: t.border }]}
            >
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[styles.consentTitle, { color: t.text }]}>Photography Consent</Text>
                <Text style={[styles.consentSub, { color: t.sub }]}>
                  Allow your provider to photograph your results for their portfolio
                </Text>
              </View>
              <Switch
                value={photoConsent}
                onValueChange={v => { Haptics.selectionAsync().catch(() => {}); setPhotoConsent(v); }}
                trackColor={{ false: '#D1D1D6', true: t.accent }}
                thumbColor={photoConsent ? '#fff' : '#f4f3f4'}
              />
            </View>
          </>
        ) : (
          <>
            {/* Business type */}
            <View onLayout={(e: LayoutChangeEvent) => { businessTypeY.current = e.nativeEvent.layout.y; }}>
              <Text style={[styles.sectionLabel, { color: showErrors && !selectedBusinessType ? '#DC2626' : t.text }]}>
                BUSINESS TYPE{showErrors && !selectedBusinessType ? '  — required' : ''}
              </Text>
              <Text style={[styles.sectionSub, { color: t.sub }]}>How do you run your business?</Text>
              <View style={styles.chipsContainer}>
                {BUSINESS_TYPES.map(({ v, l }) => (
                  <TouchableOpacity key={v} style={chipStyle(selectedBusinessType === v)} onPress={() => pickBusinessType(v)} activeOpacity={0.6}>
                    <Text style={chipTextStyle(selectedBusinessType === v)}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Services you offer */}
            <View onLayout={(e: LayoutChangeEvent) => { servicesY.current = e.nativeEvent.layout.y; }}>
              <Text style={[styles.sectionLabel, { color: showErrors && !selectedServices.length ? '#DC2626' : t.text }]}>
                SERVICES YOU OFFER{showErrors && !selectedServices.length ? '  — required' : ''}
              </Text>
              <Text style={[styles.sectionSub, { color: t.sub }]}>Select all categories that apply to your business</Text>
              <View style={styles.chipsContainer}>
                {SERVICE_CATEGORIES.map(category => (
                  <TouchableOpacity key={category} style={chipStyle(selectedServices.includes(category))} onPress={() => toggleService(category)} activeOpacity={0.6}>
                    <Text style={chipTextStyle(selectedServices.includes(category))}>{category}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Where you work */}
            <View
              onLayout={(e: LayoutChangeEvent) => { locationY.current = e.nativeEvent.layout.y; }}
              style={{ marginBottom: 32 }}
            >
              <Text style={[styles.sectionLabel, { color: showErrors && !selectedLocations.length ? '#DC2626' : t.text }]}>
                WHERE YOU WORK{showErrors && !selectedLocations.length ? '  — required' : ''}
              </Text>
              <Text style={[styles.sectionSub, { color: t.sub }]}>Which cities do you cover?</Text>
              <CityMultiSelect
                selected={selectedLocations}
                onChange={setSelectedLocations}
                palette={t}
                placeholder="Select the cities you cover"
              />
            </View>

            {/* Price range */}
            <View onLayout={(e: LayoutChangeEvent) => { priceRangeY.current = e.nativeEvent.layout.y; }}>
              <Text style={[styles.sectionLabel, { color: showErrors && !selectedPriceRange ? '#DC2626' : t.text }]}>
                PRICE RANGE{showErrors && !selectedPriceRange ? '  — required' : ''}
              </Text>
              <Text style={[styles.sectionSub, { color: t.sub }]}>Where do most of your services sit?</Text>
              <View style={styles.chipsContainer}>
                {PRICE_RANGES.map(({ v, l }) => (
                  <TouchableOpacity key={v} style={chipStyle(selectedPriceRange === v)} onPress={() => pickPriceRange(v)} activeOpacity={0.6}>
                    <Text style={chipTextStyle(selectedPriceRange === v)}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Who you work with */}
            <View onLayout={(e: LayoutChangeEvent) => { teamSizeY.current = e.nativeEvent.layout.y; }}>
              <Text style={[styles.sectionLabel, { color: showErrors && !selectedTeamSize ? '#DC2626' : t.text }]}>
                WHO YOU WORK WITH{showErrors && !selectedTeamSize ? '  — required' : ''}
              </Text>
              <Text style={[styles.sectionSub, { color: t.sub }]}>Are you solo or part of a team?</Text>
              <View style={styles.chipsContainer}>
                {TEAM_SIZES.map(({ v, l }) => (
                  <TouchableOpacity key={v} style={chipStyle(selectedTeamSize === v)} onPress={() => pickTeamSize(v)} activeOpacity={0.6}>
                    <Text style={chipTextStyle(selectedTeamSize === v)}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Contact preferences */}
            <View onLayout={(e: LayoutChangeEvent) => { contactMethodsY.current = e.nativeEvent.layout.y; }}>
              <Text style={[styles.sectionLabel, { color: showErrors && !selectedContactMethods.length ? '#DC2626' : t.text }]}>
                CONTACT PREFERENCES{showErrors && !selectedContactMethods.length ? '  — required' : ''}
              </Text>
              <Text style={[styles.sectionSub, { color: t.sub }]}>How should clients reach you?</Text>
              <View style={styles.chipsContainer}>
                {CONTACT_METHODS.map(({ v, l }) => (
                  <TouchableOpacity key={v} style={chipStyle(selectedContactMethods.includes(v))} onPress={() => toggleContactMethod(v)} activeOpacity={0.6}>
                    <Text style={chipTextStyle(selectedContactMethods.includes(v))}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Preferred payment type */}
            <View onLayout={(e: LayoutChangeEvent) => { paymentMethodsY.current = e.nativeEvent.layout.y; }}>
              <Text style={[styles.sectionLabel, { color: showErrors && !selectedPaymentMethods.length ? '#DC2626' : t.text }]}>
                PREFERRED PAYMENT TYPE{showErrors && !selectedPaymentMethods.length ? '  — required' : ''}
              </Text>
              <Text style={[styles.sectionSub, { color: t.sub }]}>How do you take payment for off-app services?</Text>
              <View style={styles.chipsContainer}>
                {PAYMENT_METHODS.map(({ v, l }) => (
                  <TouchableOpacity key={v} style={chipStyle(selectedPaymentMethods.includes(v))} onPress={() => togglePaymentMethod(v)} activeOpacity={0.6}>
                    <Text style={chipTextStyle(selectedPaymentMethods.includes(v))}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

          </>
        )}

        {/* Continue */}
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={[styles.continueBtn, { backgroundColor: t.accent }]}
            onPress={handleContinue}
            activeOpacity={0.75}
          >
            <Text style={styles.continueBtnText}>CONTINUE</Text>
          </TouchableOpacity>
          {isUser && (
            <TouchableOpacity style={styles.skipBtn} onPress={saveAndProceed} activeOpacity={0.6}>
              <Text style={[styles.skipText, { color: t.sub }]}>Skip for now</Text>
            </TouchableOpacity>
          )}
        </View>
        </ScrollView>
      </KeyboardDismissView>
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
  sectionSub: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, marginBottom: 12, lineHeight: 18 },
  allergyNote: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  allergyNoteText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, lineHeight: 18 },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 32 },
  textAreaWrap: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 32,
  },
  textArea: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 15,
    letterSpacing: 0.3,
    minHeight: 72,
    padding: 0,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 32,
  },
  consentTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 14, letterSpacing: 0.3, marginBottom: 4 },
  consentSub: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, lineHeight: 17 },
  actionsSection: { alignItems: 'center' },
  continueBtn: { borderRadius: 100, paddingVertical: 15, alignItems: 'center', width: '100%' },
  continueBtnText: { fontFamily: 'BakbakOne-Regular', fontSize: 15, letterSpacing: 1, color: '#FFFFFF' },
  skipBtn: { marginTop: 16, paddingVertical: 8 },
  skipText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '600' },
});
