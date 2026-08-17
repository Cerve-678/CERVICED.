export const lightTheme = {
  bg:           '#F5F1EC',
  surface:      '#EDE8E2',
  surfaceRaised:'#FFFFFF',
  card:         '#FFFFFF',
  accent:       '#5C4033',
  accentText:   '#5C4033',
  accentDim:    'rgba(92,64,51,0.12)',
  onAccent:     '#FFFFFF',              // text/icon drawn on a solid accent fill — white reads fine on dark chocolate
  secondary:    '#5C4033',              // provider hat has no distinct secondary — mirrors accent
  secondaryText:'#5C4033',
  ice:          '#FFFFFF',
  text:         '#000000',
  sub:          '#7E6667',
  border:       'rgba(126,102,103,0.14)',
  sep:          'rgba(126,102,103,0.08)',
  iconBg:       'rgba(92,64,51,0.12)',
} as const;

export const darkTheme = {
  bg:           '#1A1815',
  surface:      '#201D1A',
  surfaceRaised:'#252220',
  card:         '#252220',
  accent:       '#AF9197',
  accentText:   '#AF9197',
  accentDim:    'rgba(175,145,151,0.10)',
  onAccent:     '#FFFFFF',              // text/icon drawn on a solid accent fill — white still reads fine on dusty rose
  secondary:    '#AF9197',
  secondaryText:'#AF9197',
  ice:          '#FFFFFF',
  text:         '#F0ECE7',
  sub:          '#7E6667',
  border:       'rgba(126,102,103,0.18)',
  sep:          'rgba(126,102,103,0.10)',
  iconBg:       'rgba(175,145,151,0.10)',
} as const;

// Client-hat palette — only applied when AuthContext.activeMode === 'client'.
// Provider-hat screens keep lightTheme/darkTheme above, untouched.
//
// LIGHT MODE: plum (#3F1E36, slightly lifted off black) is the primary accent;
//   blue-grey (#E5ECF4) is the secondary — used as a fill for things like the
//   Explore heart button and category tags. Background is a soft warm pink-
//   tinted off-white (#FBF7F8) that complements the plum.
// DARK MODE: blue-grey (#E5ECF4) becomes the accent (plum drops out); the
//   background/cards stay neutral near-black so the blue stands out.
export const clientLightTheme = {
  bg:           '#FBF7F8',              // soft warm pink-tinted off-white, complements plum
  surface:      '#F3EEF0',
  surfaceRaised:'#FFFFFF',
  card:         '#FFFFFF',
  accent:       '#3F1E36',              // plum, slightly darker (was #4A2340)
  accentText:   '#3F1E36',              // plum reads fine as text on light backgrounds
  accentDim:    'rgba(63,30,54,0.12)',
  onAccent:     '#FFFFFF',              // text/icon drawn on a solid accent fill — white reads fine on dark plum
  secondary:    '#E5ECF4',              // blue-grey — secondary fill (heart button, category tags)
  secondaryText:'#4A6B8F',              // readable blue for text/icon on light bg (#E5ECF4 is too pale as text)
  ice:          '#FFFFFF',
  text:         '#000000',
  sub:          'rgba(63,30,54,0.62)',
  border:       'rgba(63,30,54,0.14)',
  sep:          'rgba(63,30,54,0.08)',
  iconBg:       'rgba(63,30,54,0.12)',
} as const;

export const clientDarkTheme = {
  bg:           '#17151A',              // neutral near-black
  surface:      '#1E1B21',
  surfaceRaised:'#26222A',
  card:         '#26222A',
  accent:       '#E5ECF4',              // blue-grey is the accent in dark mode (plum drops out)
  accentText:   '#E5ECF4',              // 13–15:1 against the neutral dark bg/card
  accentDim:    'rgba(229,236,244,0.14)',
  onAccent:     '#1B2740',              // text/icon drawn on a solid accent fill — white is unreadable on pale #E5ECF4, needs a dark color instead
  secondary:    '#E5ECF4',              // same blue-grey — secondary and accent converge in dark mode
  secondaryText:'#E5ECF4',
  ice:          '#FFFFFF',
  text:         '#F0ECE7',
  sub:          'rgba(240,236,231,0.65)',
  border:       'rgba(240,236,231,0.16)',
  sep:          'rgba(240,236,231,0.10)',
  iconBg:       'rgba(229,236,244,0.14)',
} as const;

export type AppTheme = typeof lightTheme;
