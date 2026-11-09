import { keepShownOrder } from '../utils/keepShownOrder';

const p = (id: string, name = id) => ({ id, name });

describe('keepShownOrder', () => {
  it('returns the new ranking when nothing is shown yet', () => {
    const next = [p('b'), p('a')];
    expect(keepShownOrder([], next)).toBe(next);
  });

  it('keeps shown items in place and appends newcomers in ranked order', () => {
    const shown = [p('a'), p('b'), p('c')];
    const next = [p('d'), p('c'), p('a'), p('e'), p('b')];
    expect(keepShownOrder(shown, next).map(x => x.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('drops items that left the new list', () => {
    const shown = [p('a'), p('b'), p('c')];
    const next = [p('c'), p('a')];
    expect(keepShownOrder(shown, next).map(x => x.id)).toEqual(['a', 'c']);
  });

  it('uses the fresh object for an item already shown', () => {
    const shown = [p('a', 'old')];
    const next = [p('a', 'new')];
    expect(keepShownOrder(shown, next)[0]?.name).toBe('new');
  });
});
