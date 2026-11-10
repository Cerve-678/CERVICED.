// src/utils/FontManager.ts
import { TextStyle } from 'react-native';

// Font family definitions
export const FontFamilies = {
  primary: 'BakbakOne-Regular',
  secondary: 'Jura-VariableFont_wght',
  system: 'System', // Fallback for iOS, 'Roboto' for Android
} as const;

// Font weight mapping for custom fonts
export const FontWeights = {
  light: '300',
  regular: '400',
  medium: '500',
  semiBold: '600',
  bold: '700',
} as const;

// Text styles interface - CRITICAL: This must use React Native's TextStyle
export interface TextStyles {
  // Navigation
  tabLabel: TextStyle;
  
  // Headings
  h1: TextStyle;
  h2: TextStyle;
  h3: TextStyle;
  h4: TextStyle;
  
  // Body text
  body: TextStyle;
  bodySmall: TextStyle;
  bodyLarge: TextStyle;
  
  // UI elements
  button: TextStyle;
  caption: TextStyle;
  subtitle: TextStyle;
  
  // Special
  placeholder: TextStyle;
  error: TextStyle;
}

// Helper function to get font family with fallback
function getFontFamily(customFontsLoaded: boolean, primaryFont: string): string {
  return customFontsLoaded ? primaryFont : FontFamilies.system;
}

// Create text styles based on font loading state
export function createTextStyles(customFontsLoaded: boolean): TextStyles {
  const primaryFont = getFontFamily(customFontsLoaded, FontFamilies.primary);
  const secondaryFont = getFontFamily(customFontsLoaded, FontFamilies.secondary);

  return {
    // Navigation - FIXED: This is what was causing your tab navigator error
    tabLabel: {
      fontSize: 12,
      fontFamily: secondaryFont,
      fontWeight: FontWeights.medium as any, // Cast to satisfy TypeScript
    },

    // Headings
    h1: {
      fontSize: 32,
      fontFamily: primaryFont,
      fontWeight: FontWeights.bold as any,
      lineHeight: 40,
    },
    h2: {
      fontSize: 28,
      fontFamily: primaryFont,
      fontWeight: FontWeights.bold as any,
      lineHeight: 36,
    },
    h3: {
      fontSize: 24,
      fontFamily: primaryFont,
      fontWeight: FontWeights.semiBold as any,
      lineHeight: 32,
    },
    h4: {
      fontSize: 20,
      fontFamily: primaryFont,
      fontWeight: FontWeights.semiBold as any,
      lineHeight: 28,
    },

    // Body text
    body: {
      fontSize: 16,
      fontFamily: secondaryFont,
      fontWeight: FontWeights.regular as any,
      lineHeight: 24,
    },
    bodySmall: {
      fontSize: 14,
      fontFamily: secondaryFont,
      fontWeight: FontWeights.regular as any,
      lineHeight: 20,
    },
    bodyLarge: {
      fontSize: 18,
      fontFamily: secondaryFont,
      fontWeight: FontWeights.regular as any,
      lineHeight: 26,
    },

    // UI elements
    button: {
      fontSize: 16,
      fontFamily: secondaryFont,
      fontWeight: FontWeights.semiBold as any,
      lineHeight: 24,
    },
    caption: {
      fontSize: 12,
      fontFamily: secondaryFont,
      fontWeight: FontWeights.regular as any,
      lineHeight: 16,
    },
    subtitle: {
      fontSize: 14,
      fontFamily: secondaryFont,
      fontWeight: FontWeights.medium as any,
      lineHeight: 20,
    },

    // Special
    placeholder: {
      fontSize: 16,
      fontFamily: secondaryFont,
      fontWeight: FontWeights.regular as any,
      color: '#8E8E93',
      lineHeight: 24,
    },
    error: {
      fontSize: 14,
      fontFamily: secondaryFont,
      fontWeight: FontWeights.medium as any,
      color: '#FF3B30',
      lineHeight: 20,
    },
  };
}