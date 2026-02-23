import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  darkShadows,
  zIndex,
  animation,
  blur,
  components,
  type ThemePreference,
  type BlurTint,
  type StatusBarStyle,
} from '../theme/tokens';

// ============================================
// ENTERPRISE THEME TYPES
// ============================================

export interface EnterpriseTheme {
  // Colors organized by semantic meaning
  colors: {
    background: {
      primary: string;
      secondary: string;
      elevated: string;
      overlay: string;
    };
    surface: {
      primary: string;
      secondary: string;
      glass: string;
      blur: string;
    };
    text: {
      primary: string;
      secondary: string;
      tertiary: string;
      inverse: string;
    };
    border: {
      primary: string;
      secondary: string;
      focus: string;
    };
    status: {
      success: string;
      warning: string;
      error: string;
      info: string;
    };
    brand: {
      primary: string;
      primaryLight: string;
      primaryDark: string;
      accent: string;
    };
  };

  // Typography
  typography: typeof typography;

  // Spacing
  spacing: typeof spacing;

  // Border radius
  borderRadius: typeof borderRadius;

  // Shadows
  shadows: typeof shadows;

  // Z-Index
  zIndex: typeof zIndex;

  // Animation
  animation: typeof animation;

  // Blur
  blur: {
    intensity: typeof blur.intensity;
    tint: BlurTint;
  };

  // Components
  components: typeof components;

  // Native properties
  statusBar: StatusBarStyle;
}

// Backward compatibility - Legacy theme interface
export interface Theme {
  background: string;
  secondaryBackground: string;
  cardBackground: string;
  text: string;
  secondaryText: string;
  accent: string;
  border: string;
  glassBackground: string;
  blurTint: BlurTint;
  statusBar: StatusBarStyle;
  useGradient: boolean;
}

// ============================================
// THEME CONSTRUCTORS
// ============================================

function createEnterpriseTheme(mode: 'light' | 'dark'): EnterpriseTheme {
  const colorScheme = mode === 'dark' ? colors.dark : colors.light;
  const shadowScheme = mode === 'dark' ? darkShadows : shadows;

  return {
    colors: {
      background: colorScheme.background,
      surface: colorScheme.surface,
      text: colorScheme.text,
      border: colorScheme.border,
      status: colorScheme.status,
      brand: colors.brand,
    },
    typography,
    spacing,
    borderRadius,
    shadows: shadowScheme,
    zIndex,
    animation,
    blur: {
      intensity: blur.intensity,
      tint: mode === 'dark' ? blur.tint.dark : blur.tint.light,
    },
    components,
    statusBar: mode === 'dark' ? 'light-content' : 'dark-content',
  };
}

// Legacy theme constructors for backward compatibility
export const lightTheme: Theme = {
  background: colors.light.background.primary,
  secondaryBackground: colors.light.background.secondary,
  cardBackground: colors.light.background.elevated,
  text: colors.light.text.primary,
  secondaryText: colors.light.text.secondary,
  accent: colors.brand.primaryLight,
  border: colors.light.border.primary,
  glassBackground: colors.light.surface.glass,
  blurTint: 'light',
  statusBar: 'dark-content',
  useGradient: false,
};

export const darkTheme: Theme = {
  background: colors.dark.background.primary,
  secondaryBackground: colors.dark.background.secondary,
  cardBackground: colors.dark.background.elevated,
  text: colors.dark.text.primary,
  secondaryText: colors.dark.text.secondary,
  accent: colors.brand.accent,
  border: colors.dark.border.primary,
  glassBackground: colors.dark.surface.glass,
  blurTint: 'dark',
  statusBar: 'light-content',
  useGradient: false,
};

// ============================================
// THEME CONTEXT
// ============================================

interface ThemeContextType {
  // Dark mode state
  isDarkMode: boolean;
  themePreference: ThemePreference;

  // Legacy theme (for backward compatibility)
  theme: Theme;

  // Enterprise theme (new token-based system)
  enterpriseTheme: EnterpriseTheme;

  // Theme control methods
  toggleTheme: () => void;
  setDarkMode: (enabled: boolean) => void;
  setThemePreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = '@cerviced_theme_mode';

// ============================================
// THEME PROVIDER
// ============================================

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [themePreference, setThemePref] = useState<ThemePreference>('auto');
  const [isLoading, setIsLoading] = useState(true);

  // Calculate actual dark mode state based on preference and system
  const isDarkMode = themePreference === 'auto'
    ? systemColorScheme === 'dark'
    : themePreference === 'dark';

  // Memoize themes to prevent unnecessary re-renders
  const enterpriseTheme = useMemo(
    () => createEnterpriseTheme(isDarkMode ? 'dark' : 'light'),
    [isDarkMode]
  );

  const legacyTheme = useMemo(
    () => (isDarkMode ? darkTheme : lightTheme),
    [isDarkMode]
  );

  // Load saved theme preference on mount
  useEffect(() => {
    loadThemePreference();
  }, []);

  // Auto-update when system theme changes (only if preference is 'auto')
  useEffect(() => {
    if (themePreference === 'auto') {
      // This will trigger a re-render when system theme changes
    }
  }, [systemColorScheme, themePreference]);

  const loadThemePreference = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme !== null && (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'auto')) {
        setThemePref(savedTheme as ThemePreference);
      } else {
        // Default to auto (follow system)
        setThemePref('auto');
      }
    } catch (error) {
      console.error('Failed to load theme preference:', error);
      setThemePref('auto');
    } finally {
      setIsLoading(false);
    }
  };

  const saveThemePreference = async (preference: ThemePreference) => {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    }
  };

  const setThemePreference = (preference: ThemePreference) => {
    setThemePref(preference);
    saveThemePreference(preference);
  };

  const toggleTheme = () => {
    // Toggle between light and dark (not auto)
    const newMode = isDarkMode ? 'light' : 'dark';
    setThemePref(newMode);
    saveThemePreference(newMode);
  };

  const setDarkMode = (enabled: boolean) => {
    const newMode = enabled ? 'dark' : 'light';
    setThemePref(newMode);
    saveThemePreference(newMode);
  };

  const contextValue = useMemo(
    () => ({
      isDarkMode,
      theme: legacyTheme,
      enterpriseTheme,
      themePreference,
      toggleTheme,
      setDarkMode,
      setThemePreference,
    }),
    [isDarkMode, legacyTheme, enterpriseTheme, themePreference]
  );

  if (isLoading) {
    return null; // Or a loading screen
  }

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

// ============================================
// THEME HOOKS
// ============================================

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// Convenience hook for enterprise theme only
export function useEnterpriseTheme() {
  const { enterpriseTheme, isDarkMode } = useTheme();
  return { theme: enterpriseTheme, isDarkMode };
}

// Convenience hook for legacy theme only (backward compatibility)
export function useLegacyTheme() {
  const { theme, isDarkMode } = useTheme();
  return { theme, isDarkMode };
}
