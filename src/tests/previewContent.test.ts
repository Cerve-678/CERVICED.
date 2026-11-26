import { previewContentFrom } from '../features/providers/previewContent';

describe('preview content from a provider menu', () => {
  const menu = {
    aboutText: 'Lash studio in Hackney.',
    categories: {
      Lashes: [
        { name: 'Classic set', price: 45, duration: '1 hr 30 min', images: [{ uri: 'https://x/1.jpg' }] },
        { name: 'Hybrid set', price: 55, duration: '2 hr' },
        { name: 'Infill', price: 30, duration: '1 hr' },
      ],
      Brows: [{ name: '  ', price: 10, duration: '30 min' }],
      Nails: [{ name: 'Gel', price: 25.5, duration: '45 min' }],
    },
    categoryDescriptions: { Lashes: 'Soft, fluffy sets.' },
  };

  it('keeps categories that have a named service, in order, with every service', () => {
    const c = previewContentFrom(menu);
    expect(c.categories).toEqual(['Lashes', 'Nails']);
    expect(c.servicesByCategory?.['Lashes']?.map(s => s.name)).toEqual(['Classic set', 'Hybrid set', 'Infill']);
    expect(c.servicesByCategory?.['Lashes']?.[0]).toMatchObject({ minutes: 90, price: 45, imageUri: 'https://x/1.jpg' });
    expect(c.servicesByCategory?.['Lashes']?.[1]?.imageUri).toBeNull();
  });

  it('outlines the first two services of the first category, and carries About and descriptions', () => {
    const c = previewContentFrom(menu);
    expect(c.services.map(s => s.name)).toEqual(['Classic set', 'Hybrid set']);
    expect(c.about).toBe('Lash studio in Hackney.');
    expect(c.categoryDescriptions?.['Lashes']).toBe('Soft, fluffy sets.');
  });

  it('is empty for a provider with no services yet', () => {
    expect(previewContentFrom({})).toMatchObject({ about: '', categories: [], services: [] });
  });

  it('lists the add-ons ticked on each service that clients can pick, hiding paused ones', () => {
    const c = previewContentFrom({
      categories: {
        Lashes: [
          { name: 'Classic set', price: 45, duration: '1 hr', addOnKeys: ['a', 'b', 'c'] },
          { name: 'Infill', price: 30, duration: '1 hr' },
        ],
      },
      addOnLibrary: [
        { key: 'a', name: 'Lash bath', price: 5, extraMinutes: 10, isActive: true },
        { key: 'b', name: 'Bottom lashes', price: 10, extraMinutes: 0, isActive: false },
        { key: 'c', name: 'Tint', price: 8, extraMinutes: 15, isActive: true },
      ],
    });
    expect(c.servicesByCategory?.['Lashes']?.[0]?.addOns).toEqual([
      { key: 'a', name: 'Lash bath', price: 5, extraMinutes: 10 },
      { key: 'c', name: 'Tint', price: 8, extraMinutes: 15 },
    ]);
    expect(c.servicesByCategory?.['Lashes']?.[1]?.addOns).toEqual([]);
  });
});
