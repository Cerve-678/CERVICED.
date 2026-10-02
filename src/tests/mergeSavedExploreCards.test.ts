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
});
