import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { withAlpha } from '../../constants/providerThemes';

interface ChipSelectProps {
  options: string[];
  selected: string[];
  onToggle: (tag: string) => void;
  accentColor?: string;
  styles: any;
}

/** Multi-select chip grid used for provider service discovery tags. */
export function ChipSelect({ options, selected, onToggle, accentColor = '#9C27B0', styles }: ChipSelectProps) {
  return (
    <View style={styles.chipGrid}>
      {options.map(option => {
        const active = selected.includes(option);
        return (
          <TouchableOpacity
            key={option}
            style={[styles.chip, active && { backgroundColor: withAlpha(accentColor, 0.18), borderColor: accentColor }]}
            onPress={() => onToggle(option)}
          >
            <Text style={[styles.chipText, active && { color: accentColor }]}>{option}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
