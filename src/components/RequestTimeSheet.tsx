/**
 * "Request a specific time" — the one place a client asks a provider for a
 * time their ordinary scheduling rules exclude.
 *
 * WHY THIS ISN'T THE PICKER'S INLINE RED CHIPS ANY MORE. A provider who opts
 * into out-of-hours requests and leaves request_window_before/after_mins at
 * their default (NULL, "any time") generates a by-request candidate for every
 * step of the whole 24 hours — 48 at a 30-minute interval, 96 at 15. Rendered
 * inline that buried the handful of times the provider is actually free under
 * a wall of red, on every single day. The times are the same times; only
 * where they live changed.
 *
 * TWO WAYS IN, ONE SET OF TIMES. The chips and the wheel both read the SAME
 * resolved candidates the caller passes down — the wheel does not compute its
 * own. That is deliberate and load-bearing: every offerable time has already
 * been through resolveSlotOffer() and the busy-span check, so neither path can
 * offer something enforce_booking_bookability() would then reject. A second
 * route that worked out its own answer is exactly how the picker and the
 * trigger drift apart.
 *
 * The wheel therefore SNAPS to the nearest real candidate rather than taking
 * the client's literal minute: times are on a grid, and 4:07 isn't on it. A
 * snap can't slip past anyone — EmergencyBookingPrompt restates the exact
 * time afterwards and won't proceed without a tick.
 *
 * Colours come from the caller, never from the app's light/dark setting —
 * same rule as ModernBeautyCalendar and EmergencyBookingPrompt, so this
 * matches whichever sheet it opens over.
 */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import type { EmergencyReason } from '../services/AvailabilityService';
import { parseTimeToMinutes, snapToRequestable } from '../services/AvailabilityService';
import { formatLongDateNoYear } from '../utils/dateUtils';
import { withAlpha } from '../constants/providerThemes';

/** Same fixed warning red as the picker's by-request chips — see
 *  ModernBeautyCalendar's EMERGENCY_OUTLINE for why it isn't the accent. */
const EMERGENCY_OUTLINE = '#FF3B30';

type RequestSlot = { time: string; reasons: EmergencyReason[] };

interface RequestTimeSheetProps {
  visible: boolean;
  onClose: () => void;
  /** 'YYYY-MM-DD' being requested. */
  date: string;
  /** Ask the caller to move to another date; it owns the fetch, so
   *  `requestTimes` arrives updated (with `loading` true meanwhile). */
  onDateChange: (date: string) => void;
  /** Every by-request time for `date`, already resolved with the rules each
   *  one breaks. Never recomputed here — see the header. */
  requestTimes: RequestSlot[];
  loading: boolean;
  /** A time was chosen, by either route. The caller confirms it. */
  onPickTime: (time: string, reasons: EmergencyReason[]) => void;
  /** How the provider is named to the client. */
  providerLabel: string;
  /** Latest requestable date, or undefined when this provider takes requests
   *  beyond their booking window (in which case there is no ceiling). */
  maxDate?: Date | undefined;
  accentColor: string;
  surfaceColor: string;
  textColor: string;
  subColor: string;
}

const toLocalDateString = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** 'YYYY-MM-DD' -> local midnight. Deliberately not new Date(str), which
 *  parses a bare date as UTC and lands on the previous day west of Greenwich. */
const fromLocalDateString = (value: string): Date => {
  const [y, m, d] = value.split('-').map(part => parseInt(part, 10));
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};

