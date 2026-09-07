import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CITY_AREA_NAMES, getCityAreaData } from '../data/cityAreas';
import { BOTTOM_SAFE_GAP } from '../utils/bottomSafeGap';

/**
 * Stepped city → region → area picker, composing "<Area>, <City>".
 *
 * Used by BOTH hats for the coarse-location question:
 *   - client Account "Your area"       -> users.client_area
 *   - provider InfoReg "Where you're based" -> providers.location_text (geocoded)
 *
 * It is deliberately the ONE component for this — a client's "Camden, London"
 * and a provider's "Camden, London" mean the same thing, and there is no second
 * picker to drift from. Distinct from AddressPicker, which captures the exact,
 * geocoded, RLS-gated street address (booking_client_addresses /
 * provider_private_details).
 *
 * Every step has an "Other…" escape hatch: a provider whose town isn't one of
 * the ~60 structured cities still has to be able to set a location to go live,
 * and a client whose area isn't listed still needs to answer the question.
 */

export type AreaPickerProps = {
  /** Saved value — always a plain string, "<Area>, <City>" when this picker composed it. */
  value: string;
  onChange: (area: string) => void;
  accentColor?: string;
  disabled?: boolean;
  /** Explanatory line under the modal heading. Defaults to the client wording. */
  subtitle?: string;
};

type Step = 'city' | 'region' | 'area';

/** Sentinel for "my city isn't one of the structured ones" — a non-city
 *  string so it can never collide with a real CITY_AREA_NAMES entry. */
const OTHER_CITY = '__other__';

const DEFAULT_SUBTITLE =
  'Shown to a provider who travels to you, so they can check the distance ' +
  'before accepting. Your full address stays hidden until they do.';

