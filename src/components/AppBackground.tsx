import React, { ReactNode } from 'react';
import { ImageBackground, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface AppBackgroundProps {
  children: ReactNode;
  style?: ViewStyle;
}

export default function AppBackground({ children, style }: AppBackgroundProps) {
  const { isDarkMode, theme } = useTheme();

  if (isDarkMode) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }, style]}>
        {children}
      </View>
    );
  }

  return (
    <ImageBackground
      source={require('../../assets/images/background.png')}
      style={[styles.container, style]}
      resizeMode="cover"
    >
      {children}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5E6FA',
  },
});