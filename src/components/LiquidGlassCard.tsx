import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../contexts/ThemeContext';

interface LiquidGlassCardProps {
  children: ReactNode;
  style?: ViewStyle;
  intensity?: number;
}

export default function LiquidGlassCard({
  children,
  style,
  intensity = 30,
}: LiquidGlassCardProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, style, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
      <BlurView intensity={intensity} tint={theme.blurTint} style={StyleSheet.absoluteFill}>
        <View style={styles.content}>
          {children}
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 15,
    overflow: 'hidden',
    borderWidth: 1,
  },
  content: {
    padding: 15,
    flex: 1,
  },
});