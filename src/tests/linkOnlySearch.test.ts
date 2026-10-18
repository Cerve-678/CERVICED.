import { filtersAllowLinkOnly } from '../features/providers/linkOnlySearch';

describe('filtersAllowLinkOnly', () => {
  it('keeps link-only providers with no filters, or only area/speciality ones', () => {
    expect(filtersAllowLinkOnly({})).toBe(true);
    expect(filtersAllowLinkOnly({ serviceType: 'all', rating: 0 })).toBe(true);
  });

  it.each([
    ['rating', { rating: 4 }],
    ['price', { priceRange: { min: 0, max: 50 } }],
    ['availability', { availableOnly: true }],
    ['practice type', { serviceType: 'studio' }],
    ['hair type', { hairType: '4c' }],
    ['skin tone', { skinTone: 'deep' }],
    ['audience', { audience: 'women' }],
    ['walk-ins', { walkInsWelcome: true }],
    ['group bookings', { groupBookingsAvailable: true }],
    ['vegan', { veganCrueltyFree: true }],
  ])('drops them once a %s filter is on', (_label, filters) => {
    expect(filtersAllowLinkOnly(filters)).toBe(false);
  });
});
