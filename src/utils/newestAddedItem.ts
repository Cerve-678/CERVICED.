/**
 * The most recently added item among `candidates` (by its ISO `addedAt`), or
 * null when there are none with a readable timestamp. Ties go to the later
 * entry, which is the one appended last. Used by the cart to decide which card
 * to scroll to after something is added.
 */
export function newestAddedItem<T extends { addedAt?: string | undefined }>(candidates: readonly T[]): T | null {
  let best: T | null = null;
  let bestAt = -Infinity;
  for (const candidate of candidates) {
    const at = Date.parse(candidate.addedAt ?? '');
    if (Number.isFinite(at) && at >= bestAt) {
      best = candidate;
      bestAt = at;
    }
  }
  return best;
}
