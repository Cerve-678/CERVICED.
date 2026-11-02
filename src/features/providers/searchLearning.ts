// Which earlier searches a tap also answers. A client who searched "infills",
// found nothing and reworded to "acrylic" has told us what "infills" means, so
// their tap teaches both (record_search_tap keeps it; nothing is read back
// until several different people agree).
//
// Only searches that found NOTHING count. "nails" then "hair" is a change of
// mind, not a rewording, and crediting it would teach that nails means hair.

export interface FruitlessSearch {
  query: string;
  at: number;
}

const SITTING_MS = 3 * 60 * 1000;
const MAX_CREDITED = 2;

const norm = (q: string) => q.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The fruitless searches to credit, most recent first. Search runs as the
 * client types, so "inf" and "infi" are the same search as "infills": a
 * query another one grew out of is dropped, and so is anything the current
 * query itself grew from or into.
 */
export function earlierSearchesToCredit(
  history: readonly FruitlessSearch[],
  current: string,
  now: number,
): string[] {
  const here = norm(current);
  const recent = history
    .filter(s => now - s.at <= SITTING_MS)
    .map(s => norm(s.query))
    .filter(q => q && !here.startsWith(q) && !q.startsWith(here));
  const whole = recent.filter((q, i) => !recent.some((other, j) => j !== i && other !== q && other.startsWith(q)));
  return [...new Set(whole)].reverse().slice(0, MAX_CREDITED);
}
