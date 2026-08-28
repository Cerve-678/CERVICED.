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
 */
export function matchesHairType(
  list: string[] | null | undefined,
  requested: string,
): boolean {
  if (!list?.length) return true;
  return list.includes(requested);
}
