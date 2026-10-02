import type { PortfolioItem } from '../types/providers';

/**
 * Keep cards that are already visible in Explore while Favourites hydrates
 * saved ids from the database. A fresh heart must appear immediately; a
 * delayed or partial hydration must not make it vanish in the meantime.
 */
export function mergeSavedExploreCards(
  savedIds: string[],
  localCards: PortfolioItem[],
  hydratedCards: PortfolioItem[],
): PortfolioItem[] {
  const savedIdSet = new Set(savedIds);
  const cardsById = new Map<string, PortfolioItem>();

  for (const card of hydratedCards) {
    if (savedIdSet.has(card.id)) cardsById.set(card.id, card);
  }
  // The in-memory card has all the details the client just saw, so it wins
  // over a partial hydration row for the same saved id.
  for (const card of localCards) {
    if (savedIdSet.has(card.id)) cardsById.set(card.id, card);
  }

  return [...cardsById.values()].sort(
    (a, b) => savedIds.lastIndexOf(b.id) - savedIds.lastIndexOf(a.id),
  );
}
