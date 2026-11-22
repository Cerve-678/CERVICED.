// src/features/providers/heroPhotos.ts
//
// The portfolio photos a page style's hero opens on: Editorial's tilted card
// (1), Bow's photo under the ribbon (1), Snapshot's strip (3) and Hush's
// boxes (3); see pageStyles heroPhotoPickLimit. The provider
// picks them in Branding → Your Photos, stored as portfolio_items.is_featured
// (a column nothing else sets, so no migration). One set of picks serves every style: each takes as many
// as it shows, picks first, then their newest photos fill any slot left, so a
// hero is never empty for a provider who has a portfolio at all.

/** The most any hero shows (Snapshot's strip, Hush's boxes); the database keeps no more picks than this. */
export const HERO_PHOTO_LIMIT = 3;

/**
 * The photos for the hero, in the order they show. `items` come newest first
 * (getProviderPortfolio orders featured first, then by date), so the picked
 * photos keep that order among themselves, and the rest follow newest first.
 */
export function heroPhotos<T extends { is_featured?: boolean | null }>(items: readonly T[], limit = HERO_PHOTO_LIMIT): T[] {
  const picked = items.filter(item => item.is_featured);
  const rest = items.filter(item => !item.is_featured);
  return [...picked, ...rest].slice(0, limit);
}

/** Picks or un-picks a photo in Branding's picker; one past the limit is refused. */
export function toggleHeroPhotoPick(picked: readonly string[], id: string, limit = HERO_PHOTO_LIMIT): string[] {
  if (picked.includes(id)) return picked.filter(existing => existing !== id);
  if (picked.length >= limit) return [...picked];
  return [...picked, id];
}
