// Business-name font choices for the provider Branding screen. Each key is
// stored in providers.brand_font. These fonts apply only to the provider's
// display name, never to body text or app chrome.

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
  { key: 'bakbak', name: 'Bakbak', fontFamily: 'BakbakOne-Regular' },
];

const DEFAULT_FONT_FAMILY = 'Prata-Regular';

export function resolveProviderFontFamily(key: string | null | undefined): string {
  return PROVIDER_FONTS.find(font => font.key === key)?.fontFamily ?? DEFAULT_FONT_FAMILY;
}
