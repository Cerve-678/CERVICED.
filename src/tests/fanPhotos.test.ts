import { FAN_PHOTO_LIMIT, fanAngles, fanPhotos, toggleFanPick } from '../features/providers/fanPhotos';

const photo = (id: string, isFeatured = false) => ({ id, is_featured: isFeatured });

describe('the fan of photos (Hush and Pearl)', () => {
  it('shows the picked photos, in portfolio order', () => {
    const items = [photo('a'), photo('b', true), photo('c'), photo('d', true)];
    expect(fanPhotos(items).map(p => p.id)).toEqual(['b', 'd']);
  });

  it('falls back to the newest photos when nothing is picked', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => photo(id));
    expect(fanPhotos(items).map(p => p.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('never fans out more than five, and gives Hush three', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => photo(id, true));
    expect(fanPhotos(items)).toHaveLength(FAN_PHOTO_LIMIT);
    expect(fanPhotos(items, 3).map(p => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('refuses a fourth pick for Hush', () => {
    expect(toggleFanPick(['a', 'b', 'c'], 'd', 3)).toEqual(['a', 'b', 'c']);
  });

  it('is empty for an empty portfolio', () => {
    expect(fanPhotos([])).toEqual([]);
  });

  it('spreads the tilts evenly round the middle', () => {
    expect(fanAngles(0)).toEqual([]);
    expect(fanAngles(1)).toEqual([0]);
    expect(fanAngles(3)).toEqual([-16, 0, 16]);
    expect(fanAngles(5)).toEqual([-26, -13, 0, 13, 26]);
  });

  it('picks and un-picks, refusing a sixth', () => {
    expect(toggleFanPick([], 'a')).toEqual(['a']);
    expect(toggleFanPick(['a', 'b'], 'a')).toEqual(['b']);
    const full = ['a', 'b', 'c', 'd', 'e'];
    expect(toggleFanPick(full, 'f')).toEqual(full);
    expect(toggleFanPick(full, 'c')).toEqual(['a', 'b', 'd', 'e']);
  });
});
