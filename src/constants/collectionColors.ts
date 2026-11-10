import type { CollectionColor } from '../types/collections';

/**
 * The three pastel "jelly" folder colours for Explore collections. Fixed in
 * both light and dark mode: the folders are objects sitting on the screen,
 * not part of its theme. Chosen 2026-11-09 from the folder options page.
 */
export interface CollectionPalette {
  /** The see-through front panel. */
  front: string;
  /** The back panel and its tab. */
  back: string;
  /** The back panel darkened where the looks go in, for depth. */
  backShade: string;
  /** Soft shadow under the folder. */
  deep: string;
  /** Name and count printed on the front. */
  ink: string;
  label: string;
}

export const COLLECTION_PALETTES: Record<CollectionColor, CollectionPalette> = {
  pink: { front: '#F3BECF', back: '#E8A3BA', backShade: '#C9869E', deep: '#C97F99', ink: '#6E2B45', label: 'Pink' },
  blue: { front: '#BAD3EF', back: '#98BCE5', backShade: '#879AC1', deep: '#7399C9', ink: '#24456F', label: 'Blue' },
  green: { front: '#C0E2CA', back: '#A0D0AE', backShade: '#8EAB94', deep: '#78B08A', ink: '#275A3B', label: 'Green' },
};
