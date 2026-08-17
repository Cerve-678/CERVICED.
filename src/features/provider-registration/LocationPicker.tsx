import React, { useMemo, useState } from 'react';
import {
  Modal,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { ChipSelect } from './ChipSelect';
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
 *  this picker existed — is treated as free text, which is the safe default. */
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

  const cityData: CityAreaData | undefined =
    city && city !== OTHER_CITY ? getCityAreaData(city) : undefined;
  const regionAreas =
    cityData?.regions.find(r => r.region === region)?.areas ?? [];

  const selectCity = (nextCity: string) => {
    setCity(nextCity);
    setRegion('');
    setArea('');
    setCityModalVisible(false);
    // Both branches clear the composed value: the previous city's area no
    // longer describes where this provider is, and leaving it behind would
    // let a stale location survive a city change.
    onChange('');
  };

  const selectRegion = (nextRegion: string) => {
    const same = region === nextRegion;
    setRegion(same ? '' : nextRegion);
    setArea('');
    onChange('');
  };

  const selectArea = (nextArea: string) => {
    if (area === nextArea) {
      setArea('');
      onChange('');
      return;
    }
    setArea(nextArea);
    // Most-specific-first, so the geocoder gets a real address-like string.
    onChange(cityData ? `${nextArea}, ${cityData.city}` : nextArea);
  };

  const cityLabel =
    city === OTHER_CITY ? 'Another city' : city || 'Choose your city';

  return (
    <>
      <TouchableOpacity
        style={styles.locationSelectRow}
        onPress={() => setCityModalVisible(true)}
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

      {/* Structured cities: region first, then the areas within it. */}
      {cityData && (
        <>
          <Text style={styles.locationStepLabel}>Area of {cityData.city}</Text>
          <ChipSelect
            options={cityData.regions.map(r => r.region)}
            selected={region ? [region] : []}
            onToggle={selectRegion}
            accentColor={accentColor}
            styles={styles}
          />
        </>
      )}

      {cityData && region && (
        <>
          <Text style={styles.locationStepLabel}>Where in {region}?</Text>
          <ChipSelect
            options={regionAreas}
            selected={area ? [area] : []}
            onToggle={selectArea}
            accentColor={accentColor}
            styles={styles}
          />
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
                  onPress={() => setCityModalVisible(false)}
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView
                style={styles.modalContent}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 24 }}
              >
                {CITY_AREA_NAMES.map(name => (
                  <TouchableOpacity
                    key={name}
                    style={styles.templateCard}
                    onPress={() => selectCity(name)}
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
                <Text style={styles.templateGroupLabel}>Somewhere else</Text>
                <TouchableOpacity
                  style={[styles.templateScratchCard, { borderColor: accentColor }]}
                  onPress={() => selectCity(OTHER_CITY)}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="create-outline"
                    size={20}
                    color={accentColor}
                    style={styles.templateScratchIcon}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.templateScratchTitle}>Other city…</Text>
                    <Text style={styles.templateScratchSub}>
                      Type your own town or area
                    </Text>
                  </View>
                </TouchableOpacity>
              </ScrollView>
            </SafeAreaView>
          </BlurView>
        </View>
      </Modal>
    </>
  );
}
