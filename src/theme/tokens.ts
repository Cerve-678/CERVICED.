/**
 * Design Tokens - Enterprise-level Theme System
 * Centralized design values for the Cerviced app
 */

// ============================================
// COLOR TOKENS
// ============================================

export const colors = {
  // Brand Colors
  brand: {
    primary: '#a342c3ff',
    primaryLight: '#DA70D6',
    primaryDark: '#8B2DA8',
    accent: '#E580E8',
  },

  // Semantic Colors - Light Mode
  light: {
    background: {
      primary: '#F5E6FA',
      secondary: '#FCEEFF',
      elevated: 'rgba(255, 255, 255, 0.3)',
      overlay: 'rgba(0, 0, 0, 0.6)',
    },
    surface: {
      primary: '#FFFFFF',
      secondary: '#F8F8F8',
      glass: 'rgba(255, 255, 255, 0.2)',
      blur: 'rgba(255, 255, 255, 0.8)',
    },
    text: {
      primary: '#000000',
      secondary: 'rgba(0, 0, 0, 0.6)',
      tertiary: 'rgba(0, 0, 0, 0.4)',
      inverse: '#FFFFFF',
    },
    border: {
      primary: 'rgba(255, 255, 255, 0.4)',
      secondary: 'rgba(128, 128, 128, 0.2)',
      focus: '#a342c3ff',
    },
    status: {
      success: '#34C759',
      warning: '#FF9500',
      error: '#FF3B30',
      info: '#007AFF',
    },
  },

  // Semantic Colors - Dark Mode
  dark: {
    background: {
      primary: '#1C1C1E',
      secondary: '#2C2C2E',
      elevated: 'rgba(58, 58, 60, 0.8)',
      overlay: 'rgba(0, 0, 0, 0.6)',
    },
    surface: {
      primary: '#2C2C2E',
      secondary: '#3A3A3C',
      glass: 'rgba(58, 58, 60, 0.6)',
      blur: 'rgba(58, 58, 60, 0.9)',
    },
    text: {
      primary: '#FFFFFF',
      secondary: 'rgba(255, 255, 255, 0.75)',
      tertiary: 'rgba(255, 255, 255, 0.5)',
      inverse: '#000000',
    },
    border: {
      primary: 'rgba(255, 255, 255, 0.2)',
      secondary: 'rgba(128, 128, 128, 0.3)',
      focus: '#E580E8',
    },
    status: {
      success: '#32D74B',
      warning: '#FF9F0A',
      error: '#FF453A',
      info: '#0A84FF',
    },
  },
};

// ============================================
// TYPOGRAPHY TOKENS
// ============================================

export const typography = {
  fontFamily: {
    heading: 'BakbakOne-Regular',
    body: 'Jura-VariableFont_wght',
    mono: 'monospace',
  },

  fontSize: {
    xs: 11,
    sm: 13,
    base: 14,
    md: 16,
    lg: 17,
    xl: 20,
    '2xl': 24,
    '3xl': 28,
    '4xl': 32,
  },

  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },

  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
};

// ============================================
// SPACING TOKENS
// ============================================

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 64,
};

// ============================================
// BORDER RADIUS TOKENS
// ============================================

export const borderRadius = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
};

// ============================================
// SHADOW TOKENS
// ============================================

// Light mode shadows (subtle for clean appearance)
export const shadows = {
  // Small elevation (buttons, small cards)
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  // Medium elevation (cards, panels)
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  // Large elevation (modals, dropdowns)
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  // Extra large elevation (important modals)
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
};

// Dark mode shadows (darker for better depth perception)
export const darkShadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
};

// ============================================
// ANIMATION TOKENS
// ============================================

export const animation = {
  timing: {
    instant: 0,
    fast: 150,
    normal: 250,
    slow: 350,
    verySlow: 500,
  },

  easing: {
    linear: 'linear' as const,
    ease: 'ease' as const,
    easeIn: 'ease-in' as const,
    easeOut: 'ease-out' as const,
    easeInOut: 'ease-in-out' as const,
  },
};

// ============================================
// BLUR TOKENS
// ============================================

