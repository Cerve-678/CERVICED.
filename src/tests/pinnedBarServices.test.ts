import { PINNED_BAR_SERVICE_LIMIT, pinnedBarServices } from '../features/providers/page/PinnedBarServices';

describe("Riviera's pinned bar services", () => {
  it('starts on the cheapest, then takes the rest in menu order', () => {
    const picked = pinnedBarServices([
      { name: 'Full set', price: 65 },
      { name: 'Lift', price: 45 },
      { name: 'Infill', price: 40 },
      { name: 'Tint', price: 15 },
    ]);
    expect(picked.map(s => s.name)).toEqual(['Tint', 'Full set', 'Lift', 'Infill']);
  });

  it('skips unpriced services and repeats of the same name', () => {
    const picked = pinnedBarServices([
      { name: 'Consultation', price: 0 },
      { name: 'Infill', price: '40' },
      { name: 'infill ', price: 42 },
      { name: 'Full set', price: 'n/a' },
    ]);
    expect(picked.map(s => s.name)).toEqual(['Infill']);
  });

  it('takes turns through at most a handful', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ name: `Service ${i}`, price: 20 + i }));
    expect(pinnedBarServices(many)).toHaveLength(PINNED_BAR_SERVICE_LIMIT);
  });

  it('has nothing to show when nothing is priced', () => {
    expect(pinnedBarServices([{ name: 'Free chat', price: 0 }])).toEqual([]);
  });
});
