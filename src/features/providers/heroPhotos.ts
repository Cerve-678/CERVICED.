// src/features/providers/heroPhotos.ts
//
// The portfolio photos a page style's hero opens on: Editorial's tilted card
// (1), Bow's photo under the ribbon (1), Snapshot's strip (3) and Hush's
// boxes (3); see pageStyles heroPhotoPickLimit. The provider
// picks them in Branding → Your Photos, stored as portfolio_items.is_featured
// (a column nothing else sets, so no migration). One set of picks serves every style: each takes as many
// as it shows, picks first, then their newest photos fill any slot left, so a
// hero is never empty for a provider who has a portfolio at all.

/** The most any hero shows (Moodboard's four prints); Branding saves no more
 *  picks than this. Only the app caps it: is_featured has no limit of its own. */
export const HERO_PHOTO_LIMIT = 4;

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

/**
 * The photos a provider's page hero actually draws: a style that lets them
 * pick (heroPhotoPickLimit > 0) opens on their picks topped up with the
 * newest; any other style takes the newest three. One rule for the app's
 * profile, its InfoReg preview and the website, so none of them shows a
 * different set.
 */
export function heroPhotosForPage<T extends { is_featured?: boolean | null; image_url?: string | null }>(
  items: readonly T[],
  pickLimit: number,
): T[] {
  return (pickLimit > 0 ? heroPhotos(items, pickLimit) : items.slice(0, 3)).filter(item => !!item.image_url);
}
