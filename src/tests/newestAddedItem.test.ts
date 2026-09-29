import { newestAddedItem } from '../utils/newestAddedItem';

describe('newestAddedItem', () => {
  it('returns the item with the latest addedAt', () => {
    const items = [
      { id: 'a', addedAt: '2026-09-27T10:00:00.000Z' },
      { id: 'b', addedAt: '2026-09-27T10:05:00.000Z' },
      { id: 'c', addedAt: '2026-09-27T09:00:00.000Z' },
    ];
    expect(newestAddedItem(items)?.id).toBe('b');
  });

  it('gives a tie to the entry appended last', () => {
    const at = '2026-09-27T10:00:00.000Z';
    expect(newestAddedItem([{ id: 'a', addedAt: at }, { id: 'b', addedAt: at }])?.id).toBe('b');
  });

  it('ignores items without a readable timestamp', () => {
    const items = [{ id: 'a', addedAt: 'not a date' }, { id: 'b' }, { id: 'c', addedAt: '2026-09-27T10:00:00.000Z' }];
    expect(newestAddedItem(items)?.id).toBe('c');
  });

  it('returns null for an empty list or no usable timestamps', () => {
    expect(newestAddedItem([])).toBeNull();
    expect(newestAddedItem([{ id: 'a', addedAt: 'nope' }])).toBeNull();
  });
});
