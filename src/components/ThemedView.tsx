import React from 'react';
import { View, ViewProps, StyleSheet, StatusBar } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface ThemedViewProps extends ViewProps {
  useBackground?: boolean;
  children: React.ReactNode;
}

export function ThemedView({ useBackground = true, style, children, ...props }: ThemedViewProps) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        useBackground && { backgroundColor: theme.background },
        style
      ]}
      {...props}
    >
      <StatusBar barStyle={theme.statusBar} />
      {children}
    </View>
  );
}

export function ThemedCard({ style, children, ...props }: ViewProps) {
  const { theme } = useTheme();

  return (
    <View
      style={[
        { backgroundColor: theme.cardBackground },
        style
      ]}
      {...props}
    >
      {children}
    </View>
  );
}
