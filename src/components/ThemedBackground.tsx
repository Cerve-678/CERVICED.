import React from 'react';
import { View, StyleSheet, ViewProps } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface ThemedBackgroundProps extends ViewProps {
  children: React.ReactNode;
}

export function ThemedBackground({ children, style, ...props }: ThemedBackgroundProps) {
  // palette already branches on the active hat (client vs provider) inside
  // ThemeContext, so the root background follows whichever theme is in force
  // instead of hardcoding the provider-hat values.
  const { palette } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }, style]} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
