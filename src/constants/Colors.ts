// src/constants/Colors.ts
export const Colors = {
  primary: '#007AFF',
  secondary: '#5856D6',
  success: '#34C759',
  danger: '#FF3B30',
  warning: '#FF9500',
  info: '#5AC8FA',
  light: '#F2F2F7',
  dark: '#1C1C1E',
  gray: '#8E8E93',
  white: '#FFFFFF',
  black: '#000000',
  
  // Add missing properties that your components expect
  background: '#F5E6FA', // Your app's background color
  surface: '#FFFFFF',
  text: '#000000',
  textSecondary: '#8E8E93', // Use existing gray
  border: '#E5E5EA',
  error: '#FF3B30', // Use existing danger
} as const;

export const ThemeColors = {
  light: {
    text: '#000',
    background: '#fff',
    tint: Colors.primary,
    tabIconDefault: '#ccc',
    tabIconSelected: Colors.primary,
    border: '#E5E5EA',
    card: '#FFFFFF',
  },
  dark: {
    text: '#fff',
    background: '#000',
    tint: Colors.info,
    tabIconDefault: '#ccc',
    tabIconSelected: Colors.info,
    border: '#2C2C2E',
    card: '#1C1C1E',
  },
} as const;