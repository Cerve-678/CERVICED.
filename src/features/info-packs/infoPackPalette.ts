// The Info Packs screens' palette. Same per-screen L/D literal convention as
// the rest of the app (DESIGN_SYSTEM.md); shared here only because the
// welcome and the send sheet are their own files.

export const INFO_PACK_LIGHT = {
  bg: '#F5F1EC',
  surface: '#EDE8E2',
  card: '#FFFFFF',
  accent: '#5C4033',
  onAccent: '#FFFFFF',
  text: '#000000',
  sub: '#7E6667',
  border: 'rgba(126,102,103,0.14)',
  iconBg: 'rgba(92,64,51,0.10)',
  accentTint: 'rgba(92,64,51,0.08)',
  danger: '#FF453A',
  dangerBg: 'rgba(255,59,48,0.07)',
  shadow: '#26201E',
  skeleton: 'rgba(126,102,103,0.12)',
};

export const INFO_PACK_DARK: InfoPackPalette = {
  bg: '#1A1815',
  surface: '#201D1A',
  card: '#252220',
  accent: '#AF9197',
  onAccent: '#1A1815',
  text: '#F0ECE7',
  // #7E6667 fails contrast for small text on #1A1815 (see the Achievements
  // screen note), so dark mode's secondary text is a lighter warm grey.
  sub: '#A8958F',
  border: 'rgba(126,102,103,0.22)',
  iconBg: 'rgba(175,145,151,0.12)',
  accentTint: 'rgba(175,145,151,0.10)',
  danger: '#FF453A',
  dangerBg: 'rgba(255,59,48,0.12)',
  shadow: '#000000',
  skeleton: 'rgba(240,236,231,0.08)',
};

export type InfoPackPalette = typeof INFO_PACK_LIGHT;

export const BAKBAK = 'JosefinSans-Bold';
