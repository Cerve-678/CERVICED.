import { Platform } from 'react-native';

/**
 * Platform-specific dimensions for Android optimization
 * Android gets smaller sizing to fit screen better
 */

export const dimensions = {
  // Navigation & Headers
  navBackButton: {
    width: Platform.OS === 'android' ? 30 : 40,
    height: Platform.OS === 'android' ? 30 : 40,
    marginLeft: Platform.OS === 'android' ? 10 : 15,
    borderRadius: Platform.OS === 'android' ? 14 : 20,
    fontSize: Platform.OS === 'android' ? 18 : 24,
  },

  screenHeader: {
    paddingTop: Platform.OS === 'android' ? 50 : 70,
    paddingBottom: Platform.OS === 'android' ? 6 : 12,
    paddingHorizontal: Platform.OS === 'android' ? 10 : 16,
  },

  screenTitle: {
    fontSize: Platform.OS === 'android' ? 18 : 24,
    marginBottom: Platform.OS === 'android' ? 6 : 12,
  },

  // Cards & Components
  card: {
    borderRadius: Platform.OS === 'android' ? 16 : 26,
    padding: Platform.OS === 'android' ? 7 : 13,
    gap: Platform.OS === 'android' ? 7 : 13,
    smallBorderRadius: Platform.OS === 'android' ? 12 : 18,
    largeBorderRadius: Platform.OS === 'android' ? 22 : 32,
  },

  // Provider Cards
  providerLogo: {
    size: Platform.OS === 'android' ? 42 : 60,
    borderRadius: Platform.OS === 'android' ? 21 : 30,
    borderWidth: Platform.OS === 'android' ? 1.5 : 2.5,
    marginRight: Platform.OS === 'android' ? 8 : 12,
  },

  // Home Screen Specific Cards
  homeCards: {
    yourProviders: {
      width: Platform.OS === 'android' ? 90 : 115,
      height: Platform.OS === 'android' ? 90 : 115,
    },
    providerOfWeek: {
      width: Platform.OS === 'android' ? 105 : 135,
      height: Platform.OS === 'android' ? 105 : 135,
    },
    recommended: {
      width: Platform.OS === 'android' ? 145 : 185,
      height: Platform.OS === 'android' ? 145 : 185,
    },
  },

  // Service Pills/Tabs
  servicePill: {
    width: Platform.OS === 'android' ? 85 : 110,
    height: Platform.OS === 'android' ? 24 : 29,
    marginRight: Platform.OS === 'android' ? 6 : 10,
  },

  // Buttons
  button: {
    small: {
      width: Platform.OS === 'android' ? 28 : 36,
      height: Platform.OS === 'android' ? 28 : 36,
      borderRadius: Platform.OS === 'android' ? 14 : 18,
    },
    medium: {
      paddingHorizontal: Platform.OS === 'android' ? 28 : 40,
      paddingVertical: Platform.OS === 'android' ? 9 : 14,
      borderRadius: Platform.OS === 'android' ? 18 : 25,
    },
    large: {
      paddingHorizontal: Platform.OS === 'android' ? 35 : 50,
      paddingVertical: Platform.OS === 'android' ? 12 : 18,
      borderRadius: Platform.OS === 'android' ? 22 : 30,
    },
  },

  // Scroll Content
  scroll: {
    paddingTop: Platform.OS === 'android' ? 10 : 16,
    paddingHorizontal: Platform.OS === 'android' ? 10 : 16,
    paddingBottom: Platform.OS === 'android' ? 25 : 40,
    verticalPadding: Platform.OS === 'android' ? 5 : 8,
  },

  // Empty States
  emptyState: {
    paddingTop: Platform.OS === 'android' ? 50 : 100,
    cardPadding: Platform.OS === 'android' ? 25 : 40,
    width: Platform.OS === 'android' ? 28 : 40, // subtracted from screen width
  },

  // Safe Area - Android needs different edges to prevent overlay issues
  safeArea: {
    edges: Platform.OS === 'android' ? ['bottom'] as const : ['top', 'bottom'] as const,
    topEdge: Platform.OS === 'android' ? [] as const : ['top'] as const,
    bottomEdge: ['bottom'] as const,
  },
};

export const fonts = {
  // Text Sizes
  title: {
    large: Platform.OS === 'android' ? 20 : 28,
    medium: Platform.OS === 'android' ? 16 : 22,
    small: Platform.OS === 'android' ? 14 : 20,
  },

  body: {
    large: Platform.OS === 'android' ? 14 : 17,
    medium: Platform.OS === 'android' ? 12 : 15,
    small: Platform.OS === 'android' ? 10 : 13,
    xsmall: Platform.OS === 'android' ? 8 : 11,
  },

  // Component-specific
  providerName: Platform.OS === 'android' ? 11 : 13,
  serviceTag: Platform.OS === 'android' ? 7 : 9,
  locationText: Platform.OS === 'android' ? 9 : 11,
  ratingText: Platform.OS === 'android' ? 10 : 12,
  serviceText: Platform.OS === 'android' ? 9 : 11,

  // Section Headings
  sectionHeading: {
    main: Platform.OS === 'android' ? 14 : 20, // Main sections like "YOUR PROVIDERS"
    secondary: Platform.OS === 'android' ? 12 : 18, // Secondary like "PROVIDER OF THE WEEK"
  },

  // Buttons
  buttonText: {
    small: Platform.OS === 'android' ? 11 : 14,
    medium: Platform.OS === 'android' ? 13 : 16,
    large: Platform.OS === 'android' ? 15 : 18,
  },

  // Line Heights
  lineHeight: {
    tight: Platform.OS === 'android' ? 16 : 20,
    normal: Platform.OS === 'android' ? 17 : 22,
    loose: Platform.OS === 'android' ? 20 : 26,
  },
};

export const spacing = {
  // Margins & Padding
  xs: Platform.OS === 'android' ? 2 : 4,
  sm: Platform.OS === 'android' ? 4 : 7,
  md: Platform.OS === 'android' ? 7 : 10,
  lg: Platform.OS === 'android' ? 9 : 14,
  xl: Platform.OS === 'android' ? 12 : 17,
  xxl: Platform.OS === 'android' ? 18 : 28,

  // Gaps
  gap: {
    xs: Platform.OS === 'android' ? 2 : 4,
    sm: Platform.OS === 'android' ? 4 : 7,
    md: Platform.OS === 'android' ? 7 : 13,
    lg: Platform.OS === 'android' ? 12 : 18,
  },
};

// Helper function for conditional platform values
export const platformValue = <T,>(androidValue: T, iosValue: T): T => {
  return Platform.OS === 'android' ? androidValue : iosValue;
};
