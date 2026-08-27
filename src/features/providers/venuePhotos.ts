/**
 * Venue/workspace photos vs. photos of the provider's actual work.
 *
 * Both live in `portfolio_items` — InfoRegScreen's "Address & venue photos"
 * uploader stamps this category, everything else stamps the provider's own
 * service_category — but they are two different things to a client. A picture
 * of the room belongs with the facts about the business (Additional
 * Information on the profile), not in the Portfolio grid between finished
 * results, and not in Explore's inspiration feed at all.
 *
 * The category value lives here rather than in databaseService.ts so the rule
 * is one leaf module every surface can share: the Supabase query that excludes
 * venue rows from Explore, the client profile that routes them to Additional
 * Information, and the provider-side screens that must not count them as
 * portfolio photos. Stored lowercase, unlike every real service category.
 */
export const VENUE_PORTFOLIO_CATEGORY = "venue";

/** Narrow shape so this stays usable from anything holding a portfolio row. */
type CategorisedItem = { category?: string | null };

export function isVenuePhoto(item: CategorisedItem): boolean {
  return item.category === VENUE_PORTFOLIO_CATEGORY;
}

/**
 * Split a provider's portfolio rows into the work gallery and the venue
 * shots. Legacy rows with a NULL category are work photos — they predate the
 * venue uploader, and mapDbPortfolioItem still has a fallback for them.
 */
export function splitPortfolioByKind<T extends CategorisedItem>(
  items: T[],
): { work: T[]; venue: T[] } {
  const work: T[] = [];
  const venue: T[] = [];
  for (const item of items) (isVenuePhoto(item) ? venue : work).push(item);
  return { work, venue };
}
