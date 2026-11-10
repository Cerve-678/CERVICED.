// src/components/SignUpHeader.tsx
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

interface SignUpHeaderProps {
  onBack: () => void;
  currentStep: number;
  totalSteps: number;
  /** Optional text action shown before the step count, e.g. "Skip". */
  rightAction?: { label: string; onPress: () => void };
}

/** Back button + "n / total" row shared by every sign-up step. */
export default function SignUpHeader({ onBack, currentStep, totalSteps, rightAction }: SignUpHeaderProps) {
  const { palette: t } = useTheme();
  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.backBtn, { backgroundColor: t.card, borderColor: t.border }]}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onBack(); }}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Ionicons name="chevron-back" size={20} color={t.text} />
      </TouchableOpacity>
      <View style={styles.right}>
        {rightAction && (
          <TouchableOpacity onPress={rightAction.onPress} activeOpacity={0.6} hitSlop={10}>
            <Text style={[styles.action, { color: t.accent }]}>{rightAction.label}</Text>
          </TouchableOpacity>
        )}
        <Text style={[styles.count, { color: t.sub }]}>{currentStep} / {totalSteps}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  backBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  right: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  action: { fontFamily: 'Jura-VariableFont_wght', fontSize: 14, fontWeight: '700' },
  count: { fontFamily: 'Jura-VariableFont_wght', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
});
