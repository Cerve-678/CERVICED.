import { hairTypeFamily } from '../constants/hairTypes';

/**
 * Shared "does this hair-type list match" rule.
 *
 * Both levels of hair-type data use the same empty-means-all semantics, and
 * both must agree or search results stop lining up with what a profile shows:
 *   - providers.hair_types_catered  — the broad provider-level claim the
 *     client Search "Hair Type" filter matches on.
 *   - services.hair_types_suitable  — the narrower per-service refinement.
 *
 * Empty/null means "caters to / suits all hair types", NOT "unknown". That's
 * deliberate: a provider who never filled the field in is never wrongly
 * excluded from search. The flip side is that the filter only genuinely
 * narrows once providers populate it.
 *
 * A curl code and its family word match each other (2026-11-27): a search
 * for 3B finds a provider who ticked Curly, and a search for Coily finds one
 * who ticked 4C. Two different codes (3A and 3B) don't. The same rule runs
 * server-side as public.hair_type_matches, which get_providers_availability
 * uses; keep the two in step.
 */
export function matchesHairType(
  list: string[] | null | undefined,
  requested: string,
): boolean {
  if (!list?.length) return true;
  if (list.includes(requested)) return true;
  const family = hairTypeFamily(requested);
  if (family !== requested) return list.includes(family);
  return list.some(t => hairTypeFamily(t) === requested);
}
