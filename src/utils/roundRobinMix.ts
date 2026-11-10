import { shuffle } from './shuffle';

/**
 * Mixes a feed so every group gets a turn before any group gets a second one.
 *
 * Items are grouped (by provider, say), each group is shuffled, and the feed
 * is dealt in rounds: one item from every group that still has some, in the
 * same group order each round, so the same group is a whole round apart.
 * The group order is random on every call, and when `categoryOf` is given
 * it's arranged so neighbouring groups are different categories where
 * possible.
 *
 * A plain shuffle gives each item an equal chance, which means a group with
 * thirty items fills most of the top of the feed and a group with two barely
 * shows. Dealing in rounds gives each group an equal share of the top.
 * Later rounds only hold the bigger groups, so the tail of a long feed is
 * less varied; that's what's actually there to show.
 */
export function roundRobinMix<T>(
  items: readonly T[],
  groupOf: (item: T) => string | null | undefined,
  categoryOf?: (item: T) => string | null | undefined,
): T[] {
  if (items.length < 2) return [...items];

  const groups = new Map<string, T[]>();
  const ungrouped: T[] = [];
  for (const item of items) {
    const key = groupOf(item);
    if (!key) {
      ungrouped.push(item);
      continue;
    }
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  // Items with no group each get a round slot of their own.
  const queues: T[][] = [...groups.values(), ...ungrouped.map(item => [item])].map(shuffle);

  const order = categoryOf
    ? alternateCategories(queues, queue => categoryOf(queue[0]!) ?? '')
    : shuffle(queues);

  const out: T[] = [];
  let dealt = true;
  for (let round = 0; dealt; round++) {
    dealt = false;
    for (const queue of order) {
      const item = queue[round];
      if (item !== undefined) {
        out.push(item);
        dealt = true;
      }
    }
  }
  return out;
}

// Random order with no two neighbours sharing a category, whenever that's
// possible. Each step takes a category other than the last one, preferring
// whichever has the most left (so the biggest category can't be stranded at
// the end with nothing to sit between), with ties broken at random.
function alternateCategories<Q>(items: readonly Q[], categoryOf: (item: Q) => string): Q[] {
  const byCategory = new Map<string, Q[]>();
  for (const item of shuffle([...items])) {
    const key = categoryOf(item);
    const list = byCategory.get(key);
    if (list) list.push(item);
    else byCategory.set(key, [item]);
  }
  const out: Q[] = [];
  let last: string | null = null;
  while (out.length < items.length) {
    const candidates = shuffle([...byCategory.entries()].filter(([, list]) => list.length > 0));
    const allowed = candidates.filter(([key]) => key !== last);
    const pool = allowed.length > 0 ? allowed : candidates;
    pool.sort((a, b) => b[1].length - a[1].length);
    const [key, list] = pool[0]!;
    out.push(list.pop()!);
    last = key;
  }
  return out;
}
