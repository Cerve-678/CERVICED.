import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

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

/** Chooses the monthly day on which followers are notified of fresh slots. */
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
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose} presentationStyle="overFullScreen">
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
          <View style={styles.releaseDayGrid}>
            {Array.from({ length: 31 }, (_, index) => index + 1).map(day => {
              const selected = value === day;
              return (
                <TouchableOpacity
                  key={day}
                  style={[styles.releaseDayOption, { borderColor }, selected && { backgroundColor: accentColor, borderColor: accentColor }]}
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); onSelect(day); }}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.releaseDayOptionText, { color: textColor }, selected && styles.releaseDayOptionTextSelected]}>{day}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
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
