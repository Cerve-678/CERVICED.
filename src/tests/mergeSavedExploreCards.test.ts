import { mergeSavedExploreCards } from '../utils/mergeSavedExploreCards';
import type { PortfolioItem } from '../types/providers';

const card = (id: string, caption = id): PortfolioItem => ({
  id,
  caption,
  image: { uri: `https://example.com/${id}.jpg` },
  category: 'HAIR',
  aspectRatio: 0.8,
  providerId: 'provider-a',
});

describe('mergeSavedExploreCards', () => {
  it('shows a just-hearted Discover card before its database hydration completes', () => {
    expect(mergeSavedExploreCards(['fresh'], [card('fresh')], [])).toEqual([card('fresh')]);
  });

  it('keeps the visible card if hydration is partial and orders saves newest first', () => {
    const cards = mergeSavedExploreCards(
      ['older', 'fresh'],
      [card('fresh', 'current card')],
      [card('older'), card('fresh', 'stale hydrated card')],
    );

    expect(cards.map((item) => item.id)).toEqual(['fresh', 'older']);
    expect(cards[0]?.caption).toBe('current card');
  });

  it('does not surface cards that have since been unsaved', () => {
    expect(mergeSavedExploreCards(['kept'], [card('removed')], [card('kept'), card('removed')]))
      .toEqual([card('kept')]);
  });

  it('keeps saves already on screen while Favourites reloads, so an open collection never empties', () => {
    // Re-opening Favourites: Discover only holds one of the saves, the rest
    // were loaded last time and must not drop out until the fetch returns.
    const alreadyShown = [card('in-folder-1'), card('in-folder-2'), card('in-discover')];
    const cards = mergeSavedExploreCards(
      ['in-folder-1', 'in-folder-2', 'in-discover'],
      [card('in-discover')],
      alreadyShown,
    );

    expect(cards.map((item) => item.id)).toEqual(['in-discover', 'in-folder-2', 'in-folder-1']);
  });
});
