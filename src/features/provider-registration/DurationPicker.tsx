import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { isDarkColor } from '../../constants/providerThemes';

// Half-hour steps to 6 hr, then whole hours for long services (braids, colour
// correction, full sets). Each label must read back as the same minutes through
// serviceDurationToMinutes in providerRegistrationService.
export const DURATION_PRESETS = [
  '15 min', '30 min', '45 min', '1 hr', '1 hr 30', '2 hr', '2 hr 30', '3 hr', '3 hr 30',
  '4 hr', '4 hr 30', '5 hr', '5 hr 30', '6 hr', '7 hr', '8 hr',
];

interface DurationPickerProps {
  value: string;
  onChange: (value: string) => void;
  accentColor?: string;
  styles: any;
}

/** Preset duration selector that preserves legacy/custom duration values. */
export function DurationPicker({ value, onChange, accentColor = '#AF9197', styles }: DurationPickerProps) {
  const presets = DURATION_PRESETS.includes(value) || !value ? DURATION_PRESETS : [value, ...DURATION_PRESETS];
  return (
    <View style={styles.chipGrid}>
      {presets.map(option => {
        const active = value === option;
        return (
          <TouchableOpacity
            key={option}
            style={[styles.durationChip, active && { backgroundColor: accentColor, borderColor: accentColor }]}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(active ? '' : option); }}
            activeOpacity={0.8}
          >
            <Text style={[styles.durationChipText, active && styles.durationChipTextActive, active && { color: isDarkColor(accentColor) ? '#FFFFFF' : '#1B2740' }]}>{option}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
