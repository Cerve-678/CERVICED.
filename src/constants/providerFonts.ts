// Business-name font choices for the provider Branding screen. Each key is
// what's stored in providers.brand_font; fontFamily must be registered in
// App.tsx's useFonts call. Applies to the provider's display name only
// (profile hero + scrolled nav header) — never to body text or app chrome,
// which stay on BakbakOne-Regular / Jura-VariableFont_wght per DESIGN_SYSTEM.md.

export interface ProviderFontOption {
  key: string;
  name: string;
  fontFamily: string;
}

export const DEFAULT_PROVIDER_FONT = 'default';

export const PROVIDER_FONTS: ProviderFontOption[] = [
  { key: 'default', name: 'Classic', fontFamily: 'Prata-Regular' },
  { key: 'lobster', name: 'Rounded Script', fontFamily: 'Lobster_400Regular' },
  { key: 'dancing-script', name: 'Elegant Script', fontFamily: 'DancingScript_700Bold' },
  { key: 'bungee', name: 'Bold Display', fontFamily: 'Bungee_400Regular' },
  { key: 'righteous', name: 'Confident', fontFamily: 'Righteous_400Regular' },
  { key: 'sniglet', name: 'Bubbly', fontFamily: 'Sniglet_800ExtraBold' },
  { key: 'baloo-2', name: 'Chunky & Rounded', fontFamily: 'Baloo2_700Bold' },
  { key: 'varela-round', name: 'Smooth & Rounded', fontFamily: 'VarelaRound_400Regular' },
  // The app's own heading font (already registered above) — no new package.
  { key: 'bakbak', name: 'Bakbak', fontFamily: 'BakbakOne-Regular' },
];

const DEFAULT_FONT_FAMILY = 'Prata-Regular';

/** Resolves a stored brand_font key (or null/unrecognised) to a registered fontFamily. */
export function resolveProviderFontFamily(key: string | null | undefined): string {
  return PROVIDER_FONTS.find(f => f.key === key)?.fontFamily ?? DEFAULT_FONT_FAMILY;
}
