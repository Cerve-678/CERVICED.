import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
            <TouchableOpacity onPress={onClose} style={[styles.releasePickerClose, { borderColor }]} accessibilityLabel="Close release day picker">
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
                  onPress={() => onSelect(day)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.releaseDayOptionText, { color: textColor }, selected && styles.releaseDayOptionTextSelected]}>{day}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity style={[styles.releasePickerDoneButton, { backgroundColor: accentColor }]} onPress={onClose}>
            <Text style={styles.releasePickerDoneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
