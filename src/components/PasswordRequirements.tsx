import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PASSWORD_RULES } from '../utils/validation';

interface Props {
  password: string;
  goodColor: string;
  pendingColor: string;
  /** 'chips' renders each rule as a pill that fills in once met (sign-up). */
  layout?: 'list' | 'chips';
  /** Fill behind a met chip; only used by the chips layout. */
  goodFill?: string;
}

export function PasswordRequirements({ password, goodColor, pendingColor, layout = 'list', goodFill }: Props) {
  if (layout === 'chips') {
    return (
      <View style={styles.chips}>
        {PASSWORD_RULES.map(rule => {
          const met = rule.test(password);
          return (
            <View
              key={rule.key}
              style={[
                styles.chip,
                met ? { backgroundColor: goodFill, borderColor: 'transparent' } : { borderColor: pendingColor, borderStyle: 'dashed' },
              ]}
            >
              {met && <Ionicons name="checkmark" size={12} color={goodColor} />}
              <Text style={[styles.chipLabel, { color: met ? goodColor : pendingColor }]}>{rule.label}</Text>
            </View>
          );
        })}
      </View>
    );
  }
  return (
    <View style={styles.container}>
      {PASSWORD_RULES.map(rule => {
        const met = rule.test(password);
        const color = met ? goodColor : pendingColor;
        return (
          <View key={rule.key} style={styles.row}>
            <Text style={[styles.mark, { color }]}>{met ? '✓' : '○'}</Text>
            <Text style={[styles.label, { color }]}>{rule.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', marginTop: 8, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  mark: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, width: 18 },
  label: { fontSize: 13, fontFamily: 'Jura-VariableFont_wght' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100, borderWidth: 1 },
  chipLabel: { fontFamily: 'Jura-VariableFont_wght', fontSize: 12, fontWeight: '600' },
});
