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
});
