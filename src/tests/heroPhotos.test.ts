import { HERO_PHOTO_LIMIT, heroPhotos, heroPhotosForPage, toggleHeroPhotoPick } from '../features/providers/heroPhotos';

const photo = (id: string, isFeatured = false) => ({ id, is_featured: isFeatured });

describe('the photos a hero opens on', () => {
  it('shows the picked photos first, in portfolio order, then the newest', () => {
    const items = [photo('a'), photo('b', true), photo('c'), photo('d', true)];
    expect(heroPhotos(items).map(p => p.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('gives a one-photo hero the first pick', () => {
    const items = [photo('a'), photo('b', true), photo('c', true)];
    expect(heroPhotos(items, 1).map(p => p.id)).toEqual(['b']);
  });

  it('falls back to the newest photos when nothing is picked', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => photo(id));
    expect(heroPhotos(items).map(p => p.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('never shows more than four (Moodboard\'s prints)', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => photo(id, true));
    expect(HERO_PHOTO_LIMIT).toBe(4);
    expect(heroPhotos(items).map(p => p.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('refuses a fifth pick', () => {
    expect(toggleHeroPhotoPick(['a', 'b', 'c', 'd'], 'e')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('refuses a fourth pick', () => {
    expect(toggleHeroPhotoPick(['a', 'b', 'c'], 'd', 3)).toEqual(['a', 'b', 'c']);
  });

  it('is empty for an empty portfolio', () => {
    expect(heroPhotos([])).toEqual([]);
  });

  it('picks and un-picks', () => {
    expect(toggleHeroPhotoPick([], 'a')).toEqual(['a']);
    expect(toggleHeroPhotoPick(['a', 'b'], 'a')).toEqual(['b']);
    const full = ['a', 'b', 'c'];
    expect(toggleHeroPhotoPick(full, 'c')).toEqual(['a', 'b']);
  });
});

describe('the photos a page hero draws (app, InfoReg preview and website)', () => {
  const shot = (id: string, isFeatured = false, url: string | null = `https://x/${id}.jpg`) => ({ id, is_featured: isFeatured, image_url: url });

  it('takes as many as the style shows, picks first', () => {
    const items = [shot('a'), shot('b'), shot('c', true), shot('d'), shot('e')];
    expect(heroPhotosForPage(items, 4).map(p => p.id)).toEqual(['c', 'a', 'b', 'd']);
    expect(heroPhotosForPage(items, 1).map(p => p.id)).toEqual(['c']);
  });

  it('takes the newest three for a style with nothing to pick', () => {
    const items = [shot('a'), shot('b', true), shot('c'), shot('d')];
    expect(heroPhotosForPage(items, 0).map(p => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('leaves out a photo with no picture', () => {
    expect(heroPhotosForPage([shot('a', false, null), shot('b')], 3).map(p => p.id)).toEqual(['b']);
  });
});
