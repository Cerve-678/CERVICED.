import React from 'react';
import { View, ImageBackground, StyleSheet, ViewProps } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface ThemedBackgroundProps extends ViewProps {
  children: React.ReactNode;
}

export function ThemedBackground({ children, style, ...props }: ThemedBackgroundProps) {
  const { isDarkMode, theme } = useTheme();

  // Light mode: Use original background image
  if (!isDarkMode) {
    return (
      <ImageBackground
        source={require('../../assets/images/background.png')}
        style={[styles.container, style]}
        resizeMode="cover"
        {...props}
      >
        {children}
      </ImageBackground>
    );
  }

  // Dark mode: Use native black background
  return (
    <View style={[styles.container, { backgroundColor: theme.background }, style]} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
