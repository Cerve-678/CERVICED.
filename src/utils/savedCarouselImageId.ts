import type { PortfolioItem } from '../types/providers';

/**
 * Service cards use one saved id per carousel photo. The modal may open on
 * one photo and then be swiped to another, so saving must follow the visible
 * page rather than the card that first opened it.
 */
export function savedCarouselImageId(item: PortfolioItem, imageIndex: number): string {
  if (item.kind !== 'service') return item.id;
  return `${item.id.replace(/__\d+$/, '')}__${imageIndex}`;
}
