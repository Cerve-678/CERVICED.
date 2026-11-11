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
 *
 * `seenAt` (when given) says when the viewer last saw an item. Inside each
 * group, unseen items come first in random order and seen ones after,
 * longest-ago first, so every group leads with something new until
 * everything has had a turn. Groups with something unseen also go ahead of
 * groups the viewer has seen all of.
 */
export function roundRobinMix<T>(
  items: readonly T[],
  groupOf: (item: T) => string | null | undefined,
  categoryOf?: (item: T) => string | null | undefined,
  seenAt?: (item: T) => number | undefined,
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
  const queues: T[][] = [...groups.values(), ...ungrouped.map(item => [item])].map(queue =>
    seenAt ? freshFirst(queue, seenAt) : shuffle(queue),
  );

  const arrange = (list: T[][]) =>
    categoryOf ? alternateCategories(list, queue => categoryOf(queue[0]!) ?? '') : shuffle(list);
  // A group whose lead is already seen means everything in it is; those go
  // after the groups with something new, each part arranged as usual.
  const order = seenAt
    ? [
        ...arrange(queues.filter(queue => seenAt(queue[0]!) === undefined)),
        ...arrange(queues.filter(queue => seenAt(queue[0]!) !== undefined)),
      ]
    : arrange(queues);

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

// Unseen items shuffled, then seen ones from the longest ago.
function freshFirst<T>(items: readonly T[], seenAt: (item: T) => number | undefined): T[] {
  const unseen: T[] = [];
  const seen: { item: T; at: number }[] = [];
  for (const item of items) {
    const at = seenAt(item);
    if (at === undefined) unseen.push(item);
    else seen.push({ item, at });
  }
  seen.sort((a, b) => a.at - b.at);
  return [...shuffle(unseen), ...seen.map(entry => entry.item)];
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
