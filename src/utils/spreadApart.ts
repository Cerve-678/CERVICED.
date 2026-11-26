/**
 * Reorders a list so that items sharing a key don't sit close together.
 *
 * Each rule names a key (a provider, a category) and how many places must
 * separate two items with the same value. Rules are listed most important
 * first: when nothing left can satisfy all of them, the earliest-placed item
 * that satisfies the first rule wins, and failing that simply the next item.
 * Otherwise the original order is kept as far as the rules allow, so a
 * shuffled list stays shuffled and only the clumps are broken up.
 *
 * `before` is what's already on screen above the list (a feed's earlier
 * pages), so the first items of a new page don't land next to their twins.
 */
export interface SpreadRule<T> {
  keyOf: (item: T) => string | null | undefined;
  /** Same-key items need at least this many others between them. */
  gap: number;
}

export function spreadApart<T>(
  items: readonly T[],
  rules: readonly SpreadRule<T>[],
  before: readonly T[] = [],
): T[] {
  const remaining = [...items];
  const placed: T[] = [...before];
  const out: T[] = [];

  const clashes = (item: T, rule: SpreadRule<T>): boolean => {
    const key = rule.keyOf(item);
    if (!key) return false;
    for (let back = 1; back <= rule.gap && back <= placed.length; back++) {
      if (rule.keyOf(placed[placed.length - back]!) === key) return true;
    }
    return false;
  };

  while (remaining.length > 0) {
    let pick = remaining.findIndex(item => rules.every(rule => !clashes(item, rule)));
    if (pick === -1 && rules.length > 0) pick = remaining.findIndex(item => !clashes(item, rules[0]!));
    if (pick === -1) pick = 0;
    const [item] = remaining.splice(pick, 1);
    placed.push(item!);
    out.push(item!);
  }
  return out;
}
