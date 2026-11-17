// src/features/providers/fanPhotos.ts
//
// The photos that open the Hush and Pearl page styles: three in boxes for
// Hush, a fan of five for Pearl (pageStyles heroPhotoPickLimit). The provider
// picks them from their portfolio in Branding → Your Photos / Your Fan, stored as portfolio_items.is_featured (a
// column nothing else set before, so no migration). With nothing picked, the
// fan shows their newest photos, so the hero is never empty for a provider
// who has a portfolio at all.

/** The most any hero shows (Pearl's fan); the database keeps no more picks than this. */
export const FAN_PHOTO_LIMIT = 5;

/**
 * The photos for the fan, in the order they fan out from left to right.
 * `items` come newest first (getProviderPortfolio orders featured first, then
 * by date), so the picked photos keep that order among themselves.
 */
export function fanPhotos<T extends { is_featured?: boolean | null }>(items: readonly T[], limit = FAN_PHOTO_LIMIT): T[] {
  const picked = items.filter(item => item.is_featured);
  return (picked.length > 0 ? picked : items).slice(0, limit);
}

/** The tilt of each photo in a fan of `count`, in degrees, spread evenly round the middle. */
export function fanAngles(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  const step = count <= 3 ? 16 : 13;
  return Array.from({ length: count }, (_, index) => index * step - ((count - 1) * step) / 2);
}

/** Picks or un-picks a photo in Branding's fan picker; a sixth pick is refused. */
export function toggleFanPick(picked: readonly string[], id: string, limit = FAN_PHOTO_LIMIT): string[] {
  if (picked.includes(id)) return picked.filter(existing => existing !== id);
  if (picked.length >= limit) return [...picked];
  return [...picked, id];
}
