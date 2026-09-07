// src/components/CityMultiSelect.tsx
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { UK_CITIES } from '../constants/ukCities';
import { getCityAreaData, type CityAreaData } from '../data/cityAreas';
import { BOTTOM_SAFE_GAP } from '../utils/bottomSafeGap';

type Palette = {
  bg: string; surface: string; card: string; accent: string;
  text: string; sub: string; border: string;
};

interface CityMultiSelectProps {
  selected: string[];
  onChange: (next: string[]) => void;
  palette: Palette;
  placeholder?: string;
}

/**
 * Searchable multi-select for UK service-coverage cities. A single reusable
 * source for "where do you work" (signup, Step 4) and the client-side Search
 * "City" filter, so the two stay in sync — the same string always means the
 * same thing on both sides.
 *
 * Each entry can be either a whole city ("Manchester") or, for cities with
 * structured data (see src/data/cityAreas.ts — now all of UK_CITIES),
 * drilled down to one specific area within it ("Chorlton, Manchester") —
 * expanding a row inline shows the same region → area drill-down over
 * CITY_AREAS that AreaPicker uses for the single-location field, just
 * appending to this array instead of composing one string.
 */
export function CityMultiSelect({ selected, onChange, palette: t, placeholder }: CityMultiSelectProps) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [otherText, setOtherText] = useState('');
  // Which city row is expanded into its region/area drill-down, if any.
  const [expandedCity, setExpandedCity] = useState<string | null>(null);
  const [expandedRegion, setExpandedRegion] = useState<string>('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return UK_CITIES;
    return UK_CITIES.filter(city => city.toLowerCase().includes(q));
  }, [query]);

  const add = (entry: string) => {
    if (!entry.trim() || selected.includes(entry)) return;
    Haptics.selectionAsync().catch(() => {});
    onChange([...selected, entry]);
  };

  const remove = (entry: string) => {
    Haptics.selectionAsync().catch(() => {});
    onChange(selected.filter(c => c !== entry));
  };

  const toggleWholeCity = (city: string) => {
    if (selected.includes(city)) {
      remove(city);
    } else {
      add(city);
    }
  };

  const toggleExpand = (city: string) => {
    Haptics.selectionAsync().catch(() => {});
    setExpandedRegion('');
    setExpandedCity(prev => (prev === city ? null : city));
  };

  const addArea = (city: string, area: string) => {
    add(`${area}, ${city}`);
    setExpandedCity(null);
    setExpandedRegion('');
  };

  const addOther = () => {
    const trimmed = otherText.trim();
    if (!trimmed) return;
    add(trimmed);
    setOtherText('');
  };

  const close = () => {
    setVisible(false);
    setQuery('');
    setExpandedCity(null);
    setExpandedRegion('');
  };

  const expandedData: CityAreaData | undefined = expandedCity ? getCityAreaData(expandedCity) : undefined;
  const expandedAreas = expandedData?.regions.find(r => r.region === expandedRegion)?.areas ?? [];

  return (
    <>
      <TouchableOpacity
        style={[styles.field, { backgroundColor: t.surface, borderColor: t.border }]}
        onPress={() => setVisible(true)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="Choose cities"
      >
        <Ionicons name="location-outline" size={18} color={t.sub} />
        <Text
          style={[styles.fieldText, { color: selected.length ? t.text : t.sub }]}
          numberOfLines={1}
        >
          {selected.length ? selected.join(', ') : (placeholder ?? 'Select cities')}
        </Text>
        <Ionicons name="chevron-down" size={16} color={t.sub} />
      </TouchableOpacity>

      <Modal visible={visible} animationType="slide" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={close} />
          <View style={[styles.sheet, { backgroundColor: t.card }]}>
            <View style={[styles.handle, { backgroundColor: t.border }]} />
            <View style={styles.header}>
              <Text style={[styles.title, { color: t.text }]}>Choose your cities</Text>
              <TouchableOpacity onPress={close} hitSlop={12} accessibilityLabel="Close city picker">
                <Ionicons name="close" size={22} color={t.text} />
              </TouchableOpacity>
            </View>

            <View style={[styles.searchRow, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Ionicons name="search" size={18} color={t.sub} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search cities..."
                placeholderTextColor={t.sub}
                style={[styles.searchInput, { color: t.text }]}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>

            {/* Compact "Other" row, pinned above the list — a single-line
                affordance rather than a full card, since it's one option
                among many here rather than the primary escape hatch. */}
            <View style={[styles.otherRow, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Ionicons name="create-outline" size={16} color={t.accent} />
              <TextInput
                value={otherText}
                onChangeText={setOtherText}
                placeholder="Other city or town..."
                placeholderTextColor={t.sub}
                style={[styles.otherInput, { color: t.text }]}
                autoCapitalize="words"
                autoCorrect={false}
                onSubmitEditing={addOther}
                returnKeyType="done"
              />
              <TouchableOpacity
                onPress={addOther}
                disabled={!otherText.trim()}
                hitSlop={8}
                accessibilityLabel="Add city"
              >
                <Ionicons
                  name="add-circle"
                  size={22}
                  color={otherText.trim() ? t.accent : t.border}
                />
              </TouchableOpacity>
            </View>

            <FlatList
              data={filtered}
              keyExtractor={item => item}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.list}
              renderItem={({ item }) => {
                const isSelected = selected.includes(item);
                const isExpanded = expandedCity === item;
                const cityData = getCityAreaData(item);
                return (
                  <View>
                    <View style={[styles.row, { borderBottomColor: t.border }]}>
                      <TouchableOpacity
                        style={styles.rowMain}
                        onPress={() => toggleWholeCity(item)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.rowText, { color: t.text }]}>{item}</Text>
                        {isSelected && <Ionicons name="checkmark-circle" size={20} color={t.accent} />}
                      </TouchableOpacity>
                      {cityData && (
                        <TouchableOpacity
                          style={styles.expandBtn}
                          onPress={() => toggleExpand(item)}
                          hitSlop={8}
                          accessibilityLabel={`Pick a specific area of ${item}`}
                        >
                          <Text style={[styles.expandBtnText, { color: t.accent }]}>Area</Text>
                          <Ionicons
                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                            size={14}
                            color={t.accent}
                          />
                        </TouchableOpacity>
                      )}
                    </View>

                    {isExpanded && cityData && (
                      <View style={[styles.drillDown, { borderBottomColor: t.border }]}>
                        <View style={styles.chipGrid}>
                          {cityData.regions.map(r => {
                            const active = expandedRegion === r.region;
                            return (
                              <TouchableOpacity
                                key={r.region}
                                style={[
                                  styles.chip,
                                  { borderColor: t.border },
                                  active && { backgroundColor: `${t.accent}2E`, borderColor: t.accent },
                                ]}
                                onPress={() => setExpandedRegion(prev => (prev === r.region ? '' : r.region))}
                              >
                                <Text style={[styles.chipText, { color: t.text }, active && { color: t.accent }]}>
                                  {r.region}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>

                        {expandedRegion && (
                          <View style={[styles.chipGrid, { marginTop: 8 }]}>
                            {expandedAreas.map(area => {
                              const entry = `${area}, ${item}`;
                              const active = selected.includes(entry);
                              return (
                                <TouchableOpacity
                                  key={area}
                                  style={[
                                    styles.chip,
                                    { borderColor: t.border },
                                    active && { backgroundColor: `${t.accent}2E`, borderColor: t.accent },
                                  ]}
                                  onPress={() => (active ? remove(entry) : addArea(item, area))}
                                >
                                  <Text style={[styles.chipText, { color: t.text }, active && { color: t.accent }]}>
                                    {area}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                );
              }}
              ListEmptyComponent={
                <Text style={[styles.empty, { color: t.sub }]}>No cities match "{query}"</Text>
              }
            />

            <TouchableOpacity style={[styles.doneBtn, { backgroundColor: t.accent }]} onPress={close} activeOpacity={0.75}>
              <Text style={styles.doneBtnText}>DONE{selected.length ? ` (${selected.length})` : ''}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  fieldText: { flex: 1, fontFamily: 'Jura-VariableFont_wght', fontSize: 15 },
  modalRoot: { flex: 1, justifyContent: 'flex-end', paddingBottom: BOTTOM_SAFE_GAP },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { maxHeight: '75%', minHeight: 420, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, marginBottom: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 18, letterSpacing: 0.5 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 13, minHeight: 48,
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontFamily: 'Jura-VariableFont_wght', fontSize: 15, paddingVertical: 12 },
  otherRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, minHeight: 40,
    marginBottom: 10,
  },
  otherInput: { flex: 1, fontFamily: 'Jura-VariableFont_wght', fontSize: 13, paddingVertical: 8 },
  list: { paddingBottom: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowMain: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14,
  },
  rowText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 15 },
  expandBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 12, paddingVertical: 14 },
  expandBtnText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '700' },
  drillDown: { paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 100, borderWidth: 1 },
  chipText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '600' },
  empty: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, textAlign: 'center', marginTop: 32 },
  doneBtn: { borderRadius: 100, paddingVertical: 15, alignItems: 'center', marginTop: 8, marginBottom: 8 },
  doneBtnText: { fontFamily: 'BakbakOne-Regular', fontSize: 14, letterSpacing: 1, color: '#FFFFFF' },
});
