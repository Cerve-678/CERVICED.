// src/components/StepProgressIndicator.tsx
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface StepProgressIndicatorProps {
  currentStep: number;
  totalSteps: number;
  stepLabel?: string;
}

const STEP_LABELS: Record<number, string> = {
  1: 'Account Type',
  2: 'Your Details',
  3: 'Personal Info',
  4: 'Preferences',
};

export default function StepProgressIndicator({ currentStep, totalSteps, stepLabel }: StepProgressIndicatorProps) {
  const { isDarkMode, palette: t } = useTheme();
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(progressAnim, {
      toValue: currentStep / totalSteps,
      tension: 60,
      friction: 12,
      useNativeDriver: false,
    }).start();
  }, [currentStep, totalSteps]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const label = stepLabel || STEP_LABELS[currentStep] || `Step ${currentStep}`;

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={[styles.stepCount, { color: t.sub }]}>
          {currentStep}
          <Text style={[styles.stepTotal, { color: t.sub }]}> / {totalSteps}</Text>
        </Text>
        <Text style={[styles.stepLabel, { color: t.sub }]}>{label}</Text>
      </View>

      <View style={[styles.track, { backgroundColor: t.border }]}>
        <Animated.View style={[styles.fill, { width: progressWidth, backgroundColor: t.accent }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 32 },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  stepCount: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  stepTotal: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
  },
  stepLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  track: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
  },
});
