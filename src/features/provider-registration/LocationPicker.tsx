import React, { useMemo, useState } from 'react';
import {
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import {
  CITY_AREA_NAMES,
  getCityAreaData,
  type CityAreaData,
} from '../../data/cityAreas';

/** Sentinel for "my city isn't one of the structured ones" — chosen as a
 *  non-city string so it can never collide with a real CITY_AREA_NAMES entry. */
const OTHER_CITY = '__other__';

interface LocationPickerProps {
  /** The saved value — always a plain, geocodable string (`providerData.location`). */
  value: string;
  /** Called with the composed string. The data model is unchanged: a string in, a string out. */
  onChange: (location: string) => void;
  accentColor: string;
  blurTint: 'light' | 'dark';
  placeholderColor: string;
  iconColor: string;
  onFocus?: () => void;
  styles: any;
}

/** Splits a saved location string back into the picker's selections so an
 *  existing provider re-opening the editor sees their choice reflected rather
 *  than a blank picker. Only recognises strings this picker itself composes
 *  (`"<area>, <city>"`); anything else — including every location typed before
 *  this picker existed, and any custom-typed region/area — is treated as free
 *  text, which is the safe default. */
const parseSavedLocation = (
  saved: string,
): { city: string; region: string; area: string } | null => {
  const parts = saved.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  const [area, cityName] = parts;
  if (!area || !cityName) return null;
  const data = getCityAreaData(cityName);
  if (!data) return null;
  const match = data.regions.find(r =>
    r.areas.some(a => a.toLowerCase() === area.toLowerCase()),
  );
  if (!match) return null;
  return {
    city: data.city,
    region: match.region,
    area: match.areas.find(a => a.toLowerCase() === area.toLowerCase()) ?? area,
  };
};

/** Chip-select row with a trailing "Other" chip, matching the convention
 *  already established in InfoRegScreen's TagSelectWithOther: "Other" is
 *  rendered as its own chip (not a value baked into `options`), and toggling
 *  it reveals a text field rather than adding "Other" itself as the answer. */
interface ChipSelectWithOtherProps {
  options: string[];
  selected: string;
  onSelect: (option: string) => void;
  otherActive: boolean;
  onToggleOther: () => void;
  accentColor: string;
  styles: any;
}
function ChipSelectWithOther({
  options,
  selected,
  onSelect,
  otherActive,
  onToggleOther,
  accentColor,
  styles,
}: ChipSelectWithOtherProps) {
  return (
    <View style={styles.chipGrid}>
      {options.map(option => {
        const active = selected === option;
        return (
          <TouchableOpacity
            key={option}
            style={[styles.chip, active && { backgroundColor: `${accentColor}2E`, borderColor: accentColor }]}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); onSelect(option); }}
          >
            <Text style={[styles.chipText, active && { color: accentColor }]}>{option}</Text>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity
        style={[styles.chip, otherActive && { backgroundColor: `${accentColor}2E`, borderColor: accentColor }]}
        onPress={() => { Haptics.selectionAsync().catch(() => {}); onToggleOther(); }}
      >
        <Text style={[styles.chipText, otherActive && { color: accentColor }]}>Other…</Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * Two-level location picker for the provider's public location.
 *
 * London / Manchester / Birmingham get a structured city → compass region →
 * named area flow; every other city falls back to exactly the free-text field
 * this replaced. Whatever route the provider takes, the value handed back is a
 * plain string written straight to `providerData.location` — the same field
 * `providerRegistrationService` geocodes with `Location.geocodeAsync` and saves
 * as `location_text`. Hence the composed format is `"<area>, <city>"`
 * (most-specific-first, no compass region): a real place a geocoder resolves,
 * rather than a label like "Camden, North London, London" that reads well but
 * geocodes worse.
 */
export function LocationPicker({
  value,
  onChange,
  accentColor,
  blurTint,
  placeholderColor,
  iconColor,
  onFocus,
  styles,
}: LocationPickerProps) {
  const saved = useMemo(() => parseSavedLocation(value), [value]);

  // Transient picker state, deliberately separate from providerData: nothing
  // reaches `location` until there's a complete, geocodable string to write.
  // A value that didn't come from this picker starts in the free-text mode it
  // was typed in, so re-opening the editor never silently discards it.
  const [city, setCity] = useState<string>(
    saved ? saved.city : value.trim() ? OTHER_CITY : '',
  );
  const [region, setRegion] = useState<string>(saved?.region ?? '');
  const [area, setArea] = useState<string>(saved?.area ?? '');
  const [cityModalVisible, setCityModalVisible] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  // "Other…" chip state for the region/area steps — separate booleans (not a
  // sentinel stuffed into `region`/`area`) so a typed value can compose
  // immediately without fighting a placeholder value in the same field.
  const [regionOtherActive, setRegionOtherActive] = useState(false);
  const [areaOtherActive, setAreaOtherActive] = useState(false);
  const [customRegionText, setCustomRegionText] = useState('');
  const [customAreaText, setCustomAreaText] = useState('');

  const cityData: CityAreaData | undefined =
    city && city !== OTHER_CITY ? getCityAreaData(city) : undefined;
  const regionAreas =
    cityData?.regions.find(r => r.region === region)?.areas ?? [];

  const filteredCityNames = useMemo(() => {
    const q = citySearch.trim().toLowerCase();
    if (!q) return CITY_AREA_NAMES;
    return CITY_AREA_NAMES.filter(name => name.toLowerCase().includes(q));
  }, [citySearch]);

  const resetBelowCity = () => {
    setRegion('');
    setArea('');
    setRegionOtherActive(false);
    setAreaOtherActive(false);
    setCustomRegionText('');
    setCustomAreaText('');
  };

  const selectCity = (nextCity: string) => {
    setCity(nextCity);
    resetBelowCity();
    setCityModalVisible(false);
    setCitySearch('');
    // Clears the composed value: the previous city's area no longer
    // describes where this provider is, and leaving it behind would let a
    // stale location survive a city change.
    onChange('');
  };

  const selectRegion = (nextRegion: string) => {
    const same = region === nextRegion && !regionOtherActive;
    setRegion(same ? '' : nextRegion);
    setRegionOtherActive(false);
    setArea('');
    setAreaOtherActive(false);
    setCustomAreaText('');
    onChange('');
  };

  const toggleRegionOther = () => {
    setRegionOtherActive(v => !v);
    setRegion('');
    setArea('');
    setAreaOtherActive(false);
    setCustomAreaText('');
    onChange('');
  };

  // Typing a custom region composes nothing by itself (a region alone isn't
  // specific enough to geocode) — the "Where in <region>?" step below still
  // needs an area. Kept out of `onChange` until that area exists.
  const onCustomRegionChangeText = (text: string) => {
    setCustomRegionText(text);
    setArea('');
    setAreaOtherActive(false);
    setCustomAreaText('');
    onChange('');
  };

  const selectArea = (nextArea: string) => {
    const same = area === nextArea && !areaOtherActive;
    setAreaOtherActive(false);
    if (same) {
      setArea('');
      onChange('');
      return;
    }
    setArea(nextArea);
    // Most-specific-first, so the geocoder gets a real address-like string.
    onChange(cityData ? `${nextArea}, ${cityData.city}` : nextArea);
  };

  const toggleAreaOther = () => {
    setAreaOtherActive(v => !v);
    setArea('');
    onChange('');
  };

  // Typing a custom area composes immediately, same as tapping a listed
  // chip — the city (already chosen) still anchors the geocoded string.
  const onCustomAreaChangeText = (text: string) => {
    setCustomAreaText(text);
    onChange(text.trim() && cityData ? `${text.trim()}, ${cityData.city}` : '');
  };

  const effectiveRegionLabel = regionOtherActive ? customRegionText.trim() : region;

  const cityLabel =
    city === OTHER_CITY ? 'Another city' : city || 'Choose your city';

  return (
    <>
      <TouchableOpacity
        style={styles.locationSelectRow}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setCityModalVisible(true); }}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Choose your city"
      >
        <Text
          style={[
            styles.locationSelectText,
            !city && { color: placeholderColor },
          ]}
        >
          {cityLabel}
        </Text>
        <Ionicons name="chevron-down" size={16} color={iconColor} />
      </TouchableOpacity>

      {/* Structured cities: region first, then the areas within it. Both
          steps end with an "Other…" chip for a region/area this city's data
          doesn't list — picking it reveals a text field for just that one
          piece, which still composes onto the already-chosen city. */}
      {cityData && (
        <>
          <Text style={styles.locationStepLabel}>Area of {cityData.city}</Text>
          <ChipSelectWithOther
            options={cityData.regions.map(r => r.region)}
            selected={region}
            onSelect={selectRegion}
            otherActive={regionOtherActive}
            onToggleOther={toggleRegionOther}
            accentColor={accentColor}
            styles={styles}
          />
          {regionOtherActive && (
            <BlurView
              intensity={15}
              tint={blurTint}
              style={[styles.inputBlur, styles.profileInputBox, { marginTop: 10 }]}
            >
              <TextInput
                style={styles.textInput}
                value={customRegionText}
                onChangeText={onCustomRegionChangeText}
                placeholder="e.g., North West"
                placeholderTextColor={placeholderColor}
                onFocus={onFocus}
              />
            </BlurView>
          )}
        </>
      )}

      {cityData && effectiveRegionLabel && !(regionOtherActive && !customRegionText.trim()) && (
        <>
          <Text style={styles.locationStepLabel}>Where in {effectiveRegionLabel}?</Text>
          {regionOtherActive ? (
            <BlurView
              intensity={15}
              tint={blurTint}
              style={[styles.inputBlur, styles.profileInputBox, { marginTop: 10 }]}
            >
              <TextInput
                style={styles.textInput}
                value={customAreaText}
                onChangeText={onCustomAreaChangeText}
                placeholder="e.g., Chinatown"
                placeholderTextColor={placeholderColor}
                onFocus={onFocus}
              />
            </BlurView>
          ) : (
            <>
              <ChipSelectWithOther
                options={regionAreas}
                selected={area}
                onSelect={selectArea}
                otherActive={areaOtherActive}
                onToggleOther={toggleAreaOther}
                accentColor={accentColor}
                styles={styles}
              />
              {areaOtherActive && (
                <BlurView
                  intensity={15}
                  tint={blurTint}
                  style={[styles.inputBlur, styles.profileInputBox, { marginTop: 10 }]}
                >
                  <TextInput
                    style={styles.textInput}
                    value={customAreaText}
                    onChangeText={onCustomAreaChangeText}
                    placeholder="e.g., Chinatown"
                    placeholderTextColor={placeholderColor}
                    onFocus={onFocus}
                  />
                </BlurView>
              )}
            </>
          )}
        </>
      )}

      {/* Unchanged free-text behaviour for every other city. */}
      {city === OTHER_CITY && (
        <BlurView
          intensity={15}
          tint={blurTint}
          style={[styles.inputBlur, styles.profileInputBox, { marginTop: 10 }]}
        >
          <TextInput
            style={styles.textInput}
            value={value}
            onChangeText={onChange}
            placeholder="e.g., North West London"
            placeholderTextColor={placeholderColor}
            onFocus={onFocus}
          />
        </BlurView>
      )}

      <Text style={styles.inputHint}>
        {cityData
          ? 'Shown on your public profile and used to place you in local searches.'
          : 'The town or area clients will see on your profile.'}
      </Text>

      <Modal
        visible={cityModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setCityModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <BlurView intensity={30} tint={blurTint} style={styles.templateSheet}>
            <SafeAreaView style={styles.modalSafeArea}>
              <View style={styles.sheetHandle} />
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Choose your city</Text>
                  <Text style={styles.templateSheetSub}>
                    Pick a city to narrow down to your area
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setCityModalVisible(false); }}
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              <BlurView
                intensity={15}
                tint={blurTint}
                style={[styles.inputBlur, styles.profileInputBox, { marginBottom: 12 }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <Ionicons name="search" size={16} color={iconColor} />
                  <TextInput
                    style={[styles.textInput, { flex: 1 }]}
                    value={citySearch}
                    onChangeText={setCitySearch}
                    placeholder="Search cities..."
                    placeholderTextColor={placeholderColor}
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                </View>
              </BlurView>

              <ScrollView
                style={styles.modalContent}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 24 }}
                keyboardShouldPersistTaps="handled"
              >
                {/* "Other city…" pinned at the top — typing your own town
                    shouldn't require scrolling past every structured city
                    first. Compact single-line row rather than a full card:
                    one option among many here, not the primary path. */}
                <TouchableOpacity
                  style={[localStyles.otherRow, { borderColor: accentColor }]}
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); selectCity(OTHER_CITY); }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="create-outline" size={16} color={accentColor} />
                  <Text style={[localStyles.otherRowText, { color: accentColor }]}>
                    Other city…
                  </Text>
                </TouchableOpacity>

                {filteredCityNames.map(name => (
                  <TouchableOpacity
                    key={name}
                    style={styles.templateCard}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); selectCity(name); }}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityState={{ selected: city === name }}
                  >
                    <Text style={[styles.templateName, { flex: 1 }]}>{name}</Text>
                    {city === name && (
                      <Ionicons name="checkmark" size={18} color={accentColor} />
                    )}
                  </TouchableOpacity>
                ))}
                {filteredCityNames.length === 0 && (
                  <Text style={styles.templateScratchSub}>
                    No cities match "{citySearch}" — use "Other city…" above.
                  </Text>
                )}
              </ScrollView>
            </SafeAreaView>
          </BlurView>
        </View>
      </Modal>
    </>
  );
}

const localStyles = StyleSheet.create({
  otherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 100,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  otherRowText: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    fontWeight: '700',
  },
});
