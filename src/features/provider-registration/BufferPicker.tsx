import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';

interface BufferOption {
  /** Minutes as a string, or '' for the nullable "no override" state. */
  value: string;
  label: string;
}

/**
 * What the collapsed field shows for a value. Every option carries a real
 * label, including '' — the "no override" state is a choice a provider made
 * (or inherited), not an empty field, so it renders as "None" / "My default"
 * rather than placeholder text.
 */
export const bufferOptionLabel = (value: string, options: BufferOption[]): string =>
  options.find(opt => opt.value === value)?.label ?? `${value} min`;

interface BufferPickerProps {
  value: string;
  onChange: (value: string) => void;
  options: BufferOption[];
  accentColor?: string;
  styles: any;
}

/**
 * Single-select buffer chips, sharing DurationPicker's chip styling so the two
 * pickers in the service sheet read as the same control.
 *
 * Unlike DurationPicker a chip can't be tapped off: every option here is a real
 * choice, including the first one ('' — no override, which is what an untouched
 * service already has). Deselecting would just be a second way to reach the
 * state the first chip already names.
 *
 * A value saved before this replaced the free-typed minutes field can be one
 * the presets don't offer. It's shown as its own leading chip rather than
 * silently dropped — same handling DurationPicker gives a legacy duration.
 */
export function BufferPicker({ value, onChange, options, accentColor = '#AF9197', styles }: BufferPickerProps) {
  const known = options.some(opt => opt.value === value);
  const resolved = known ? options : [{ value, label: `${value} min` }, ...options];
  return (
    <View style={styles.chipGrid}>
      {resolved.map(option => {
        const active = value === option.value;
        return (
          <TouchableOpacity
            key={option.value || 'inherit'}
            style={[styles.durationChip, active && { backgroundColor: accentColor, borderColor: accentColor }]}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(option.value); }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.durationChipText, active && styles.durationChipTextActive]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