export const blur = {
  intensity: {
    light: 80,
    medium: 100,
    heavy: 120,
  },
  tint: {
    light: 'light' as const,
    dark: 'dark' as const,
  },
};

// ============================================
// BREAKPOINTS (for responsive design)
// ============================================

export const breakpoints = {
  sm: 375,
  md: 768,
  lg: 1024,
  xl: 1280,
};

// ============================================
// Z-INDEX SCALE
// ============================================

export const zIndex = {
  base: 0,              // Normal content
  dropdown: 1000,       // Dropdowns, select menus
  sticky: 1100,         // Sticky headers
  overlay: 1300,        // Modal/sheet overlays
  modal: 1400,          // Modals, sheets
  popover: 1500,        // Popovers, tooltips
  toast: 1600,          // Toast notifications
  tooltip: 1700,        // Tooltips (highest)
};

// ============================================
// COMPONENT-SPECIFIC TOKENS
// ============================================

export const components = {
  card: {
    borderRadius: borderRadius.xl,
    padding: spacing.base,
    gap: spacing.md,
  },

  button: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.lg,
    height: {
      sm: 36,
      md: 44,
      lg: 52,
    },
  },

  input: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    height: 44,
  },

  chip: {
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    gap: spacing.xs,
  },

  modal: {
    borderRadius: borderRadius['2xl'],
    maxHeightPercent: 75, // 75% as number for calculations
    backdropOpacity: 0.6,
  },
};

// ============================================
// TYPE DEFINITIONS
// ============================================

export type ColorScheme = 'light' | 'dark';
export type ThemePreference = 'light' | 'dark' | 'auto';
export type BlurTint = 'light' | 'dark';
export type StatusBarStyle = 'light-content' | 'dark-content';

// ============================================
// USAGE EXAMPLES
// ============================================

/**
 * Shadow Usage:
 *
 * import { useEnterpriseTheme } from '../contexts/ThemeContext';
 *
 * const { theme } = useEnterpriseTheme();
 *
 * const styles = StyleSheet.create({
 *   card: {
 *     ...theme.shadows.md,  // Spread shadow properties (auto-adjusts for dark mode)
 *     backgroundColor: theme.colors.background.elevated,
 *     borderRadius: theme.borderRadius.lg,
 *     padding: theme.spacing.base,
 *   },
 * });
 */

/**
 * Z-Index Usage:
 *
 * import { zIndex } from '../theme/tokens';
 *
 * const styles = StyleSheet.create({
 *   modal: {
 *     position: 'absolute',
 *     zIndex: zIndex.modal,
 *   },
 *   overlay: {
 *     position: 'absolute',
 *     zIndex: zIndex.overlay,
 *   },
 *   toast: {
 *     position: 'absolute',
 *     zIndex: zIndex.toast,
 *   },
 * });
 */

/**
 * Complete Component Example:
 *
 * import { useEnterpriseTheme } from '../contexts/ThemeContext';
 * import { zIndex } from '../theme/tokens';
 *
 * export default function MyCard() {
 *   const { theme } = useEnterpriseTheme();
 *
 *   const styles = useMemo(() => StyleSheet.create({
 *     card: {
 *       backgroundColor: theme.colors.background.elevated,
 *       borderRadius: theme.components.card.borderRadius,
 *       padding: theme.components.card.padding,
 *       gap: theme.components.card.gap,
 *       ...theme.shadows.md, // Auto-adjusts: light shadows in light mode, dark shadows in dark mode
 *     },
 *     title: {
 *       color: theme.colors.text.primary,
 *       fontSize: theme.typography.fontSize.lg,
 *       fontWeight: theme.typography.fontWeight.bold,
 *       fontFamily: theme.typography.fontFamily.heading,
 *     },
 *     description: {
 *       color: theme.colors.text.secondary,
 *       fontSize: theme.typography.fontSize.md,
 *       fontFamily: theme.typography.fontFamily.body,
 *       lineHeight: theme.typography.fontSize.md * theme.typography.lineHeight.normal,
 *     },
 *   }), [theme]);
 *
 *   return (
 *     <View style={styles.card}>
 *       <Text style={styles.title}>Card Title</Text>
 *       <Text style={styles.description}>Card description text</Text>
 *     </View>
 *   );
 * }
 */
