// src/utils/learnedSpecialities.ts
// Specialities the curated list doesn't have yet, learned from what providers
// on the app have actually typed. A term needs more than one provider behind it
// before anyone else is offered it, so a typo or a one-off never spreads.
import { matchesSpeciality, normalizeTerm } from './fuzzyMatch';

export type SpecialityUse = {
  specialty: string;
  providerId: string;
  categories: string[];
};

const MIN_PROVIDERS = 2;
const MAX_LEARNED = 30;

function looksLikeASpeciality(term: string): boolean {
  if (term.length < 3 || term.length > 40) return false;
  if (!/[a-z]/i.test(term)) return false;
  return !/@|https?:|www\.|\.com|\.co\b/i.test(term);
}

/**
 * Terms worth offering for these service categories, most used first. Anything
 * the known list already covers, including a misspelling of it, is left out.
 * No categories means any category.
 */
export function learnSpecialities(
  uses: readonly SpecialityUse[],
  known: readonly string[],
  categories: readonly string[] = [],
): string[] {
  const groups = new Map<string, { providers: Set<string>; spellings: Map<string, number> }>();

  for (const use of uses) {
    const term = use.specialty.trim();
    const key = normalizeTerm(term);
    if (!key || !looksLikeASpeciality(term)) continue;
    if (categories.length > 0 && !use.categories.some(c => categories.includes(c))) continue;
    const group = groups.get(key) ?? { providers: new Set<string>(), spellings: new Map<string, number>() };
    group.providers.add(use.providerId);
    group.spellings.set(term, (group.spellings.get(term) ?? 0) + 1);
    groups.set(key, group);
  }

  return [...groups.values()]
    .filter(group => group.providers.size >= MIN_PROVIDERS)
    .map(group => ({
      term: [...group.spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0],
      providers: group.providers.size,
    }))
    .filter(({ term }) => !matchesSpeciality([...known], term))
    .sort((a, b) => b.providers - a.providers || a.term.localeCompare(b.term))
    .slice(0, MAX_LEARNED)
    .map(({ term }) => term);
}
