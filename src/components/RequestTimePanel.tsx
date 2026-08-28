/**
 * "Request a time" — the panel a client opens to ask for a time the
 * provider's ordinary scheduling rules exclude.
 *
 * INLINE, NOT A MODAL, AND THAT IS THE POINT. This panel opens in place of
 * the ordinary time grid inside ModernBeautyCalendar, which itself renders
 * inside BookingSheet — and BookingSheet is already a Modal. A modal here
 * made that Modal -> Modal, and opening a date/time picker inside it made
 * three, which on iOS reliably ends with an overlay that eats every touch and
 * a screen that looks frozen. Nothing in here may introduce a Modal: the
 * pickers below render inline (iOS) or as the platform's own native dialog
 * (Android), neither of which stacks.
 *
 * WHY THIS ISN'T THE PICKER'S INLINE RED CHIPS ANY MORE. A provider who opts
 * into out-of-hours requests and leaves request_window_before/after_mins at
 * their default (NULL, "any time") generates a by-request candidate for every
 * step of the whole 24 hours — 48 at a 30-minute interval, 96 at 15. Rendered
 * inline those buried the handful of times the provider is actually free
 * under a wall of red, on every day. They now render only once asked for,
 * which is also why the grid is no longer paying to lay them out every time
 * the client changes day.
 *
 * TWO WAYS IN, ONE SET OF TIMES. The chips and the wheel both read the SAME
 * resolved candidates the caller passes down — the wheel does not compute its
 * own. That is deliberate and load-bearing: every offerable time has already
 * been through resolveSlotOffer() and the busy-span check, so neither path
 * can offer something enforce_booking_bookability() would then reject. A
 * second route working out its own answer is how a picker and the trigger
 * drift apart.
 *
 * Whichever route is used, the time chosen here is a REQUEST: it carries its
 * reasons out through onPickTime, which is what eventually sets
 * bookings.is_emergency_request, and BOTH checkout paths — the live
 * claim_cart_booking_slots() and the not-yet-live finalize_checkout() —
 * force auto-accept off whenever that flag is set. A provider always answers
 * one of these by hand, even one who has auto-accept switched on. (The claim
 * path was the gap: it went unpatched until 20260827200000, so until then an
 * auto-accepting provider was committed to these silently.)
 *
 * Colours come from the caller, never from the app's light/dark setting —
 * same rule as ModernBeautyCalendar and EmergencyBookingPrompt.
 */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import type { EmergencyReason, RequestCandidate } from '../services/AvailabilityService';
import { parseTimeToMinutes, snapToRequestable } from '../services/AvailabilityService';
import { formatLongDateNoYear } from '../utils/dateUtils';
import { withAlpha } from '../constants/providerThemes';

/** Same fixed warning red as the rest of the by-request UI — see
 *  ModernBeautyCalendar's EMERGENCY_OUTLINE for why it isn't the accent. */
const EMERGENCY_OUTLINE = '#FF3B30';

