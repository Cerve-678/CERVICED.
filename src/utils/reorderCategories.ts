/**
 * Apply a drag-reorder to ONE service type's categories without disturbing
 * the provider's other types.
 *
 * The category pill strip on InfoRegScreen shows a single service type at a
 * time, so the order it hands back covers only that type. Rebuilding the
 * whole `categories` map from that list alone — which is what the code did
 * before providers could have more than one type — silently deletes every
 * category belonging to the types that weren't on screen.
 *
 * Key order is meaningful here (it drives display order), so the reordered
 * names are substituted into the slots the dragged type already occupied,
 * leaving the other types' categories both intact and in place.
 */
export function reorderCategoriesWithinType<T>(
  categories: Record<string, T>,
  order: string[],
): Record<string, T> {
  const next: Record<string, T> = {};
  const inOrder = new Set(order);
  const queue = [...order];

  for (const key of Object.keys(categories)) {
    if (inOrder.has(key)) {
      const replacement = queue.shift();
      if (replacement !== undefined) {
        next[replacement] = categories[replacement] as T;
      }
    } else {
      next[key] = categories[key] as T;
    }
  }

  // Names in `order` that aren't existing keys. Shouldn't happen — but
  // dropping them silently is the same class of bug this function exists to
  // prevent, so append rather than discard.
  for (const key of queue) {
    if (key in categories) next[key] = categories[key] as T;
  }

  return next;
}
