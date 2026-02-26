// src/components/StepProgressIndicator.tsx
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
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
  const { theme, isDarkMode } = useTheme();
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
      {/* Step counter */}
      <View style={styles.labelRow}>
        <Text style={[styles.stepCount, { color: theme.secondaryText }]}>
          {currentStep}
          <Text style={styles.stepTotal}> / {totalSteps}</Text>
        </Text>
        <Text style={[styles.stepLabel, { color: theme.text }]}>{label}</Text>
      </View>

      {/* Progress track */}
      <View
        style={[
          styles.track,
          {
            backgroundColor: isDarkMode
              ? 'rgba(255,255,255,0.08)'
              : 'rgba(255,255,255,0.25)',
          },
        ]}
      >
        <Animated.View
          style={[
            styles.fill,
            {
              width: progressWidth,
              backgroundColor: 'rgba(218,112,214,0.6)',
              ...Platform.select({
                ios: {
                  shadowColor: 'rgba(218,112,214,1)',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.5,
                  shadowRadius: 6,
                },
              }),
            },
          ]}
        >
          {/* Glow tip */}
          <View
            style={[
              styles.glowTip,
              {
                backgroundColor: 'rgba(218,112,214,0.9)',
                ...Platform.select({
                  ios: {
                    shadowColor: '#DA70D6',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.8,
                    shadowRadius: 8,
                  },
                }),
              },
            ]}
          />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 32,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  stepCount: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  stepTotal: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    fontWeight: '500',
  },
  stepLabel: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  glowTip: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: -4,
  },
});
