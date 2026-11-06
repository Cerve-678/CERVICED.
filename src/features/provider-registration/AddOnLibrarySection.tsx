// "Your add-ons" on InfoReg's services page: the provider's one list of
// add-ons, each with its price, extra time and a chip saying which services
// it goes on. Tapping a row or "New add-on" opens AddOnEditorModal.
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { withAlpha } from '../../constants/providerThemes';
import { describeAddOnRule, MAX_ADD_ONS, type AddOnCategories, type AddOnLibraryItem, type AddOnServiceRef } from './addOnLibrary';
import { ADD_ON_FONTS, addOnMetaLine, tapLight, tapMedium, type AddOnPalette } from './addOnUi';

interface Props<S extends AddOnServiceRef> {
  /** undefined = the list didn't load; editing is hidden so a save can't
   *  replace the real list with nothing. */
  library: AddOnLibraryItem[] | undefined;
  categories: AddOnCategories<S>;
  palette: AddOnPalette;
  onEdit: (item: AddOnLibraryItem) => void;
  onNew: () => void;
}

export function AddOnLibrarySection<S extends AddOnServiceRef>({ library, categories, palette, onEdit, onNew }: Props<S>) {
  if (!library) {
    return (
      <View style={styles.wrap}>
        <Text style={[styles.kicker, { color: palette.sub }]}>YOUR ADD-ONS</Text>
        <Text style={[styles.note, { color: palette.sub }]}>
          Your add-ons didn't load, so they can't be changed right now. Saving keeps them as they are. Close this page and open it again to edit them.
        </Text>
      </View>
    );
  }

  const full = library.length >= MAX_ADD_ONS;
  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Text style={[styles.kicker, { color: palette.sub }]}>YOUR ADD-ONS</Text>
        {library.length > 0 && (
          <Text style={[styles.count, { color: palette.accent, backgroundColor: withAlpha(palette.accent, 0.12) }]}>{library.length}</Text>
        )}
      </View>
      <Text style={[styles.note, { color: palette.sub }]}>
        Make an add-on once and choose which services it goes on. Change its price here and it changes everywhere. If an add-on has extra time, the appointment gets longer when a client picks it.
      </Text>

      {library.length > 0 && (
        <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
          {library.map((item, index) => (
            <TouchableOpacity
              key={item.key}
              activeOpacity={0.8}
              onPress={() => { tapLight(); onEdit(item); }}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${addOnMetaLine(item.price, item.extraMinutes)}${item.isActive ? '' : ', paused'}. Edit`}
              style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border }]}
            >
              <View style={styles.rowText}>
                <Text style={[styles.name, { color: palette.text }, !item.isActive && styles.pausedName]} numberOfLines={1}>{item.name}</Text>
                <View style={styles.chips}>
                  <Text style={[styles.rule, { color: palette.accent, backgroundColor: withAlpha(palette.accent, 0.12) }]} numberOfLines={1}>
                    {describeAddOnRule(item, categories)}
                  </Text>
                  {!item.isActive && (
                    <Text style={[styles.rule, { color: palette.sub, backgroundColor: withAlpha(palette.sub, 0.14) }]}>Paused</Text>
                  )}
                </View>
              </View>
              <Text style={[styles.meta, { color: palette.text }]}>{addOnMetaLine(item.price, item.extraMinutes)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {full ? (
        <Text style={[styles.note, { color: palette.sub }]}>You've reached {MAX_ADD_ONS} add-ons, the most you can have.</Text>
      ) : (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => { tapMedium(); onNew(); }}
          accessibilityRole="button"
          style={[styles.newButton, { borderColor: palette.accent }]}
        >
          <Text style={[styles.newText, { color: palette.accent }]}>+ New add-on</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginTop: 22 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { fontFamily: ADD_ON_FONTS.display, fontSize: 12, letterSpacing: 1.5 },
  count: { fontFamily: ADD_ON_FONTS.display, fontSize: 11, borderRadius: 100, paddingHorizontal: 9, paddingVertical: 2, overflow: 'hidden' },
  note: { fontFamily: ADD_ON_FONTS.body, fontWeight: '700', fontSize: 12, lineHeight: 17 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  rowText: { flex: 1, minWidth: 0, gap: 5 },
  name: { fontFamily: ADD_ON_FONTS.body, fontWeight: '800', fontSize: 15 },
  pausedName: { opacity: 0.55 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rule: {
    fontFamily: ADD_ON_FONTS.body,
    fontWeight: '800',
    fontSize: 11,
    borderRadius: 100,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
    maxWidth: 220,
  },
  meta: { fontFamily: ADD_ON_FONTS.display, fontSize: 14 },
  newButton: { borderWidth: 1.5, borderRadius: 100, paddingVertical: 12, alignItems: 'center' },
  newText: { fontFamily: ADD_ON_FONTS.display, fontSize: 13, letterSpacing: 0.6 },
});
