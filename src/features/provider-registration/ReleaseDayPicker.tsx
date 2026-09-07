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
  /** Show a "Don't notify" action that unsets the day entirely. Callers that
   *  reach this picker from a separate on/off switch don't need it; the one
   *  that uses the picker AS the control does, or there's no way back to
   *  "no release day" once a day has been tapped. */
  allowClear?: boolean;
  onClear?: () => void;
  styles: any;
}

/** Chooses the monthly day on which followers are notified of fresh slots.
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
  styles,
}: ReleaseDayPickerProps) {
  return (
    <Modal transparent statusBarTranslucent navigationBarTranslucent animationType="slide" visible={visible} onRequestClose={onClose} presentationStyle="overFullScreen">
      <View style={styles.releasePickerOverlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[styles.releasePickerSheet, { backgroundColor: cardColor, borderColor }]}>
          <View style={styles.releasePickerHeader}>
            <View>
              <Text style={[styles.releasePickerEyebrow, { color: subColor }]}>BOOKING NOTIFICATIONS</Text>
              <Text style={[styles.releasePickerTitle, { color: textColor }]}>Choose release day</Text>
            </View>
            <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onClose(); }} style={[styles.releasePickerClose, { borderColor }]} accessibilityLabel="Close release day picker">
              <Ionicons name="close" size={20} color={textColor} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.releasePickerSubtext, { color: subColor }]}>Followers will be reminded when your next month of slots opens.</Text>
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
              <Text style={[styles.releasePickerClearText, { color: subColor }]}>Don’t notify followers</Text>
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

// Geometry/typography only — every colour still comes from the caller's theme
// tokens. (Same pattern as LocationPicker's localStyles.)
const localStyles = StyleSheet.create({
  wheel: {
    width: '100%',
  },
  item: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 19,
  },
});
