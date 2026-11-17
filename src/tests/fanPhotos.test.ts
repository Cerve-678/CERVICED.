import { FAN_PHOTO_LIMIT, fanPhotos, toggleFanPick } from '../features/providers/fanPhotos';

const photo = (id: string, isFeatured = false) => ({ id, is_featured: isFeatured });

describe('the photos Hush opens on', () => {
  it('shows the picked photos, in portfolio order', () => {
    const items = [photo('a'), photo('b', true), photo('c'), photo('d', true)];
    expect(fanPhotos(items).map(p => p.id)).toEqual(['b', 'd']);
  });

  it('falls back to the newest photos when nothing is picked', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => photo(id));
    expect(fanPhotos(items).map(p => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('never shows more than three', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => photo(id, true));
    expect(FAN_PHOTO_LIMIT).toBe(3);
    expect(fanPhotos(items).map(p => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('refuses a fourth pick for Hush', () => {
    expect(toggleFanPick(['a', 'b', 'c'], 'd', 3)).toEqual(['a', 'b', 'c']);
  });

  it('is empty for an empty portfolio', () => {
    expect(fanPhotos([])).toEqual([]);
  });

  it('picks and un-picks', () => {
    expect(toggleFanPick([], 'a')).toEqual(['a']);
    expect(toggleFanPick(['a', 'b'], 'a')).toEqual(['b']);
    const full = ['a', 'b', 'c'];
    expect(toggleFanPick(full, 'c')).toEqual(['a', 'b']);
  });
});
