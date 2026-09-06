import { reorderCategoriesWithinType } from '../utils/reorderCategories';

describe('reorderCategoriesWithinType', () => {
  // Lashes and Brows interleaved, as the categories object actually holds them.
  const menu = {
    'Classic Set': ['Classic Full Set'],
    Lamination: ['Brow Lamination'],
    Volume: ['Volume Full Set'],
    'Tint & Shape': ['HD Brows'],
  };

  it('reorders one type without deleting the other type\'s categories', () => {
    // Dragging Volume above Classic Set, on the Lashes tab.
    const result = reorderCategoriesWithinType(menu, ['Volume', 'Classic Set']);

    expect(Object.keys(result)).toEqual([
      'Volume',
      'Lamination',
      'Classic Set',
      'Tint & Shape',
    ]);
    // The Brows categories survive with their services intact — the bug this
    // guards against wiped them entirely.
    expect(result['Lamination']).toEqual(['Brow Lamination']);
    expect(result['Tint & Shape']).toEqual(['HD Brows']);
  });

  it('leaves the untouched type in its original positions', () => {
    const result = reorderCategoriesWithinType(menu, ['Tint & Shape', 'Lamination']);

    // Brows swapped; Lashes categories keep both their data and their slots.
    expect(Object.keys(result)).toEqual([
      'Classic Set',
      'Tint & Shape',
      'Volume',
      'Lamination',
    ]);
    expect(result['Classic Set']).toEqual(['Classic Full Set']);
    expect(result['Volume']).toEqual(['Volume Full Set']);
  });

  it('is a no-op when the order already matches', () => {
    const result = reorderCategoriesWithinType(menu, ['Classic Set', 'Volume']);
    expect(Object.keys(result)).toEqual(Object.keys(menu));
    expect(result).toEqual(menu);
  });

  it('handles a single-type provider, where order covers every category', () => {
    const single = { Cuts: ['Cut and finish'], Colour: ['Balayage'] };
    const result = reorderCategoriesWithinType(single, ['Colour', 'Cuts']);
    expect(Object.keys(result)).toEqual(['Colour', 'Cuts']);
    expect(result).toEqual({ Colour: ['Balayage'], Cuts: ['Cut and finish'] });
  });

  it('drops nothing when handed an empty order', () => {
    expect(reorderCategoriesWithinType(menu, [])).toEqual(menu);
  });

  it('ignores a name that is not an existing category', () => {
    const result = reorderCategoriesWithinType(menu, ['Volume', 'Ghost Category']);
    expect(result['Volume']).toEqual(['Volume Full Set']);
    expect(result).not.toHaveProperty('Ghost Category');
    // Everything else is still present.
    expect(Object.keys(result).sort()).toEqual(
      ['Classic Set', 'Lamination', 'Tint & Shape', 'Volume'].sort(),
    );
  });
});
