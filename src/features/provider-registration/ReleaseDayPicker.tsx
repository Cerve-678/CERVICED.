import React from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import * as Haptics from 'expo-haptics';
import { ordinalSuffix } from '../../utils/dateUtils';

const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

interface ReleaseDayPickerProps {
  visible: boolean;
  value: number;
  accentColor: string;
  cardColor: string;
  textColor: string;
  subColor: string;
  borderColor: string;
  onSelect: (day: number) => void;
  onClose: () => void;
  /** Show an action that unsets the day (back to a rolling window). The
   *  picker IS the control in InfoReg, so without it there's no way back to
   *  "no release day" once a day has been chosen. */
  allowClear?: boolean;
  onClear?: () => void;
}

/** Chooses the monthly release day: next month opens for booking on this day
 *  (utils/bookingHorizon), and followers with the bell on are told. Its one
 *  caller is InfoRegScreen (Edit Profile) — the release day's only editor.
 *
 *  A native single-column wheel (UIPickerView on iOS, Spinner on Android) with
 *  our own labels, rather than a date picker. The value is a monthly
 *  recurrence, not a date: a real date picker always renders month and year
 *  columns — UIDatePicker has no mode that omits them — and both would be
 *  dials with nothing behind them. */
export function ReleaseDayPicker({
  visible,
  value,
  accentColor,
  cardColor,
  textColor,
  subColor,
  borderColor,
  onSelect,
  onClose,
  allowClear = false,
  onClear,
}: ReleaseDayPickerProps) {
  return (
    <Modal transparent statusBarTranslucent navigationBarTranslucent animationType="slide" visible={visible} onRequestClose={onClose} presentationStyle="overFullScreen">
      <View style={styles.releasePickerOverlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[styles.releasePickerSheet, { backgroundColor: cardColor, borderColor }]}>
          <View style={styles.releasePickerHeader}>
            <View>
              <Text style={[styles.releasePickerEyebrow, { color: subColor }]}>BOOKING RULES</Text>
              <Text style={[styles.releasePickerTitle, { color: textColor }]}>Choose release day</Text>
            </View>
            <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onClose(); }} style={[styles.releasePickerClose, { borderColor }]} accessibilityLabel="Close release day picker">
              <Ionicons name="close" size={20} color={textColor} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.releasePickerSubtext, { color: subColor }]}>{RELEASE_DAY_EXPLAINER}</Text>
          <Picker
            selectedValue={value}
            onValueChange={(day) => {
              if (day === value) return;
              Haptics.selectionAsync().catch(() => {});
              onSelect(day);
            }}
            // iOS-only, and the only way to colour the wheel's own rows — the
            // native picker doesn't inherit text colour from its container, so
            // without this it renders black on a dark provider theme.
            itemStyle={[localStyles.item, { color: textColor }]}
            // Android renders a dropdown rather than an inline wheel, so it
            // takes the container's colours here instead of itemStyle.
            dropdownIconColor={accentColor}
            style={Platform.OS === 'android' ? { color: textColor } : localStyles.wheel}
          >
            {DAYS.map(day => (
              <Picker.Item key={day} label={`${ordinalSuffix(day)} of the month`} value={day} color={textColor} />
            ))}
          </Picker>
          {allowClear && onClear && (
            <TouchableOpacity
              style={styles.releasePickerClearButton}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onClear(); onClose(); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.releasePickerClearText, { color: subColor }]}>No release day — use a rolling window</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.releasePickerDoneButton, { backgroundColor: accentColor }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onClose(); }}>
            <Text style={styles.releasePickerDoneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/** What a release day does, in one place for every screen that sets it. */
export const RELEASE_DAY_EXPLAINER =
  'On this day each month, next month opens for booking at 9am (10am in summer) and followers with the bell on are told. Until then clients can book up to the end of this month.';

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
    fontFamily: 'Jura-VariableFont_wght',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  releasePickerTitle: {
    fontFamily: 'BakbakOne-Regular',
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
    fontFamily: 'Jura-VariableFont_wght',
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
    fontFamily: 'Jura-VariableFont_wght',
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
    fontFamily: 'BakbakOne-Regular',
    fontSize: 15,
    color: '#FFFFFF',
  },
});

const localStyles = StyleSheet.create({
  wheel: {
    width: '100%',
  },
  item: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 19,
  },
});
