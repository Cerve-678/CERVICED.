import React, { memo, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import type { AppTheme } from '../constants/theme';
import { useSystemBottomInset } from '../utils/bottomSafeGap';
import { searchPlaces } from '../data/cityAreas';

interface LocationModalProps {
  visible: boolean;
  onClose: () => void;
  /** The picked place ("Haggerston, London" or "London, UK"), or null for the device's location. */
  selectedPlace: string | null;
  selectedRadius: number;
  onPlaceChange: (place: string | null) => void;
  onRadiusChange: (radius: number) => void;
}

/** One selectable pill. Shared by both the city and radius groups — they
 *  differ only in their label, so a single chip keeps the two lists visually
 *  identical rather than drifting apart. */
const Chip = memo<{
  label: string;
  isSelected: boolean;
  palette: AppTheme;
  onPress: () => void;
}>(({ label, isSelected, palette: P, onPress }) => (
  <TouchableOpacity
    style={[
      styles.pill,
      { borderColor: P.border, backgroundColor: P.surface },
      isSelected && { backgroundColor: P.accent, borderColor: P.accent },
    ]}
    onPress={onPress}
    activeOpacity={0.75}
  >
    <Text style={[styles.pillText, { color: isSelected ? P.onAccent : P.text }]}>
      {label}
    </Text>
  </TouchableOpacity>
));
Chip.displayName = 'Chip';

const USE_MY_LOCATION = 'Use my location';

const CITIES = [
  'London, UK',
  'Manchester, UK',
  'Birmingham, UK',
  'Leeds, UK',
  'Glasgow, UK',
  'Liverpool, UK',
  'Bristol, UK',
  'Sheffield, UK',
];

const RADIUS_OPTIONS = [
  { label: '1 mile', value: 1 },
  { label: '5 miles', value: 5 },
  { label: '10 miles', value: 10 },
  { label: '25 miles', value: 25 },
  { label: '50 miles', value: 50 },
];

export default function LocationModal({
  visible,
  onClose,
  selectedPlace,
  selectedRadius,
  onPlaceChange,
  onRadiusChange,
}: LocationModalProps) {
  const [query, setQuery] = useState('');
  useEffect(() => { if (!visible) setQuery(''); }, [visible]);

  // Neighbourhoods and towns, saved the way the resolver reads them back:
  // "Haggerston, London" for an area, "London, UK" for a whole town.
  const matches = useMemo(
    () => searchPlaces(query, 24).flatMap(m =>
      m.kind === 'area' ? [{ label: `${m.name} · ${m.town}`, value: `${m.name}, ${m.town}` }]
        : m.kind === 'town' ? [{ label: m.name, value: `${m.name}, UK` }]
          : []),
    [query],
  );
  // A picked neighbourhood isn't one of the city chips, so it's shown on its
  // own, otherwise the sheet would open with nothing looking selected.
  const pickedArea = selectedPlace && !CITIES.includes(selectedPlace) ? selectedPlace : null;

  // The hat-aware palette, not useEnterpriseTheme(): this sheet opens over the
  // client Home, and the enterprise tokens are provider-hat only — they'd paint
  // brown/dusty-rose chrome inside the client's plum + blue-grey theme.
  const { palette: P } = useTheme();
  const bottomInset = useSystemBottomInset();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent navigationBarTranslucent
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable
            style={[styles.sheet, { backgroundColor: P.card, borderColor: P.border, paddingBottom: Math.max(34, bottomInset + 16) }]}
            onPress={() => {}}
          >
            <View style={styles.header}>
              <Text style={[styles.title, { color: P.text }]}>LOCATION &amp; RADIUS</Text>
            </View>

            <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.pillGrid}>
                <Chip
                  label={USE_MY_LOCATION}
                  palette={P}
                  isSelected={selectedPlace === null}
                  onPress={() => onPlaceChange(null)}
                />
                {pickedArea ? (
                  <Chip
                    label={pickedArea.split(',')[0]!}
                    palette={P}
                    isSelected
                    onPress={() => onPlaceChange(pickedArea)}
                  />
                ) : null}
              </View>

              <View style={styles.sectionHead}>
                <Text style={[styles.sectionTitle, { color: P.sub }]}>Your area</Text>
              </View>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search an area, e.g. Haggerston"
                placeholderTextColor={P.sub}
                autoCorrect={false}
                autoCapitalize="words"
                returnKeyType="search"
                style={[styles.searchInput, { color: P.text, borderColor: P.border, backgroundColor: P.surface }]}
              />
              {query.trim() ? (
                <View style={[styles.pillGrid, styles.matchGrid]}>
                  {matches.length === 0 ? (
                    <Text style={[styles.noMatch, { color: P.sub }]}>No area by that name yet.</Text>
                  ) : matches.map(match => (
                    <Chip
                      key={match.value}
                      label={match.label}
                      palette={P}
                      isSelected={selectedPlace === match.value}
                      onPress={() => { setQuery(''); onPlaceChange(match.value); }}
                    />
                  ))}
                </View>
              ) : null}

              <View style={styles.sectionHead}>
                <Text style={[styles.sectionTitle, { color: P.sub }]}>City</Text>
              </View>
              <View style={styles.pillGrid}>
                {CITIES.map(city => (
                  <Chip
                    key={city}
                    label={city}
                    palette={P}
                    isSelected={selectedPlace === city}
                    onPress={() => onPlaceChange(city)}
                  />
                ))}
              </View>

              <View style={styles.sectionHead}>
                <Text style={[styles.sectionTitle, { color: P.sub }]}>Search radius</Text>
              </View>
              <View style={[styles.pillGrid, styles.pillGridLast]}>
                {RADIUS_OPTIONS.map(option => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    palette={P}
                    isSelected={selectedRadius === option.value}
                    onPress={() => onRadiusChange(option.value)}
                  />
                ))}
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.applyButton, { backgroundColor: P.accent }]}
              onPress={onClose}
              activeOpacity={0.75}
            >
              <Text style={[styles.applyButtonText, { color: P.onAccent }]}>Apply</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '75%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 34,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  title: {
    fontFamily: 'JosefinSans-Bold',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  sectionHead: {
    marginTop: 18,
    marginBottom: 8,
  },
  sectionTitle: {
    fontFamily: 'JosefinSans-VariableFont_wght',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  pillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pillGridLast: {
    marginBottom: 4,
  },
  matchGrid: {
    marginTop: 10,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: 'JosefinSans-VariableFont_wght',
    fontSize: 14,
    fontWeight: '600',
  },
  noMatch: {
    fontFamily: 'JosefinSans-VariableFont_wght',
    fontSize: 13,
  },
  pill: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  pillText: {
    fontFamily: 'JosefinSans-VariableFont_wght',
    fontSize: 13,
    fontWeight: '600',
  },
  // Height only — no vertical padding. The previous version set both
  // (paddingVertical 16 + height 44), so the label needed ~51px inside a 44px
  // box and got clipped.
  applyButton: {
    marginTop: 14,
    minHeight: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButtonText: {
    fontFamily: 'JosefinSans-Bold',
    fontSize: 13,
    letterSpacing: 0.5,
  },
});