interface RequestTimePanelProps {
  /** 'YYYY-MM-DD' being requested. */
  date: string;
  /** Move to another date. The caller owns the fetch, so `requestTimes`
   *  arrives updated (with `loading` true meanwhile). */
  onDateChange: (date: string) => void;
  /** Every by-request time for `date`, already resolved with the rules each
   *  one breaks. Never recomputed here — see the header. */
  requestTimes: { time: string; reasons: EmergencyReason[] }[];
  loading: boolean;
  /** A time was chosen, by either route. The caller confirms it. */
  onPickTime: (time: string, reasons: EmergencyReason[]) => void;
  /** Close the panel and go back to the ordinary times. */
  onBack: () => void;
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

export const RequestTimePanel: React.FC<RequestTimePanelProps> = ({
  date,
  onDateChange,
  requestTimes,
  loading,
  onPickTime,
  onBack,
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
  /** Set when the wheel asked for a time this provider won't consider.
   *  Describes one attempt, not a state, so any other interaction clears it. */
  const [wheelError, setWheelError] = useState<string | null>(null);

  // Sorted once, and reused by both the snap and the range message so the two
  // can't disagree about what the earliest/latest offer actually is.
  const candidates: RequestCandidate[] = useMemo(
    () =>
      requestTimes
        .map(slot => ({ ...slot, mins: parseTimeToMinutes(slot.time) }))
        .sort((a, b) => a.mins - b.mins),
    [requestTimes],
  );

  const handlePick = (time: string, reasons: EmergencyReason[]) => {
    Haptics.selectionAsync().catch(() => {});
    onPickTime(time, reasons);
  };

  /** Turn what the wheel landed on into a real offer, or say why there isn't
   *  one. The resolution itself is snapToRequestable's — this only chooses the
   *  wording. Both platforms commit through here, so they can't drift on what
   *  a picked time resolves to. */
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

  const openWheel = () => {
    Haptics.selectionAsync().catch(() => {});
    setWheelError(null);
    // Seed on the first offer rather than "now", so the wheel opens somewhere
    // this provider would actually accept instead of on a time they won't.
    const first = candidates[0];
    const seed = fromLocalDateString(date);
    seed.setHours(Math.floor((first?.mins ?? 540) / 60), (first?.mins ?? 540) % 60, 0, 0);
    setWheelValue(seed);
    setShowTimePicker(true);
  };

  const handleDateChange = (next: Date) => {
    setWheelError(null);
    const nextString = toLocalDateString(next);
    if (nextString !== date) onDateChange(nextString);
  };

  const hairline = withAlpha(textColor, 0.14);

  return (
    <View style={[styles.panel, { borderColor: withAlpha(EMERGENCY_OUTLINE, 0.4) }]}>
      <TouchableOpacity
        style={styles.backRow}
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          onBack();
        }}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="Back to available times"
      >
        <Text style={[styles.backChevron, { color: subColor }]}>‹</Text>
        <Text style={[styles.backText, { color: subColor }]}>Available times</Text>
      </TouchableOpacity>

      <Text style={[styles.lead, { color: subColor }]}>
        These fall outside {providerLabel}'s usual availability. They have to accept
        the request before it's booked — it won't be confirmed automatically.
      </Text>

      <TouchableOpacity
        style={[styles.row, { borderColor: hairline }]}
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          setShowDatePicker(open => !open);
        }}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`Change date, currently ${formatLongDateNoYear(date)}`}
      >
        <Text style={[styles.rowLabel, { color: subColor }]}>Date</Text>
        <Text style={[styles.rowValue, { color: textColor }]}>{formatLongDateNoYear(date)}</Text>
        <Text style={[styles.chevron, { color: subColor }]}>{showDatePicker ? '⌃' : '⌄'}</Text>
      </TouchableOpacity>

      {/* Inline on iOS; Android's own native dialog on Android. Never a
          Modal — see this file's header. */}
      {showDatePicker && (Platform.OS === 'ios' ? (
        <View style={[styles.pickerWell, { backgroundColor: surfaceColor }]}>
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

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={accentColor} />
        </View>
      ) : candidates.length === 0 ? (
        <Text style={[styles.empty, { color: subColor }]}>
          {providerLabel} isn't taking requests on this date. Try another one.
        </Text>
      ) : (
        <>
          <Text style={[styles.groupLabel, { color: subColor }]}>
            Times {providerLabel} may accept
          </Text>
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

          <View style={styles.orRow}>
            <View style={[styles.rule, { backgroundColor: hairline }]} />
            <Text style={[styles.orText, { color: subColor }]}>or</Text>
            <View style={[styles.rule, { backgroundColor: hairline }]} />
          </View>

          <TouchableOpacity
            style={[styles.row, { borderColor: withAlpha(accentColor, 0.45) }]}
            onPress={() => (showTimePicker ? setShowTimePicker(false) : openWheel())}
            activeOpacity={0.75}
            accessibilityRole="button"
          >
            <Text style={[styles.rowValue, { color: accentColor }]}>Pick an exact time</Text>
            <Text style={[styles.chevron, { color: accentColor }]}>{showTimePicker ? '⌃' : '⌄'}</Text>
          </TouchableOpacity>

          {showTimePicker && (Platform.OS === 'ios' ? (
            <View style={[styles.pickerWell, { backgroundColor: surfaceColor }]}>
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
                onPress={() => {
                  setShowTimePicker(false);
                  commitPickedMinutes(wheelValue.getHours() * 60 + wheelValue.getMinutes());
                }}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <Text style={styles.doneText}>Use this time</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <DateTimePicker
              mode="time"
              value={wheelValue}
              onChange={(_, picked) => {
                setShowTimePicker(false);
                if (!picked) return;
                // Android's dialog is its own confirmation, so the value it
                // hands back is already committed — resolve it straight away
                // rather than waiting for a Done this platform never shows.
                setWheelValue(picked);
                commitPickedMinutes(picked.getHours() * 60 + picked.getMinutes());
              }}
              display="default"
            />
          ))}

          {wheelError && (
            <Text style={[styles.wheelError, { color: EMERGENCY_OUTLINE }]}>{wheelError}</Text>
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 10 },
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  backChevron: { fontSize: 17, fontWeight: '600', marginRight: 4 },
  backText: { fontSize: 12, fontWeight: '600' },
  lead: { fontSize: 11.5, lineHeight: 16, marginBottom: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  rowLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginRight: 10 },
  rowValue: { fontSize: 13, fontWeight: '600', flex: 1 },
  chevron: { fontSize: 13, fontWeight: '700', marginLeft: 8 },
  pickerWell: { borderRadius: 12, marginTop: 8, paddingHorizontal: 8, paddingBottom: 8 },
  picker: { width: '100%' },
  doneButton: { borderRadius: 11, paddingVertical: 11, alignItems: 'center' },
  doneText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  loadingRow: { paddingVertical: 20, alignItems: 'center' },
  empty: { fontSize: 12, lineHeight: 17, paddingTop: 14 },
  groupLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 16, marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 9, paddingVertical: 7, paddingHorizontal: 10, minWidth: 64, alignItems: 'center' },
  chipText: { fontSize: 12, fontWeight: '600' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 12 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  orText: { fontSize: 11, fontWeight: '600' },
  wheelError: { fontSize: 11.5, lineHeight: 16, marginTop: 8 },
});
