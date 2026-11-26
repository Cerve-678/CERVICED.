/**
 * The "I work with" rows (clients, skin tones, hair types) and the Products
 * section, both shown in Additional Information on a provider's profile. Pure, so the profile screen
 * and its tests read the same thing.
 */
import { SKIN_TONES } from '../../constants/skinTones';
import { HAIR_TYPES } from '../../constants/hairTypes';
import { splitProductsUsed } from '../business-details/productBrands';

export type ChipGroup = { label: string; chips: string[] };

/** Keeps `picked` in the vocabulary's order, or collapses it to `allLabel`
 *  when every option is picked. Anything outside the vocabulary is kept. */
function inOrder(picked: readonly string[], vocabulary: readonly string[], allLabel: string): string[] {
  const lower = new Set(picked.map(value => value.toLowerCase()));
  const known = vocabulary.filter(value => lower.has(value.toLowerCase()));
  if (known.length === vocabulary.length) return [allLabel];
  const extra = picked.filter(value => !vocabulary.some(v => v.toLowerCase() === value.toLowerCase()));
  return [...known, ...extra];
}

/** The "I work with" rows for Additional Information. A row with nothing
 *  stated is left out. */
export function workWithGroups(provider: {
  clientele: readonly string[];
  skinTonesCatered: readonly string[];
  hairTypesCatered: readonly string[];
}): ChipGroup[] {
  const groups: ChipGroup[] = [];
  if (provider.clientele.length > 0) {
    groups.push({ label: 'Works with', chips: [...provider.clientele] });
  }
  if (provider.skinTonesCatered.length > 0) {
    groups.push({ label: 'Skin tones', chips: inOrder(provider.skinTonesCatered, SKIN_TONES, 'All skin tones') });
  }
  if (provider.hairTypesCatered.length > 0) {
    groups.push({ label: 'Hair types', chips: inOrder(provider.hairTypesCatered, HAIR_TYPES, 'All hair types') });
  }
  return groups;
}

/** The chips for Additional Information → Products, or null when there's
 *  nothing to say. Vegan & cruelty-free leads, because it's a claim about
 *  every product, not one brand. */
export function productsGroup(provider: {
  productsUsed: string;
  veganCrueltyFree: boolean;
}): ChipGroup | null {
  const chips = [
    ...(provider.veganCrueltyFree ? ['Vegan & cruelty-free'] : []),
    ...splitProductsUsed(provider.productsUsed),
  ];
  return chips.length > 0 ? { label: 'Products', chips } : null;
}
