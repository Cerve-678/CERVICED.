// src/components/SpecialityMultiSelect.tsx
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
import { useSystemBottomInset } from '../utils/bottomSafeGap';
import { normalizeTerm, matchesSpeciality } from '../utils/fuzzyMatch';

type Palette = {
  bg: string; surface: string; card: string; accent: string; onAccent: string;
  text: string; sub: string; border: string;
};

interface SpecialityMultiSelectProps {
  selected: string[];
  onChange: (next: string[]) => void;
  /** Category-scoped option pool (curated + real values) from the caller. */
  options: string[];
  palette: Palette;
  placeholder?: string;
}

/**
 * Searchable multi-select for the client Search "Speciality" filter. Replaces a
 * flat dump of every speciality pill with a tap-to-open sheet and a search box,
 * so a long per-category list (HAIR alone is 20+) stays scannable: the client
 * types "domin" and lands on "Dominican blowout" rather than hunting a grid.
 *
 * The search tolerates the same spelling drift the provider-side match does
 * (via fuzzyMatch), and when the query matches no listed option it offers to
 * use the typed term verbatim — the result is still matched fuzzily against
 * providers, so a not-yet-curated speciality the client knows the name of
 * isn't a dead end. Selected options float to the top of the list.
 */
export function SpecialityMultiSelect({ selected, onChange, options, palette: t, placeholder }: SpecialityMultiSelectProps) {
  const bottomInset = useSystemBottomInset();
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = normalizeTerm(query);
    const base = q
      ? options.filter(o => normalizeTerm(o).includes(q) || matchesSpeciality([o], query))
      : options;
    // Selected first, otherwise keep the caller's order (curated before extras).
    return [...base].sort((a, b) => (selected.includes(b) ? 1 : 0) - (selected.includes(a) ? 1 : 0));
  }, [query, options, selected]);

  // Offer the typed term itself when it isn't already a listed option or a
  // current selection — matched fuzzily downstream, so it's a real escape hatch
  // rather than a no-op.
  const customCandidate = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return null;
    const norm = normalizeTerm(trimmed);
    if (!norm) return null;
    const existsInList = options.some(o => normalizeTerm(o) === norm);
    const alreadyChosen = selected.some(s => normalizeTerm(s) === norm);
    return existsInList || alreadyChosen ? null : trimmed;
  }, [query, options, selected]);

  const toggle = (entry: string) => {
    Haptics.selectionAsync().catch(() => {});
    onChange(
      selected.includes(entry)
        ? selected.filter(s => s !== entry)
        : [...selected, entry],
    );
  };

  const addCustom = () => {
    if (!customCandidate) return;
    Haptics.selectionAsync().catch(() => {});
    onChange([...selected, customCandidate]);
    setQuery('');
  };

  const close = () => {
    setVisible(false);
    setQuery('');
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.field, { backgroundColor: t.surface, borderColor: t.border }]}
        onPress={() => { Haptics.selectionAsync().catch(() => {}); setVisible(true); }}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="Choose specialities"
      >
        <Ionicons name="sparkles-outline" size={18} color={t.sub} />
        <Text
          style={[styles.fieldText, { color: selected.length ? t.text : t.sub }]}
          numberOfLines={1}
        >
          {selected.length ? selected.join(', ') : (placeholder ?? 'Any speciality')}
        </Text>
        {selected.length > 0 && (
          <View style={[styles.countPill, { backgroundColor: t.accent }]}>
            <Text style={[styles.countPillText, { color: t.onAccent }]}>{selected.length}</Text>
          </View>
        )}
        <Ionicons name="chevron-down" size={16} color={t.sub} />
      </TouchableOpacity>

      <Modal visible={visible} animationType="slide" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={close} />
          <View style={[styles.sheet, { backgroundColor: t.card, paddingBottom: bottomInset + 16 }]}>
            <View style={[styles.handle, { backgroundColor: t.border }]} />
            <View style={styles.header}>
              <Text style={[styles.title, { color: t.text }]}>Specialities</Text>
              <TouchableOpacity onPress={close} hitSlop={12} accessibilityLabel="Close speciality picker">
                <Ionicons name="close" size={22} color={t.text} />
              </TouchableOpacity>
            </View>

            <View style={[styles.searchRow, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Ionicons name="search" size={18} color={t.sub} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search specialities..."
                placeholderTextColor={t.sub}
                style={[styles.searchInput, { color: t.text }]}
                autoCapitalize="none"
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
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text style={[styles.rowText, { color: t.text }]}>{item}</Text>
                    {isSelected && <Ionicons name="checkmark-circle" size={20} color={t.accent} />}
                  </TouchableOpacity>
                );
              }}
              ListFooterComponent={
                customCandidate ? (
                  <TouchableOpacity
                    style={[styles.customRow, { borderColor: t.accent }]}
                    onPress={addCustom}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="add-circle" size={20} color={t.accent} />
                    <Text style={[styles.customText, { color: t.accent }]} numberOfLines={1}>
                      Use &ldquo;{customCandidate}&rdquo;
                    </Text>
                  </TouchableOpacity>
                ) : null
              }
              ListEmptyComponent={
                customCandidate
                  ? null
                  : <Text style={[styles.empty, { color: t.sub }]}>No specialities match &ldquo;{query}&rdquo;</Text>
              }
            />

            <TouchableOpacity style={[styles.doneBtn, { backgroundColor: t.accent }]} onPress={close} activeOpacity={0.75}>
              <Text style={[styles.doneBtnText, { color: t.onAccent }]}>DONE{selected.length ? ` (${selected.length})` : ''}</Text>
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
    paddingHorizontal: 14, paddingVertical: 13, flex: 1,
  },
  fieldText: { flex: 1, fontFamily: 'Jura-VariableFont_wght', fontSize: 15 },
  countPill: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  countPillText: { fontFamily: 'BakbakOne-Regular', fontSize: 11 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { height: '75%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10 },
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
  customRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 100, borderStyle: 'dashed',
    paddingHorizontal: 14, paddingVertical: 12, marginTop: 12,
  },
  customText: { flex: 1, fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '600' },
  empty: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, textAlign: 'center', marginTop: 32 },
  doneBtn: { borderRadius: 100, paddingVertical: 15, alignItems: 'center', marginTop: 8, marginBottom: 8 },
  doneBtnText: { fontFamily: 'BakbakOne-Regular', fontSize: 14, letterSpacing: 1 },
});
