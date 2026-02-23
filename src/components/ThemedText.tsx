import React from 'react';
import { Text, TextProps } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface ThemedTextProps extends TextProps {
  variant?: 'primary' | 'secondary' | 'accent';
}

export function ThemedText({ variant = 'primary', style, ...props }: ThemedTextProps) {
  const { theme } = useTheme();

  const colorMap = {
    primary: theme.text,
    secondary: theme.secondaryText,
    accent: theme.accent,
  };

  return (
    <Text
      style={[
        { color: colorMap[variant] },
        style
      ]}
      {...props}
    />
  );
}
