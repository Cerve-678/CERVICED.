import type { CardShape, HeroFinish } from './providerThemes';
import type { PageStyleKey, PolicyPictureLook } from './pageStyles';

/** Curated combinations of existing profile controls. They use the normal
 * branding save path, so clients and the provider preview see the same page. */
export interface ProviderBrandTemplate {
  key: string;
  name: string;
  description: string;
  theme: string;
  sheet: string;
  finish: HeroFinish;
  shape: CardShape;
  pageStyle: PageStyleKey;
  policyLook: PolicyPictureLook;
  font: string;
}

export const PROVIDER_BRAND_TEMPLATES: readonly ProviderBrandTemplate[] = [
  {
    key: 'editorial-shop', name: 'The Edit',
    description: 'An editorial cover and an airy service collection.',
    theme: 'linenink', sheet: '#FFFFFF', finish: 'solid', shape: 'square',
    pageStyle: 'shopEdit', policyLook: 'framed', font: 'playfair-display',
  },
  {
    key: 'visual-gallery', name: 'The Gallery',
    description: 'Three hero photos and a shoppable-looking service grid.',
    theme: 'coconutink', sheet: '#FFFFFF', finish: 'split', shape: 'square',
    pageStyle: 'shopGallery', policyLook: 'swipe', font: 'syne',
  },
  {
    key: 'slow-ritual', name: 'The Ritual',
    description: 'A calm feature image, warm colours and fine details.',
    theme: 'sagemilk', sheet: '#EEF3EC', finish: 'glow', shape: 'rounded',
    pageStyle: 'shopRitual', policyLook: 'peek', font: 'tenor-sans',
  },
];

export function matchingBrandTemplate(choice: {
  theme: string; sheet: string; finish: HeroFinish; shape: CardShape;
  pageStyle: PageStyleKey; policyLook: PolicyPictureLook; font: string;
}): string | null {
  return PROVIDER_BRAND_TEMPLATES.find(template =>
    template.theme === choice.theme && template.sheet === choice.sheet &&
    template.finish === choice.finish && template.shape === choice.shape &&
    template.pageStyle === choice.pageStyle && template.policyLook === choice.policyLook &&
    template.font === choice.font,
  )?.key ?? null;
}
