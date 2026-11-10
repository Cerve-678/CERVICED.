// "Your add-ons" on InfoReg's services page: the provider's one list of
// add-ons, each with its price, extra time and which services it goes on.
// While there are none it sits under the services with its guide open and a
// "Make your first add-on" button. Once there's one, it moves to the page's
// Add-ons tab (`inTab`) and replaces the services while that tab is picked.
// Add-ons made inside a service's editor join this same list. New add-ons
// also start from "+ Add-on" beside "+ Add Category"; tapping a row edits it.
// All of them open AddOnEditorModal.
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { withAlpha } from '../../constants/providerThemes';
import { formatAddOnExtraTime } from '../bookings/addOnTime';
import { describeAddOnRule, MAX_ADD_ONS, type AddOnCategories, type AddOnLibraryItem, type AddOnServiceRef } from './addOnLibrary';
import { ADD_ON_FONTS, formatAddOnPrice, tapLight, tapMedium, tapSelect, type AddOnPalette } from './addOnUi';
import { AddOnGuide } from './AddOnGuide';

interface Props<S extends AddOnServiceRef> {
  /** undefined = the list didn't load; editing is hidden so a save can't
   *  replace the real list with nothing. */
  library: AddOnLibraryItem[] | undefined;
  categories: AddOnCategories<S>;
  palette: AddOnPalette;
  onEdit: (item: AddOnLibraryItem) => void;
  onNew: () => void;
  /** Shown as the Services page's Add-ons tab: sits right under the tab row,
   *  and has an add button of its own beside the guide. */
  inTab?: boolean;
}

export function AddOnLibrarySection<S extends AddOnServiceRef>({ library, categories, palette, onEdit, onNew, inTab = false }: Props<S>) {
  const empty = !library || library.length === 0;
  // null = the provider hasn't touched it, so it follows whether the list is
  // empty: open with no add-ons, closed once they have some.
  const [guideChoice, setGuideChoice] = useState<boolean | null>(null);
  const guideOpen = guideChoice ?? empty;

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
    <View style={[styles.wrap, inTab && styles.wrapInTab]}>
      <View style={styles.headRow}>
        <View style={styles.headLeft}>
          <Text style={[styles.kicker, { color: palette.sub }]}>YOUR ADD-ONS</Text>
          {library.length > 0 && (
            <Text style={[styles.count, { color: palette.accent, backgroundColor: withAlpha(palette.accent, 0.12) }]}>{library.length}</Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => { tapSelect(); setGuideChoice(!guideOpen); }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ expanded: guideOpen }}
          hitSlop={8}
          style={styles.guideToggle}
        >
          <Ionicons name="information-circle-outline" size={15} color={palette.accent} />
          <Text style={[styles.guideToggleText, { color: palette.accent }]}>How add-ons work</Text>
          <Ionicons name={guideOpen ? 'chevron-up' : 'chevron-down'} size={13} color={palette.accent} />
        </TouchableOpacity>
      </View>

      {guideOpen ? (
        <AddOnGuide palette={palette} />
      ) : (
        <Text style={[styles.note, { color: palette.sub }]}>
          Extras clients can add to a service when they book. One price everywhere.
        </Text>
      )}

      {library.length > 0 && (
        <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
          {library.map((item, index) => {
            const time = formatAddOnExtraTime(item.extraMinutes);
            return (
              <TouchableOpacity
                key={item.key}
                activeOpacity={0.8}
                onPress={() => { tapLight(); onEdit(item); }}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${formatAddOnPrice(item.price)}${time ? `, ${time} extra` : ''}, ${describeAddOnRule(item, categories)}${item.isActive ? '' : ', paused'}. Edit`}
                style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border }]}
              >
                <View style={[styles.rowText, !item.isActive && styles.paused]}>
                  <View style={styles.nameLine}>
                    <Text style={[styles.name, { color: palette.text }]} numberOfLines={1}>{item.name}</Text>
                    <Text style={[styles.price, { color: palette.text }]}>{formatAddOnPrice(item.price)}</Text>
                  </View>
                  <View style={styles.chips}>
                    {!item.isActive && (
                      <Text style={[styles.chip, { color: palette.sub, backgroundColor: withAlpha(palette.sub, 0.14) }]}>Paused</Text>
                    )}
                    {time ? (
                      <Text style={[styles.chip, styles.timeChip, { color: palette.sub, borderColor: palette.border }]}>{time}</Text>
                    ) : null}
                    <Text style={[styles.chip, { color: palette.accent, backgroundColor: withAlpha(palette.accent, 0.12) }]} numberOfLines={1}>
                      {describeAddOnRule(item, categories)}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={15} color={palette.sub} style={styles.chevron} />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {full ? (
        <Text style={[styles.note, { color: palette.sub }]}>You've reached {MAX_ADD_ONS} add-ons, the most you can have.</Text>
      ) : empty ? (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => { tapMedium(); onNew(); }}
          accessibilityRole="button"
          style={[styles.firstButton, { backgroundColor: palette.accent }]}
        >
          <Text style={[styles.firstText, { color: palette.onAccent }]}>Make your first add-on</Text>
        </TouchableOpacity>
      ) : inTab ? (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => { tapMedium(); onNew(); }}
          accessibilityRole="button"
          style={[styles.moreButton, { borderColor: palette.accent }]}
        >
          <Text style={[styles.moreText, { color: palette.accent }]}>+ Add another add-on</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginTop: 22 },
  wrapInTab: { marginTop: 0 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kicker: { fontFamily: ADD_ON_FONTS.display, fontSize: 12, letterSpacing: 1.5 },
  count: { fontFamily: ADD_ON_FONTS.display, fontSize: 11, borderRadius: 100, paddingHorizontal: 9, paddingVertical: 2, overflow: 'hidden' },
  guideToggle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  guideToggleText: { fontFamily: ADD_ON_FONTS.body, fontWeight: '800', fontSize: 12.5 },
  note: { fontFamily: ADD_ON_FONTS.body, fontWeight: '700', fontSize: 12, lineHeight: 17 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 10, paddingVertical: 12 },
  rowText: { flex: 1, minWidth: 0, gap: 6 },
  paused: { opacity: 0.55 },
  nameLine: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  name: { flex: 1, minWidth: 0, fontFamily: ADD_ON_FONTS.body, fontWeight: '800', fontSize: 15 },
  price: { fontFamily: ADD_ON_FONTS.display, fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    fontFamily: ADD_ON_FONTS.body,
    fontWeight: '800',
    fontSize: 11,
    borderRadius: 100,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
    maxWidth: 230,
  },
  timeChip: { borderWidth: StyleSheet.hairlineWidth },
  chevron: { opacity: 0.6 },
  firstButton: { borderRadius: 100, paddingVertical: 13, alignItems: 'center' },
  firstText: { fontFamily: ADD_ON_FONTS.display, fontSize: 13.5, letterSpacing: 0.6 },
  moreButton: { borderRadius: 100, paddingVertical: 12, alignItems: 'center', borderWidth: 1.5 },
  moreText: { fontFamily: ADD_ON_FONTS.display, fontSize: 13, letterSpacing: 0.5 },
});
