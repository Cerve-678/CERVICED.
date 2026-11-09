// Re-rank a list that's already on screen without visibly reshuffling it.
//
// Items already shown keep their place (any that dropped out of `next` are
// removed), and items that are new in `next` are added after them, in the
// order `next` ranks them. The returned objects come from `next`, so fresher
// data for an item still lands. With nothing shown yet, `next` is returned
// as-is.
//
// Home's Recommended rail re-ranks whenever more providers load in the
// background; without this, cards jumped around mid-view a second after
// first paint.
export function keepShownOrder<T extends { id: string }>(shown: T[], next: T[]): T[] {
  if (shown.length === 0) return next;
  const nextById = new Map(next.map(item => [item.id, item]));
  const kept: T[] = [];
  const keptIds = new Set<string>();
  for (const item of shown) {
    const fresh = nextById.get(item.id);
    if (fresh && !keptIds.has(item.id)) {
      kept.push(fresh);
      keptIds.add(item.id);
    }
  }
  const added = next.filter(item => !keptIds.has(item.id));
  return [...kept, ...added];
}
