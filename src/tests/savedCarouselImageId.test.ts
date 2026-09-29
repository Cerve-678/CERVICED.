import { savedCarouselImageId } from '../utils/savedCarouselImageId';
import type { PortfolioItem } from '../types/providers';

const serviceCard: PortfolioItem = {
  id: 'service-service-123__0',
  image: { uri: 'https://example.com/first.jpg' },
  caption: '',
  category: 'HAIR',
  aspectRatio: 0.8,
  providerId: 'provider-a',
  kind: 'service',
  serviceId: 'service-123',
};

it('saves the currently displayed service carousel image', () => {
  expect(savedCarouselImageId(serviceCard, 2)).toBe('service-service-123__2');
});

it('keeps a portfolio card on its own saved id', () => {
  expect(savedCarouselImageId({ ...serviceCard, id: 'portfolio-1', kind: 'portfolio' }, 2))
    .toBe('portfolio-1');
});
