export const lightTheme = {
  bg:           '#F5F1EC',
  surface:      '#EDE8E2',
  surfaceRaised:'#FFFFFF',
  card:         '#FFFFFF',
  accent:       '#AF9197',
  accentDim:    'rgba(175,145,151,0.12)',
  ice:          '#FFFFFF',
  text:         '#000000',
  sub:          '#7E6667',
  border:       'rgba(126,102,103,0.14)',
  sep:          'rgba(126,102,103,0.08)',
  iconBg:       'rgba(175,145,151,0.12)',
} as const;

export const darkTheme = {
  bg:           '#1A1815',
  surface:      '#201D1A',
  surfaceRaised:'#252220',
  card:         '#252220',
  accent:       '#AF9197',
  accentDim:    'rgba(175,145,151,0.10)',
  ice:          '#FFFFFF',
  text:         '#F0ECE7',
  sub:          '#7E6667',
  border:       'rgba(126,102,103,0.18)',
  sep:          'rgba(126,102,103,0.10)',
  iconBg:       'rgba(175,145,151,0.10)',
} as const;

export type AppTheme = typeof lightTheme;
