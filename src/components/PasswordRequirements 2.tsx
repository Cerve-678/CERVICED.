import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PASSWORD_RULES } from '../utils/validation';

interface Props {
  password: string;
  goodColor: string;
  pendingColor: string;
}

export function PasswordRequirements({ password, goodColor, pendingColor }: Props) {
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
});
