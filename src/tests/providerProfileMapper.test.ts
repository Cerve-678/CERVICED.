import { mapProviderProfileData } from '../features/providers/profileMapper';

describe('mapProviderProfileData', () => {
  it('builds a profile view model without mutating the database image order', () => {
    const images = [
      { url: 'second.jpg', sort_order: 2 },
      { url: 'first.jpg', sort_order: 1 },
    ];
    const provider = {
      slug: 'studio-a',
      display_name: 'Studio A',
      service_category: 'Hair',
      rating: '4.8',
      services: [{
        id: 'service-1',
        category_name: 'Cuts',
        category_description: 'Precision cuts',
        name: 'Cut and finish',
        price: '45',
        duration_minutes: 60,
        description: null,
        images,
        add_ons: [{ id: 'addon-1', name: 'Treatment', price: '10', description: null, is_active: true }],
      }],
    } as any;

    const result = mapProviderProfileData(provider);
    const cutServices = result.categories['Cuts']!;

    expect(cutServices[0]!.images).toEqual([{ uri: 'first.jpg' }, { uri: 'second.jpg' }]);
    expect(images.map(image => image.url)).toEqual(['second.jpg', 'first.jpg']);
    expect(cutServices[0]!.addOns).toEqual([{ id: 'addon-1', name: 'Treatment', price: 10, description: '' }]);
  });

  it('carries the stated payment methods and accessibility tags through for the profile', () => {
    const result = mapProviderProfileData({
      slug: 'studio-b',
      display_name: 'Studio B',
      service_category: 'Hair',
      services: [],
      preferred_payment_methods: ['cash', 'bank_transfer'],
      accessibility_notes: 'Wheelchair accessible|Parking available',
    } as any);
    expect(result.paymentMethods).toEqual(['cash', 'bank_transfer']);
    expect(result.accessibilityTags).toEqual(['Wheelchair accessible', 'Parking available']);

    const none = mapProviderProfileData({ slug: 's', display_name: 'S', service_category: 'Hair', services: [] } as any);
    expect(none.paymentMethods).toEqual([]);
  });
});
