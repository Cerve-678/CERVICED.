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

/** Searchable, strictly pick-from-list multi-select for UK service-coverage
 *  cities. A single reusable source for "where do you work" (signup, Step 4)
 *  and the client-side Search "City" filter, so the two stay in sync — the
 *  same city string always means the same thing on both sides. */
export function CityMultiSelect({ selected, onChange, palette: t, placeholder }: CityMultiSelectProps) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return UK_CITIES;
    return UK_CITIES.filter(city => city.toLowerCase().includes(q));
  }, [query]);

  const toggle = (city: string) => {
    Haptics.selectionAsync().catch(() => {});
    onChange(selected.includes(city) ? selected.filter(c => c !== city) : [...selected, city]);
  };

  const close = () => { setVisible(false); setQuery(''); };

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

      <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
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

            <FlatList
              data={filtered}
              keyExtractor={item => item}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.list}
              renderItem={({ item }) => {
                const isSelected = selected.includes(item);
                return (
                  <TouchableOpacity
                    style={[styles.row, { borderBottomColor: t.border }]}
                    onPress={() => toggle(item)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.rowText, { color: t.text }]}>{item}</Text>
                    {isSelected && <Ionicons name="checkmark-circle" size={20} color={t.accent} />}
                  </TouchableOpacity>
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
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
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
  list: { paddingBottom: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { fontFamily: 'Jura-VariableFont_wght', fontSize: 15 },
  empty: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, textAlign: 'center', marginTop: 32 },
  doneBtn: { borderRadius: 100, paddingVertical: 15, alignItems: 'center', marginTop: 8, marginBottom: 8 },
  doneBtnText: { fontFamily: 'BakbakOne-Regular', fontSize: 14, letterSpacing: 1, color: '#FFFFFF' },
});
