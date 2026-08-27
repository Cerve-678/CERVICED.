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

/**
 * The general area a client is in — NOT their street address.
 *
 * These are two different questions and the app asks both:
 *   AddressPicker  -> the exact venue, geocoded, RLS-gated until a provider
 *                     accepts (booking_client_addresses).
 *   AreaPicker     -> the coarse area, visible to a mobile provider the moment
 *                     the request arrives so they can judge travel distance
 *                     BEFORE deciding (bookings.client_area).
 *
 * It mirrors the provider side, where `providers.location_text` is the public
 * coarse area and the full address is gated behind provider_private_details.
 *
 * Composes "<Area>, <City>" — the same shape LocationPicker composes for
 * providers, so both hats' coarse locations read identically. That picker is
 * not reused directly: it takes 22 style keys from InfoRegScreen's stylesheet
 * as an untyped `styles` prop, so lifting it here would drag a screen's
 * styling across a feature boundary. The DATA (CITY_AREAS) is shared instead,
 * which is the part that actually matters for the two to agree.
 */

export type AreaPickerProps = {
  /** Saved value — always a plain string, "<Area>, <City>" when this picker composed it. */
  value: string;
  onChange: (area: string) => void;
  accentColor?: string;
  disabled?: boolean;
};

type Step = 'city' | 'region' | 'area';

export default function AreaPicker({
  value,
  onChange,
  accentColor = '#AF9197',
  disabled,
}: AreaPickerProps) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<Step>('city');
  const [city, setCity] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const cities = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CITY_AREA_NAMES;
    return CITY_AREA_NAMES.filter(name => name.toLowerCase().includes(q));
  }, [query]);

  const cityData = city ? getCityAreaData(city) : undefined;
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
    setStep('region');
  };

  const pickRegion = (name: string) => {
    Haptics.selectionAsync().catch(() => {});
    setRegion(name);
    setStep('area');
  };

  const pickArea = (name: string) => {
    Haptics.selectionAsync().catch(() => {});
    onChange(city ? `${name}, ${city}` : name);
    setVisible(false);
  };

  const back = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (step === 'area') setStep('region');
    else if (step === 'region') setStep('city');
  };

  const heading =
    step === 'city'
      ? 'Which city are you in?'
      : step === 'region'
        ? `Whereabouts in ${city}?`
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

      <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
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
                  <Text style={styles.subtitle}>
                    Shown to a provider who travels to you, so they can check the
                    distance before accepting. Your full address stays hidden
                    until they do.
                  </Text>
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

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.results}>
              {step === 'city' &&
                cities.map(name => (
                  <TouchableOpacity key={name} style={styles.row} onPress={() => pickCity(name)}>
                    <Text style={styles.rowText}>{name}</Text>
                    <Ionicons name="chevron-forward" size={17} color="#8B8B95" />
                  </TouchableOpacity>
                ))}

              {step === 'city' && cities.length === 0 ? (
                <Text style={styles.empty}>
                  No matching city. Your area picker only covers the cities
                  CERVICED currently lists.
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

              {step === 'area' &&
                regionData?.areas.map(a => (
                  <TouchableOpacity key={a} style={styles.row} onPress={() => pickArea(a)}>
                    <Text style={styles.rowText}>{a}</Text>
                    <Ionicons name="chevron-forward" size={17} color={accentColor} />
                  </TouchableOpacity>
                ))}
            </ScrollView>
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
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
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
});
