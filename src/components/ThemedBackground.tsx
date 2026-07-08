import React from 'react';
import { View, StyleSheet, ViewProps } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface ThemedBackgroundProps extends ViewProps {
  children: React.ReactNode;
}

export function ThemedBackground({ children, style, ...props }: ThemedBackgroundProps) {
  const { isDarkMode } = useTheme();
  const bg = isDarkMode ? '#1A1815' : '#F5F1EC';

  return (
    <View style={[styles.container, { backgroundColor: bg }, style]} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
