import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import type { MyWaitlistPlace } from '../../services/databaseService';
import { useSystemBottomInset } from '../../utils/bottomSafeGap';
import { dateToYMD, formatShortDayDate, toLocalDate } from '../../utils/dateUtils';
import { placeInLineLabel } from './waitlist';

interface WaitlistDatesSheetProps {
  place: MyWaitlistPlace | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  /** null = any date. */
  onSave: (place: MyWaitlistPlace, dates: string[] | null) => void;
  onLeave: (place: MyWaitlistPlace) => void;
}

/**
 * Change a waiting place's dates, or leave the waitlist. Saving keeps the
 * client's place in line (update_my_waitlist_dates); only leaving and joining
 * again moves them to the back.
 */
export function WaitlistDatesSheet({ place, busy, error, onClose, onSave, onLeave }: WaitlistDatesSheetProps) {
  const { palette: P } = useTheme();
  const styles = useMemo(() => createStyles(P), [P]);
  const bottomInset = useSystemBottomInset();
  const [mode, setMode] = useState<'any' | 'range'>('any');
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(null);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);

  useEffect(() => {
    if (!place) return;
    const start = place.preferredDates?.[0];
    const end = place.preferredDates?.[1];
    setMode(start ? 'range' : 'any');
    setFrom(start ? toLocalDate(start) : null);
    setTo(end ? toLocalDate(end) : null);
    setPicking(null);
  }, [place]);

  const openPicker = (which: 'from' | 'to') => {
    Haptics.selectionAsync().catch(() => {});
    if (Platform.OS === 'android') {
      const { DateTimePickerAndroid } = require('@react-native-community/datetimepicker'); // eslint-disable-line @typescript-eslint/no-require-imports -- Android-only module
      DateTimePickerAndroid.open({
        value: (which === 'from' ? from : to) ?? from ?? new Date(),
        mode: 'date',
        minimumDate: which === 'to' ? (from ?? new Date()) : new Date(),
        onChange: (_: unknown, date?: Date) => {
          if (!date) return;
          if (which === 'from') {
            setFrom(date);
            if (to && to < date) setTo(null);
          } else setTo(date);
        },
      });
      return;
    }
    setPicking(current => (current === which ? null : which));
  };

  const canSave = mode === 'any' || from !== null;
  const save = () => {
    if (!place || !canSave) return;
    const dates = mode === 'any' || !from ? null : to ? [dateToYMD(from), dateToYMD(to)] : [dateToYMD(from)];
    onSave(place, dates);
  };

  return (
    <Modal visible={!!place} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: 20 + bottomInset }]}>
          <View style={styles.grab} />
          {place && (
            <>
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title} numberOfLines={1}>{place.serviceName}</Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {place.providerName} · {placeInLineLabel(place.placeInLine)}
                  </Text>
                </View>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.6}>
                  <Ionicons name="close" size={20} color={P.sub} />
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>YOUR DATES</Text>
              <View style={styles.segment}>
                {(['any', 'range'] as const).map(value => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.segmentButton, mode === value && { backgroundColor: P.accent }]}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setMode(value); }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityState={{ selected: mode === value }}
                  >
                    <Text style={[styles.segmentText, { color: mode === value ? P.onAccent : P.sub }]}>
                      {value === 'any' ? 'Any day' : 'Date range'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {mode === 'range' && (
                <View style={styles.dateBlock}>
                  {(['from', 'to'] as const).map(which => {
                    const value = which === 'from' ? from : to;
                    return (
                      <TouchableOpacity
                        key={which}
                        style={[styles.dateRow, which === 'from' && styles.dateRowDivider]}
                        onPress={() => openPicker(which)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                      >
                        <Text style={styles.dateLabel}>{which === 'from' ? 'From' : 'To'}</Text>
                        <Text style={[styles.dateValue, !value && { color: P.sub }]}>
                          {value ? formatShortDayDate(value) : which === 'from' ? 'Pick a date' : 'No end date'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              {Platform.OS === 'ios' && picking && (
                <DateTimePicker
                  value={(picking === 'from' ? from : to) ?? from ?? new Date()}
                  mode="date"
                  display="inline"
                  minimumDate={picking === 'to' ? (from ?? new Date()) : new Date()}
                  onChange={(_, date) => {
                    if (!date) return;
                    if (picking === 'from') {
                      setFrom(date);
                      if (to && to < date) setTo(null);
                    } else setTo(date);
                    setPicking(null);
                  }}
                />
              )}

              <Text style={styles.hint}>Changing your dates doesn't move you back in line.</Text>
              {error && <Text style={styles.error}>{error}</Text>}

              <TouchableOpacity
                style={[styles.button, { backgroundColor: P.accent, opacity: canSave && !busy ? 1 : 0.5 }]}
                onPress={save}
                disabled={!canSave || busy}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                {busy ? <ActivityIndicator color={P.onAccent} size="small" /> : <Text style={[styles.buttonText, { color: P.onAccent }]}>Save</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.lineButton]}
                onPress={() => onLeave(place)}
                disabled={busy}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={[styles.buttonText, { color: P.sub }]}>Leave this waitlist</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

type Palette = ReturnType<typeof useTheme>['palette'];

const createStyles = (P: Palette) =>
  StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { backgroundColor: P.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 10, gap: 12 },
    grab: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: P.border, marginBottom: 4 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    title: { fontFamily: 'BakbakOne-Regular', fontSize: 17, color: P.text },
    sub: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '600', color: P.sub, marginTop: 2 },
    label: { fontFamily: 'BakbakOne-Regular', fontSize: 10.5, letterSpacing: 1.4, color: P.sub, marginTop: 4 },
    segment: { flexDirection: 'row', backgroundColor: P.surface, borderRadius: 12, padding: 3, borderWidth: 1, borderColor: P.border },
    segmentButton: { flex: 1, borderRadius: 9, paddingVertical: 9, alignItems: 'center' },
    segmentText: { fontFamily: 'BakbakOne-Regular', fontSize: 12 },
    dateBlock: { borderRadius: 14, borderWidth: 1, borderColor: P.border, backgroundColor: P.surface },
    dateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13 },
    dateRowDivider: { borderBottomWidth: 1, borderBottomColor: P.sep },
    dateLabel: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '600', color: P.sub },
    dateValue: { fontFamily: 'BakbakOne-Regular', fontSize: 13, color: P.text },
    hint: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '600', color: P.sub },
    error: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '700', color: '#D32F2F' },
    button: { minHeight: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
    lineButton: { borderWidth: 1, borderColor: P.border },
    buttonText: { fontFamily: 'BakbakOne-Regular', fontSize: 13, letterSpacing: 0.3 },
  });
