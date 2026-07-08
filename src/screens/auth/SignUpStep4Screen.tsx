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

type Props = StackScreenProps<RootStackParamList, 'SignUpStep4'>;

const HAIR_TYPES        = ['Straight', 'Wavy', 'Curly', 'Coily', '4A', '4B', '4C'];
const SKIN_TYPES        = ['Normal', 'Oily', 'Dry', 'Combination', 'Sensitive'];
const SKIN_CONCERNS     = ['Acne', 'Redness', 'Dry patches', 'Oiliness', 'Hyperpigmentation', 'Sensitivity', 'Fine lines', 'Uneven tone', 'None'];
const STYLE_VIBES       = ['Natural', 'Glam', 'Minimal', 'Bold', 'Classic', 'Edgy', 'Soft', 'Trendy'];
const ALLERGENS         = ['Latex', 'Fragrances', 'Dyes / PPD', 'Nuts', 'Nickel', 'Sulfates', 'Parabens', 'Lanolin', 'Shellfish', 'Gluten', 'None known'];
const TREATMENT_HISTORY = ['Facials', 'Lash extensions', 'Brow tinting', 'Hair colour', 'Nails', 'Waxing', 'Dermaplaning', 'Microneedling', 'Chemical peels', 'None'];

const L = { bg: '#F5F1EC', surface: '#EDE8E2', card: '#FFFFFF', accent: '#AF9197', text: '#000000', sub: '#7E6667', border: 'rgba(126,102,103,0.14)' };
const D = { bg: '#1A1815', surface: '#201D1A', card: '#252220', accent: '#AF9197', text: '#F0ECE7', sub: '#7E6667', border: 'rgba(126,102,103,0.18)' };

export default function SignUpStep4Screen({ navigation }: Props) {
  const { isDarkMode } = useTheme();
  const t = isDarkMode ? D : L;
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

  const [selectedHairType,   setSelectedHairType]   = useState<string>(data.hairType);
  const [selectedSkinType,   setSelectedSkinType]   = useState<string>(data.skinType);
  const [selectedConcerns,   setSelectedConcerns]   = useState<string[]>(data.skinConcerns);
  const [selectedStyleVibe,  setSelectedStyleVibe]  = useState<string>(data.styleVibe);
  const [selectedAllergens,  setSelectedAllergens]  = useState<string[]>(data.allergies);
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>(data.treatmentHistory);
  const [medicalNotes,       setMedicalNotes]       = useState<string>(data.medicalNotes);
  const [photoConsent,       setPhotoConsent]       = useState<boolean>(data.photographyConsent);
  const [showErrors,         setShowErrors]         = useState(false);

  const isUser = data.accountType === 'user';

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

  const saveAndProceed = () => {
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    navigation.navigate('SignUpStep5');
  };

  const handleContinue = () => {
    if (!isUser) { saveAndProceed(); return; }
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

        <StepProgressIndicator currentStep={4} totalSteps={totalSteps} />

        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: t.text }]}>Beauty Profile</Text>
          <Text style={[styles.headerSubtitle, { color: t.sub }]}>
            {isUser
              ? 'Help us match you with the right professionals'
              : 'You can set up your full profile later in the app'}
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
          <View style={[styles.summaryCard, { backgroundColor: t.card, borderColor: t.border }]}>
            {[
              { label: 'Name', value: data.name },
              { label: 'Business', value: data.businessName },
              { label: 'Email', value: data.businessEmail },
            ].map((row, i) => (
              <View key={row.label} style={[styles.summaryRow, i < 2 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border }]}>
                <Text style={[styles.summaryLabel, { color: t.sub }]}>{row.label}</Text>
                <Text style={[styles.summaryValue, { color: t.text }]}>{row.value}</Text>
              </View>
            ))}
          </View>
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
  summaryCard: { borderRadius: 20, borderWidth: 1, padding: 20, marginBottom: 32 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  summaryLabel: { fontFamily: 'BakbakOne-Regular', fontSize: 12, letterSpacing: 1 },
  summaryValue: { fontFamily: 'Jura-VariableFont_wght', fontSize: 15, fontWeight: '600' },
  actionsSection: { alignItems: 'center' },
  continueBtn: { borderRadius: 100, paddingVertical: 15, alignItems: 'center', width: '100%' },
  continueBtnText: { fontFamily: 'BakbakOne-Regular', fontSize: 15, letterSpacing: 1, color: '#FFFFFF' },
  skipBtn: { marginTop: 16, paddingVertical: 8 },
  skipText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '600' },
});
