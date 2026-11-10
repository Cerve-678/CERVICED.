import React from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import * as Haptics from 'expo-haptics';
import { ordinalSuffix } from '../../utils/dateUtils';
import { isDarkColor } from '../../constants/providerThemes';
import { releaseTimeLabel } from '../../utils/bookingHorizon';

const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);
/** On the hour, midnight to 11pm. A stored time off the hour (none today)
 *  is still offered, so opening the picker never changes it. */
const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

interface ReleaseDayPickerProps {
  visible: boolean;
  value: number;
  /** 'HH:MM', UK time. */
  time: string;
  accentColor: string;
  cardColor: string;
  textColor: string;
  subColor: string;
  borderColor: string;
  onSelect: (day: number) => void;
  onSelectTime: (time: string) => void;
  onClose: () => void;
  /** Show an action that unsets the day (back to a rolling window). Edit
   *  Profile uses it, because there the picker IS the control. Scheduling
   *  doesn't: its rolling / monthly choice already does this. */
  allowClear?: boolean;
  onClear?: () => void;
}

/** Chooses the monthly release day and time: next month opens for booking on
 *  this day at this time, UK time (utils/bookingHorizon), and followers with
 *  the bell on are told within a few minutes. Used by
 *  both screens that edit it: SchedulingScreen and InfoRegScreen (Edit
 *  Profile). They save the same stored value, so a change on either shows
 *  on the other.
 *
 *  A native single-column wheel (UIPickerView on iOS, Spinner on Android) with
 *  our own labels, rather than a date picker. The value is a monthly
 *  recurrence, not a date: a real date picker always renders month and year
 *  columns — UIDatePicker has no mode that omits them — and both would be
 *  dials with nothing behind them. */
export function ReleaseDayPicker({
  visible,
  value,
  time,
  accentColor,
  cardColor,
  textColor,
  subColor,
  borderColor,
  onSelect,
  onSelectTime,
  onClose,
  allowClear = false,
  onClear,
}: ReleaseDayPickerProps) {
  const hours = HOURS.includes(time) ? HOURS : [time, ...HOURS];
  // iOS-only itemStyle is the only way to colour the wheel's own rows — the
  // native picker doesn't inherit text colour from its container, so without
  // it the rows render black on a dark provider theme. Android renders a
  // dropdown rather than an inline wheel, so it takes the container's colours.
  const wheelProps = {
    itemStyle: [localStyles.item, { color: textColor }],
    dropdownIconColor: accentColor,
    style: Platform.OS === 'android' ? { color: textColor } : localStyles.wheel,
  };
  return (
    <Modal transparent statusBarTranslucent navigationBarTranslucent animationType="slide" visible={visible} onRequestClose={onClose} presentationStyle="overFullScreen">
      <View style={styles.releasePickerOverlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[styles.releasePickerSheet, { backgroundColor: cardColor, borderColor }]}>
          <View style={styles.releasePickerHeader}>
            <View>
              <Text style={[styles.releasePickerEyebrow, { color: subColor }]}>BOOKING RULES</Text>
              <Text style={[styles.releasePickerTitle, { color: textColor }]}>Choose release day & time</Text>
            </View>
            <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onClose(); }} style={[styles.releasePickerClose, { borderColor }]} accessibilityLabel="Close release day picker">
              <Ionicons name="close" size={20} color={textColor} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.releasePickerSubtext, { color: subColor }]}>{RELEASE_DAY_EXPLAINER}</Text>
          <View style={localStyles.wheels}>
            <View style={localStyles.dayColumn}>
              <Text style={[styles.releasePickerEyebrow, localStyles.wheelLabel, { color: subColor }]}>DAY</Text>
              <Picker
                selectedValue={value}
                onValueChange={(day) => {
                  if (day === value) return;
                  Haptics.selectionAsync().catch(() => {});
                  onSelect(day);
                }}
                accessibilityLabel="Release day"
                {...wheelProps}
              >
                {DAYS.map(day => (
                  <Picker.Item key={day} label={`${ordinalSuffix(day)} of the month`} value={day} color={textColor} />
                ))}
              </Picker>
            </View>
            <View style={localStyles.timeColumn}>
              <Text style={[styles.releasePickerEyebrow, localStyles.wheelLabel, { color: subColor }]}>TIME</Text>
              <Picker
                selectedValue={time}
                onValueChange={(next) => {
                  if (next === time) return;
                  Haptics.selectionAsync().catch(() => {});
                  onSelectTime(next);
                }}
                accessibilityLabel="Release time"
                {...wheelProps}
              >
                {hours.map(hour => (
                  <Picker.Item key={hour} label={releaseTimeLabel(hour)} value={hour} color={textColor} />
                ))}
              </Picker>
            </View>
          </View>
          {allowClear && onClear && (
            <TouchableOpacity
              style={styles.releasePickerClearButton}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onClear(); onClose(); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.releasePickerClearText, { color: subColor }]}>No release day, use a rolling window</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.releasePickerDoneButton, { backgroundColor: accentColor }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onClose(); }}>
            <Text style={[styles.releasePickerDoneText, { color: isDarkColor(accentColor) ? '#FFFFFF' : '#1B2740' }]}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/** What a release day does, in one place for every screen that sets it. */
export const RELEASE_DAY_EXPLAINER =
  'On this day each month, at this time (UK time), next month opens for booking and followers with the bell on are told. Until then clients can book up to the end of this month.';

// Geometry/typography only — every colour comes from the caller's theme
// tokens via props. (Same pattern as LocationPicker's localStyles.)
const styles = StyleSheet.create({
  releasePickerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20,14,18,0.46)',
  },
  releasePickerSheet: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 34,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  releasePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  releasePickerEyebrow: {
    fontFamily: 'JosefinSans-VariableFont_wght',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  releasePickerTitle: {
    fontFamily: 'JosefinSans-Bold',
    fontSize: 21,
  },
  releasePickerClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  releasePickerSubtext: {
    fontFamily: 'JosefinSans-VariableFont_wght',
    fontWeight: '600',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
    marginBottom: 18,
  },
  releasePickerClearButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 14,
  },
  releasePickerClearText: {
    fontFamily: 'JosefinSans-VariableFont_wght',
    fontWeight: '600',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  releasePickerDoneButton: {
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    marginTop: 20,
  },
  releasePickerDoneText: {
    fontFamily: 'JosefinSans-Bold',
    fontSize: 15,
    color: '#FFFFFF',
  },
});

const localStyles = StyleSheet.create({
  wheels: {
    flexDirection: 'row',
    gap: 8,
  },
  dayColumn: {
    flex: 3,
  },
  timeColumn: {
    flex: 2,
  },
  wheelLabel: {
    textAlign: 'center',
  },
  wheel: {
    width: '100%',
  },
  item: {
    fontFamily: 'JosefinSans-VariableFont_wght',
    fontSize: 19,
  },
});
