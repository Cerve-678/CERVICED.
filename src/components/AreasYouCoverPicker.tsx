import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AreaPicker from './AreaPicker';
import { withAlpha } from '../constants/providerThemes';
import {
  MAX_COVERED_AREAS,
  addCoveredArea,
  coveredAreaLabel,
  suggestedCoverTown,
} from '../utils/providerCity';

type Palette = { text: string; sub: string; surface: string; border: string };

interface AreasYouCoverPickerProps {
  /** providers.service_locations, in the order they were added. */
  value: string[];
  onChange: (next: string[]) => void;
  /** "Where you're based" — its town is offered as a one-tap first place. */
  basedIn: string;
  /** The provider's own accent, the same one "Where you're based" uses. */
  accentColor: string;
  palette: Palette;
}

type Note = 'duplicate' | 'full' | null;

const NOTE_TEXT: Record<Exclude<Note, null>, string> = {
  duplicate: "That place is already on your list.",
  full: `That's ${MAX_COVERED_AREAS} places, the most you can add. Remove one to add another, or pick a whole town instead.`,
};

/**
 * "Areas you cover" for a mobile provider: the towns and areas they travel
 * to, as removable chips, written to providers.service_locations. Search's
 * City filter matches them (src/utils/providerCity.ts): an area by name and
 * by its town, a whole town for every area in it.
 *
 * Places are added with the same stepped AreaPicker "Where you're based" uses
 * (variant 'cover', which also offers "All of <town>"), so a covered place
 * and a based-in place are always written the same way.
 */
export default function AreasYouCoverPicker({
  value,
  onChange,
  basedIn,
  accentColor,
  palette: t,
}: AreasYouCoverPickerProps) {
  const [note, setNote] = useState<Note>(null);
  const suggestion = suggestedCoverTown(basedIn, value);
  const full = value.length >= MAX_COVERED_AREAS;
  const chipFill = withAlpha(accentColor, 0.14);

  const add = (place: string) => {
    const result = addCoveredArea(value, place);
    if (result.outcome === 'added') {
      setNote(null);
      onChange(result.next);
      return;
    }
    if (result.outcome === 'empty') return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    setNote(result.outcome);
  };

  const remove = (place: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setNote(null);
    onChange(value.filter(p => p !== place));
  };

  const addSuggestion = () => {
    if (!suggestion) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    add(suggestion);
  };

  return (
    <View>
      {value.length > 0 ? (
        <View style={styles.chips}>
          {value.map(place => {
            const label = coveredAreaLabel(place);
            return (
              <TouchableOpacity
                key={place}
                style={[styles.chip, { backgroundColor: chipFill, borderColor: accentColor }]}
                onPress={() => remove(place)}
                activeOpacity={0.5}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${label}`}
              >
                <Ionicons
                  name={label === place ? 'location-outline' : 'map-outline'}
                  size={13}
                  color={accentColor}
                />
                <Text style={[styles.chipText, { color: t.text }]} numberOfLines={2}>{label}</Text>
                <Ionicons name="close-circle" size={16} color={accentColor} />
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <View style={[styles.empty, { borderColor: t.border, backgroundColor: t.surface }]}>
          <Ionicons name="navigate-circle-outline" size={20} color={accentColor} />
          <Text style={[styles.emptyText, { color: t.sub }]}>
            No places yet. Add the towns or areas you'll travel to.
          </Text>
        </View>
      )}

      {suggestion && !full && value.length === 0 ? (
        <Text style={[styles.hint, { color: t.sub }]}>Suggested from where you're based:</Text>
      ) : null}

      <View style={styles.actions}>
        {suggestion && !full ? (
          <TouchableOpacity
            style={[styles.dashedPill, { borderColor: accentColor }]}
            onPress={addSuggestion}
            activeOpacity={0.5}
            accessibilityRole="button"
            accessibilityLabel={`Add all of ${suggestion}`}
          >
            <Ionicons name="sparkles-outline" size={14} color={accentColor} />
            <Text style={[styles.dashedPillText, { color: t.text }]}>All of {suggestion}</Text>
          </TouchableOpacity>
        ) : null}

        <AreaPicker
          value=""
          onChange={add}
          variant="cover"
          picked={value}
          accentColor={accentColor}
          subtitle="Pick a whole town or one area in it. Add as many as you travel to."
          renderTrigger={open => (
            <TouchableOpacity
              style={[styles.dashedPill, { borderColor: accentColor }, full && styles.disabled]}
              onPress={() => {
                if (full) {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
                  setNote('full');
                  return;
                }
                setNote(null);
                open();
              }}
              activeOpacity={0.5}
              accessibilityRole="button"
              accessibilityLabel="Add an area you cover"
            >
              <Ionicons name="add" size={15} color={accentColor} />
              <Text style={[styles.dashedPillText, { color: t.text }]}>Add area</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {note ? <Text style={[styles.hint, { color: t.sub }]}>{NOTE_TEXT[note]}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%',
    borderWidth: 1, borderRadius: 100, paddingLeft: 11, paddingRight: 8, paddingVertical: 7,
  },
  chipText: { flexShrink: 1, fontFamily: 'JosefinSans-VariableFont_wght', fontSize: 13, fontWeight: '700' },
  empty: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
  },
  emptyText: { flex: 1, fontFamily: 'JosefinSans-VariableFont_wght', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  dashedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderStyle: 'dashed', borderRadius: 100, paddingHorizontal: 13, paddingVertical: 8,
  },
  dashedPillText: { fontFamily: 'JosefinSans-Bold', fontSize: 12, letterSpacing: 0.3 },
  disabled: { opacity: 0.45 },
  hint: { fontFamily: 'JosefinSans-VariableFont_wght', fontSize: 12, fontWeight: '700', marginTop: 8, lineHeight: 17 },
});
