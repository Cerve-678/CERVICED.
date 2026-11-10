export const FONTS = {
  BakbakOne: 'BakbakOne-Regular',
  Jura: 'Jura-VariableFont_wght',
} as const;

export const FONT_WEIGHTS = {
  light: '300',
  regular: '400',
  semiBold: '600',
  bold: '700',
} as const;

export const FONT_SIZES = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
  '5xl': 48,
} as const;

// Typography styles
export const TEXT_STYLES = {
  heading1: {
    fontFamily: FONTS.BakbakOne,
    fontSize: FONT_SIZES['4xl'],
    fontWeight: FONT_WEIGHTS.bold,
  },
  heading2: {
    fontFamily: FONTS.Jura,
    fontSize: FONT_SIZES['3xl'],
    fontWeight: FONT_WEIGHTS.bold,
  },
  heading3: {
    fontFamily: FONTS.Jura,
    fontSize: FONT_SIZES['2xl'],
    fontWeight: FONT_WEIGHTS.semiBold,
  },
  body: {
    fontFamily: FONTS.Jura,
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.regular,
  },
  bodyLight: {
    fontFamily: FONTS.Jura,
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.light,
  },
  caption: {
    fontFamily: FONTS.Jura,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.regular,
  },
  tabLabel: {
    fontFamily: FONTS.Jura,
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semiBold,
  },
} as const;