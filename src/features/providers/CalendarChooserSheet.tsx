// src/features/providers/CalendarChooserSheet.tsx
// "Which calendars?": the bottom sheet a provider picks their phone's
// calendars in. Shared by the link-only diary on Home (DiaryCard) and a full
// provider's calendar sync (CalendarSyncCard); only the wording differs.
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import type { DeviceCalendar } from '../../services/deviceCalendarService';
import { useSystemBottomInset } from '../../utils/bottomSafeGap';

export interface ChooserPalette {
  bg: string;
  text: string;
  sub: string;
  border: string;
  accent: string;
  onAccent: string;
}

export function CalendarChooserSheet({
  P, visible, calendars, chosen, onToggle, onSave, onClose, onDisconnect, body, saveLabel, disconnectLabel,
}: {
  P: ChooserPalette;
  visible: boolean;
  calendars: readonly DeviceCalendar[];
  chosen: ReadonlySet<string>;
  onToggle: (calendarId: string, on: boolean) => void;
  onSave: () => void;
  onClose: () => void;
  /** Shown only when given (i.e. already connected). */
  onDisconnect?: (() => void) | undefined;
  body: string;
  saveLabel: string;
  disconnectLabel: string;
}) {
  const bottomInset = useSystemBottomInset();
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: P.bg, paddingBottom: bottomInset + 20 }]} onPress={e => e.stopPropagation()}>
          <View style={[styles.grabber, { backgroundColor: P.border }]} />
          <Text style={[styles.sheetTitle, { color: P.text }]}>Which calendars?</Text>
          <Text style={[styles.body, { color: P.sub }]}>{body}</Text>
          <ScrollView style={styles.sheetList}>
            {calendars.length === 0 ? (
              <Text style={[styles.body, { color: P.sub }]}>No calendars found on this phone.</Text>
            ) : calendars.map(calendar => (
              <View key={calendar.id} style={styles.calendarRow}>
                <View style={[styles.dot, { backgroundColor: calendar.color }]} />
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: P.text }]} numberOfLines={1}>{calendar.title}</Text>
                  {!!calendar.sourceName && <Text style={[styles.rowSub, { color: P.sub }]} numberOfLines={1}>{calendar.sourceName}</Text>}
                </View>
                <Switch
                  value={chosen.has(calendar.id)}
                  onValueChange={on => onToggle(calendar.id, on)}
                  trackColor={{ true: P.accent, false: P.border }}
                />
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: P.accent }, chosen.size === 0 && styles.disabled]}
            disabled={chosen.size === 0}
            onPress={onSave}
            activeOpacity={0.85}
          >
            <Text style={[styles.buttonText, { color: P.onAccent }]}>{saveLabel}</Text>
          </TouchableOpacity>
          {onDisconnect && (
            <TouchableOpacity style={styles.textButton} onPress={onDisconnect} activeOpacity={0.7}>
              <Text style={[styles.disconnect, { color: P.sub }]}>{disconnectLabel}</Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingTop: 10, gap: 10, maxHeight: '80%' },
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, marginBottom: 6 },
  sheetTitle: { fontFamily: 'BakbakOne-Regular', fontSize: 20 },
  body: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, lineHeight: 19 },
  sheetList: { flexGrow: 0 },
  calendarRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowText: { flex: 1 },
  rowTitle: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '700' },
  rowSub: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, marginTop: 1 },
  button: { height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonText: { fontFamily: 'BakbakOne-Regular', fontSize: 14, letterSpacing: 0.6 },
  disabled: { opacity: 0.45 },
  textButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  disconnect: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
});
