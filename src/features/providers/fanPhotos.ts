// src/features/providers/fanPhotos.ts
//
// The photos that open the Hush page style: three in boxes (pageStyles
// heroPhotoPickLimit). The provider picks them from their portfolio in
// Branding → Your Photos, stored as portfolio_items.is_featured (a column
// nothing else set before, so no migration). With nothing picked, the boxes
// show their newest photos, so the hero is never empty for a provider who has
// a portfolio at all.

/** The most any hero shows (Hush's boxes); the database keeps no more picks than this. */
export const FAN_PHOTO_LIMIT = 3;

/**
 * The photos for the hero, in the order they show from left to right.
 * `items` come newest first (getProviderPortfolio orders featured first, then
 * by date), so the picked photos keep that order among themselves.
 */
export function fanPhotos<T extends { is_featured?: boolean | null }>(items: readonly T[], limit = FAN_PHOTO_LIMIT): T[] {
  const picked = items.filter(item => item.is_featured);
  return (picked.length > 0 ? picked : items).slice(0, limit);
}

/** Picks or un-picks a photo in Branding's picker; one past the limit is refused. */
export function toggleFanPick(picked: readonly string[], id: string, limit = FAN_PHOTO_LIMIT): string[] {
  if (picked.includes(id)) return picked.filter(existing => existing !== id);
  if (picked.length >= limit) return [...picked];
  return [...picked, id];
}
