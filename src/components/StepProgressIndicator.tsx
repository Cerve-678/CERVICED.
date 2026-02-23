// src/components/StepProgressIndicator.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface StepProgressIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export default function StepProgressIndicator({ currentStep, totalSteps }: StepProgressIndicatorProps) {
  const { theme, isDarkMode } = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.dotsRow}>
        {Array.from({ length: totalSteps }, (_, i) => {
          const stepNum = i + 1;
          const isCompleted = stepNum < currentStep;
          const isCurrent = stepNum === currentStep;

          return (
            <React.Fragment key={stepNum}>
              {i > 0 && (
                <View
                  style={[
                    styles.connector,
                    {
                      backgroundColor: isCompleted
                        ? 'rgba(218,112,214,0.5)'
                        : isDarkMode
                          ? 'rgba(255,255,255,0.15)'
                          : 'rgba(255,255,255,0.4)',
                    },
                  ]}
                />
              )}
              <View
                style={[
                  styles.dot,
                  isCurrent && styles.dotCurrent,
                  {
                    backgroundColor: isCompleted || isCurrent
                      ? 'rgba(218,112,214,0.5)'
                      : isDarkMode
                        ? 'rgba(255,255,255,0.15)'
                        : 'rgba(255,255,255,0.25)',
                    borderColor: isCompleted || isCurrent
                      ? 'rgba(218,112,214,0.7)'
                      : isDarkMode
                        ? 'rgba(255,255,255,0.2)'
                        : 'rgba(255,255,255,0.5)',
                  },
                ]}
              />
            </React.Fragment>
          );
        })}
      </View>
      <Text style={[styles.label, { color: theme.secondaryText }]}>
        Step {currentStep} of {totalSteps}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginBottom: 28,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  dotCurrent: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  connector: {
    width: 32,
    height: 2,
    borderRadius: 1,
  },
  label: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    marginTop: 8,
    letterSpacing: 0.5,
  },
});