export default function AreaPicker({
  value,
  onChange,
  accentColor = '#AF9197',
  disabled,
  subtitle = DEFAULT_SUBTITLE,
}: AreaPickerProps) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<Step>('city');
  const [city, setCity] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // Free-text entry on the 'area' step: reached via "Other city…" (unlisted
  // city) or "Other…" on the area list (unlisted area within a known city).
  const [freeText, setFreeText] = useState('');
  const [areaOther, setAreaOther] = useState(false);

  const cities = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CITY_AREA_NAMES;
    return CITY_AREA_NAMES.filter(name => name.toLowerCase().includes(q));
  }, [query]);

  const cityData = city && city !== OTHER_CITY ? getCityAreaData(city) : undefined;
  const regionData = useMemo(
    () => cityData?.regions.find(r => r.region === region),
    [cityData, region],
  );

  const open = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // Always restart at the city step rather than resuming a half-finished
    // selection from last time — a picker that opens mid-flow with no visible
    // reason why is the kind of state bug that reads as a glitch.
    setStep('city');
    setCity(null);
    setRegion(null);
    setQuery('');
    setFreeText('');
    setAreaOther(false);
    setVisible(true);
  };

  const close = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setVisible(false);
  };

  const pickCity = (name: string) => {
    Haptics.selectionAsync().catch(() => {});
    setCity(name);
    setRegion(null);
    setAreaOther(false);
    setStep('region');
  };

  const pickOtherCity = () => {
    Haptics.selectionAsync().catch(() => {});
    setCity(OTHER_CITY);
    setRegion(null);
    setAreaOther(false);
    setFreeText('');
    setStep('area');
  };

  const pickRegion = (name: string) => {
    Haptics.selectionAsync().catch(() => {});
    setRegion(name);
    setAreaOther(false);
    setStep('area');
  };

  const pickArea = (name: string) => {
    Haptics.selectionAsync().catch(() => {});
    onChange(city && city !== OTHER_CITY ? `${name}, ${city}` : name);
    setVisible(false);
  };

  const startAreaOther = () => {
    Haptics.selectionAsync().catch(() => {});
    setFreeText('');
    setAreaOther(true);
  };

  // Unlisted city → the typed string is the whole answer (it names its own
  // town). Unlisted area within a known city → anchor it onto that city so
  // what's stored stays geocodable.
  const confirmFreeText = () => {
    const t = freeText.trim();
    if (!t) return;
    Haptics.selectionAsync().catch(() => {});
    onChange(city && city !== OTHER_CITY ? `${t}, ${city}` : t);
    setVisible(false);
  };

  const back = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (step === 'area') {
      if (areaOther) { setAreaOther(false); return; }
      if (city === OTHER_CITY) { setCity(null); setStep('city'); return; }
      setStep('region');
    } else if (step === 'region') {
      setStep('city');
    }
  };

  const freeTextMode = step === 'area' && (city === OTHER_CITY || areaOther);

  const heading =
    step === 'city'
      ? 'Which city are you in?'
      : step === 'region'
        ? `Whereabouts in ${city}?`
        : city === OTHER_CITY
          ? 'Where are you based?'
          : `Pick your area in ${region}`;

  return (
    <>
      <TouchableOpacity
        style={[styles.field, disabled && styles.disabled]}
        onPress={open}
        disabled={disabled}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="Choose your area"
      >
        <Ionicons name="map-outline" size={20} color={accentColor} />
        <Text style={[styles.fieldText, !value && styles.placeholder]} numberOfLines={2}>
          {value || 'Select your area'}
        </Text>
        <Ionicons name="chevron-forward" size={18} color="#8B8B95" />
      </TouchableOpacity>

      <Modal visible={visible} animationType="slide" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={close} />
          <View style={styles.sheet}>
            <View style={styles.handle} />

            <View style={styles.header}>
              <View style={styles.headingWrap}>
                {step !== 'city' ? (
                  <TouchableOpacity
                    onPress={back}
                    hitSlop={12}
                    accessibilityLabel="Go back a step"
                    style={styles.backBtn}
                  >
                    <Ionicons name="chevron-back" size={20} color="#1C1C1E" />
                  </TouchableOpacity>
                ) : null}
                <View style={styles.headingText}>
                  <Text style={styles.title}>{heading}</Text>
                  <Text style={styles.subtitle}>{subtitle}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={close} hitSlop={12} accessibilityLabel="Close area picker">
                <Ionicons name="close" size={24} color="#1C1C1E" />
              </TouchableOpacity>
            </View>

            {step === 'city' ? (
              <View style={styles.searchRow}>
                <Ionicons name="search" size={20} color="#6B6B73" />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="London"
                  placeholderTextColor="#8B8B95"
                  style={styles.input}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View>
            ) : null}

            {freeTextMode ? (
              <View style={styles.freeWrap}>
                <TextInput
                  value={freeText}
                  onChangeText={setFreeText}
                  placeholder={city === OTHER_CITY ? 'e.g. North West London' : 'e.g. Chinatown'}
                  placeholderTextColor="#8B8B95"
                  style={styles.freeInput}
                  autoCapitalize="words"
                  autoCorrect={false}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={confirmFreeText}
                />
                <TouchableOpacity
                  style={[styles.confirmBtn, { backgroundColor: accentColor }, !freeText.trim() && styles.confirmDisabled]}
                  onPress={confirmFreeText}
                  disabled={!freeText.trim()}
                  activeOpacity={0.85}
                >
                  <Text style={styles.confirmBtnText}>Use this area</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.results}>
                {step === 'city' && (
                  <TouchableOpacity
                    style={[styles.otherRow, { borderColor: accentColor }]}
                    onPress={pickOtherCity}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="create-outline" size={17} color={accentColor} />
                    <Text style={[styles.otherRowText, { color: accentColor }]}>Other city…</Text>
                  </TouchableOpacity>
                )}

                {step === 'city' &&
                  cities.map(name => (
                    <TouchableOpacity key={name} style={styles.row} onPress={() => pickCity(name)}>
                      <Text style={styles.rowText}>{name}</Text>
                      <Ionicons name="chevron-forward" size={17} color="#8B8B95" />
                    </TouchableOpacity>
                  ))}

                {step === 'city' && cities.length === 0 ? (
                  <Text style={styles.empty}>
                    No matching city — tap "Other city…" above to enter your area
                    manually.
                  </Text>
                ) : null}

                {step === 'region' &&
                  cityData?.regions.map(r => (
                    <TouchableOpacity
                      key={r.region}
                      style={styles.row}
                      onPress={() => pickRegion(r.region)}
                    >
                      <Text style={styles.rowText}>{r.region}</Text>
                      <Ionicons name="chevron-forward" size={17} color="#8B8B95" />
                    </TouchableOpacity>
                  ))}

                {step === 'area' && (
                  <>
                    {regionData?.areas.map(a => (
                      <TouchableOpacity key={a} style={styles.row} onPress={() => pickArea(a)}>
                        <Text style={styles.rowText}>{a}</Text>
                        <Ionicons name="chevron-forward" size={17} color={accentColor} />
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={[styles.otherRow, { borderColor: accentColor }]}
                      onPress={startAreaOther}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="create-outline" size={17} color={accentColor} />
                      <Text style={[styles.otherRowText, { color: accentColor }]}>Other…</Text>
                    </TouchableOpacity>
                  </>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: { minHeight: 54, borderWidth: 1, borderColor: 'rgba(60,60,67,0.18)', borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.62)', paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  disabled: { opacity: 0.5 },
  fieldText: { flex: 1, color: '#1C1C1E', fontSize: 15, lineHeight: 20 },
  placeholder: { color: '#8B8B95' },
  modalRoot: { flex: 1, justifyContent: 'flex-end', paddingBottom: BOTTOM_SAFE_GAP },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.38)' },
  sheet: { maxHeight: '82%', minHeight: 430, backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20 },
  handle: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: '#D1D1D6', marginTop: 10, marginBottom: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  headingWrap: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  backBtn: { paddingTop: 2 },
  headingText: { flex: 1 },
  title: { color: '#1C1C1E', fontSize: 20, fontWeight: '700' },
  subtitle: { marginTop: 4, color: '#6B6B73', fontSize: 13, lineHeight: 18 },
  searchRow: { marginTop: 20, minHeight: 52, borderRadius: 12, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#F2F2F7' },
  input: { flex: 1, color: '#1C1C1E', fontSize: 15, paddingVertical: 12 },
  results: { paddingTop: 14, paddingBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D1D1D6' },
  rowText: { flex: 1, color: '#1C1C1E', fontSize: 15, lineHeight: 21 },
  empty: { color: '#6B6B73', textAlign: 'center', marginTop: 30, fontSize: 14, lineHeight: 20 },
  // "Other…" escape hatch — dashed accent pill, set apart from the plain rows.
  otherRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 100, borderWidth: 1, borderStyle: 'dashed', marginTop: 12, marginBottom: 4 },
  otherRowText: { fontSize: 13, fontWeight: '700' },
  freeWrap: { paddingTop: 20, paddingBottom: 28, gap: 14 },
  freeInput: { minHeight: 52, borderRadius: 12, paddingHorizontal: 14, backgroundColor: '#F2F2F7', color: '#1C1C1E', fontSize: 15 },
  confirmBtn: { minHeight: 50, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  confirmDisabled: { opacity: 0.4 },
  confirmBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
});