export const RequestTimeSheet: React.FC<RequestTimeSheetProps> = ({
  visible,
  onClose,
  date,
  onDateChange,
  requestTimes,
  loading,
  onPickTime,
  providerLabel,
  maxDate,
  accentColor,
  surfaceColor,
  textColor,
  subColor,
}) => {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [wheelValue, setWheelValue] = useState<Date>(new Date());
  /** Set when the wheel asked for a time this provider won't consider. Cleared
   *  on any other interaction — it describes one attempt, not a state. */
  const [wheelError, setWheelError] = useState<string | null>(null);

  // Sorted once, and reused by both the snap and the range message so they
  // can't disagree about what the earliest/latest offer actually is.
  const candidates = useMemo(
    () =>
      requestTimes
        .map(slot => ({ ...slot, mins: parseTimeToMinutes(slot.time) }))
        .sort((a, b) => a.mins - b.mins),
    [requestTimes],
  );

  const earliest = candidates[0];
  const latest = candidates[candidates.length - 1];

  const openWheel = () => {
    Haptics.selectionAsync().catch(() => {});
    setWheelError(null);
    // Seed on the first offer rather than "now", so the wheel opens somewhere
    // this provider would actually accept instead of on a time they won't.
    const seed = fromLocalDateString(date);
    seed.setHours(Math.floor((earliest?.mins ?? 540) / 60), (earliest?.mins ?? 540) % 60, 0, 0);
    setWheelValue(seed);
    setShowTimePicker(true);
  };

  /** Turn what the wheel landed on into a real offer, or say why there isn't
   *  one. The resolution itself is snapToRequestable's — this only chooses
   *  the wording.
   *
   *  Both platforms commit through here — the iOS Done button and the Android
   *  dialog's own confirmation — so the two can't drift on what a picked time
   *  resolves to. */
  const commitPickedMinutes = (picked: number) => {
    const result = snapToRequestable(picked, candidates);
    if (result.kind === 'none') {
      setWheelError(`${providerLabel} isn't taking requests on this date.`);
      return;
    }
    if (result.kind === 'out-of-range') {
      setWheelError(
        `${providerLabel} will only consider ${result.earliest.time} to ${result.latest.time} on this date.`,
      );
      return;
    }
    setWheelError(null);
    handlePick(result.slot.time, result.slot.reasons);
  };

  const commitWheel = () => {
    setShowTimePicker(false);
    commitPickedMinutes(wheelValue.getHours() * 60 + wheelValue.getMinutes());
  };

  const handlePick = (time: string, reasons: EmergencyReason[]) => {
    Haptics.selectionAsync().catch(() => {});
    onPickTime(time, reasons);
    onClose();
  };

  const handleDateChange = (next: Date) => {
    setWheelError(null);
    const nextString = toLocalDateString(next);
    if (nextString !== date) onDateChange(nextString);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.card,
            { backgroundColor: surfaceColor, borderColor: withAlpha(textColor, 0.14) },
          ]}
        >
          <ScrollView bounces={false} contentContainerStyle={styles.body}>
            <Text style={[styles.title, { color: textColor }]}>Request a time</Text>
            <Text style={[styles.lead, { color: subColor }]}>
              These fall outside {providerLabel}'s usual availability. They have to
              accept the request before the booking is confirmed — it won't be
              booked automatically, and they may say no.
            </Text>

            <Text style={[styles.label, { color: subColor }]}>Date</Text>
            <TouchableOpacity
              style={[styles.row, { borderColor: withAlpha(textColor, 0.18) }]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setShowDatePicker(true);
              }}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`Change date, currently ${formatLongDateNoYear(date)}`}
            >
              <Text style={[styles.rowText, { color: textColor }]}>{formatLongDateNoYear(date)}</Text>
              <Text style={[styles.chevron, { color: subColor }]}>›</Text>
            </TouchableOpacity>

            <Text style={[styles.label, { color: subColor }]}>
              Times {providerLabel} may accept
            </Text>

            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={accentColor} />
              </View>
            ) : candidates.length === 0 ? (
              <Text style={[styles.empty, { color: subColor }]}>
                {providerLabel} isn't taking requests on this date. Try another one.
              </Text>
            ) : (
              <View style={styles.chipWrap}>
                {candidates.map(slot => (
                  <TouchableOpacity
                    key={slot.time}
                    style={[styles.chip, { borderColor: EMERGENCY_OUTLINE }]}
                    onPress={() => handlePick(slot.time, slot.reasons)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`${slot.time}, by request only`}
                  >
                    <Text style={[styles.chipText, { color: EMERGENCY_OUTLINE }]}>{slot.time}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {!loading && candidates.length > 0 && (
              <>
                <View style={styles.orRow}>
                  <View style={[styles.rule, { backgroundColor: withAlpha(textColor, 0.12) }]} />
                  <Text style={[styles.orText, { color: subColor }]}>or</Text>
                  <View style={[styles.rule, { backgroundColor: withAlpha(textColor, 0.12) }]} />
                </View>

                <TouchableOpacity
                  style={[styles.row, { borderColor: withAlpha(accentColor, 0.45) }]}
                  onPress={openWheel}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                >
                  <Text style={[styles.rowText, { color: accentColor }]}>Pick an exact time</Text>
                  <Text style={[styles.chevron, { color: accentColor }]}>›</Text>
                </TouchableOpacity>

                {wheelError && (
                  <Text style={[styles.wheelError, { color: EMERGENCY_OUTLINE }]}>{wheelError}</Text>
                )}
              </>
            )}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.closeButton, { borderColor: withAlpha(textColor, 0.2) }]}
              onPress={onClose}
              activeOpacity={0.75}
              accessibilityRole="button"
            >
              <Text style={[styles.closeText, { color: textColor }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* iOS shows the spinner in its own sheet with an explicit Done, so a
          scroll isn't read as a choice; Android's dialog confirms itself. */}
      {showDatePicker && (Platform.OS === 'ios' ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
          <View style={styles.overlay}>
            <View style={[styles.pickerCard, { backgroundColor: surfaceColor }]}>
              <DateTimePicker
                mode="date"
                value={fromLocalDateString(date)}
                onChange={(_, picked) => { if (picked) handleDateChange(picked); }}
                display="spinner"
                textColor={textColor}
                minimumDate={new Date()}
                {...(maxDate ? { maximumDate: maxDate } : {})}
                style={styles.picker}
              />
              <TouchableOpacity
                style={[styles.doneButton, { backgroundColor: accentColor }]}
                onPress={() => setShowDatePicker(false)}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <Text style={styles.doneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      ) : (
        <DateTimePicker
          mode="date"
          value={fromLocalDateString(date)}
          onChange={(_, picked) => { setShowDatePicker(false); if (picked) handleDateChange(picked); }}
          display="default"
          minimumDate={new Date()}
          {...(maxDate ? { maximumDate: maxDate } : {})}
        />
      ))}

      {showTimePicker && (Platform.OS === 'ios' ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowTimePicker(false)}>
          <View style={styles.overlay}>
            <View style={[styles.pickerCard, { backgroundColor: surfaceColor }]}>
              <DateTimePicker
                mode="time"
                value={wheelValue}
                onChange={(_, picked) => { if (picked) setWheelValue(picked); }}
                display="spinner"
                textColor={textColor}
                style={styles.picker}
              />
              <TouchableOpacity
                style={[styles.doneButton, { backgroundColor: accentColor }]}
                onPress={commitWheel}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <Text style={styles.doneText}>Use this time</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      ) : (
        <DateTimePicker
          mode="time"
          value={wheelValue}
          onChange={(_, picked) => {
            setShowTimePicker(false);
            if (!picked) return;
            // Android's dialog is its own confirmation, so the value it hands
            // back is already committed — resolve it straight away rather than
            // waiting for a Done this platform never shows.
            setWheelValue(picked);
            commitPickedMinutes(picked.getHours() * 60 + picked.getMinutes());
          }}
          display="default"
        />
      ))}
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '82%',
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  body: { padding: 22, paddingBottom: 8 },
  title: { fontFamily: 'BakbakOne-Regular', fontSize: 19, marginBottom: 10 },
  lead: { fontSize: 13, lineHeight: 19, marginBottom: 18 },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.3, marginBottom: 8, textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  rowText: { fontSize: 14, fontWeight: '600', flex: 1 },
  chevron: { fontSize: 18, fontWeight: '600', marginLeft: 8 },
  loadingRow: { paddingVertical: 22, alignItems: 'center' },
  empty: { fontSize: 13, lineHeight: 19, paddingVertical: 8, marginBottom: 10 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    minWidth: 72,
    alignItems: 'center',
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, marginBottom: 14 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  orText: { fontSize: 12, fontWeight: '600' },
  wheelError: { fontSize: 12, lineHeight: 17, marginTop: -8, marginBottom: 10 },
  actions: { paddingHorizontal: 22, paddingBottom: 20, paddingTop: 4 },
  closeButton: { borderWidth: 1, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  closeText: { fontSize: 14, fontWeight: '600' },
  pickerCard: { width: '100%', maxWidth: 340, borderRadius: 20, padding: 16 },
  picker: { width: '100%' },
  doneButton: { borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
  doneText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
