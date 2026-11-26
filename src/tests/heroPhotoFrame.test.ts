import {
  clampHeroPhotoFrame,
  DEFAULT_HERO_PHOTO_FRAME,
  heroPhotoLayout,
  isDefaultHeroPhotoFrame,
  panHeroPhotoFrame,
  parseHeroPhotoFrame,
} from '../utils/heroPhotoFrame';
import { heroPhotoFramesOf } from '../features/providers/HeroPhoto';
import { heroPhotoSlotAspect } from '../constants/pageStyles';

describe('hero photo frame', () => {
  it('draws an unframed photo just covering its slot, centred', () => {
    // A square photo in a 200 × 100 slot covers it at 200 × 200.
    expect(heroPhotoLayout(200, 100, 1, DEFAULT_HERO_PHOTO_FRAME)).toEqual({ width: 200, height: 200, left: 0, top: -50 });
  });

  it('slides across the overflow: -1 shows the top edge, 1 the bottom', () => {
    expect(heroPhotoLayout(200, 100, 1, { zoom: 1, x: 0, y: 1 }).top).toBe(0);
    expect(heroPhotoLayout(200, 100, 1, { zoom: 1, x: 0, y: -1 }).top).toBe(-100);
  });

  it('zooms from the cover size, keeping the photo over the whole slot', () => {
    const box = heroPhotoLayout(100, 100, 1, { zoom: 2, x: 1, y: -1 });
    expect(box).toEqual({ width: 200, height: 200, left: 0, top: -100 });
  });

  it('moves the photo with the finger, 1:1, and stops at its edge', () => {
    // 50 spare points either side vertically: a 25pt drag down is half way.
    expect(panHeroPhotoFrame(DEFAULT_HERO_PHOTO_FRAME, 0, 25, 200, 100, 1)).toEqual({ zoom: 1, x: 0, y: 0.5 });
    expect(panHeroPhotoFrame(DEFAULT_HERO_PHOTO_FRAME, 0, 500, 200, 100, 1).y).toBe(1);
    // No spare width: sideways drags do nothing.
    expect(panHeroPhotoFrame(DEFAULT_HERO_PHOTO_FRAME, 40, 0, 200, 100, 1).x).toBe(0);
  });

  it('keeps frames inside what the database accepts', () => {
    expect(clampHeroPhotoFrame({ zoom: 9, x: -4, y: Number.NaN })).toEqual({ zoom: 3, x: -1, y: 0 });
    expect(clampHeroPhotoFrame({ zoom: 0.2, x: 0.3, y: 0.3 }).zoom).toBe(1);
  });

  it('reads only well-formed stored frames', () => {
    expect(parseHeroPhotoFrame(null)).toBeNull();
    expect(parseHeroPhotoFrame({ zoom: '2', x: 0, y: 0 })).toBeNull();
    expect(parseHeroPhotoFrame({ zoom: 1.5, x: 0.2, y: -0.4 })).toEqual({ zoom: 1.5, x: 0.2, y: -0.4 });
  });

  it('treats a centred, unzoomed frame as no frame', () => {
    expect(isDefaultHeroPhotoFrame(null)).toBe(true);
    expect(isDefaultHeroPhotoFrame({ zoom: 1, x: 0, y: 0 })).toBe(true);
    expect(isDefaultHeroPhotoFrame({ zoom: 1, x: 0.2, y: 0 })).toBe(false);
  });

  it('hands the heroes only the photos that were actually moved, by URL', () => {
    expect(heroPhotoFramesOf([
      { image_url: 'a', aspect_ratio: 0.8, hero_frame: { zoom: 1.4, x: 0, y: -0.5 } },
      { image_url: 'b', aspect_ratio: 1, hero_frame: null },
      { image_url: 'c', aspect_ratio: 1, hero_frame: { zoom: 1, x: 0, y: 0 } },
    ])).toEqual({ a: { aspectRatio: 0.8, frame: { zoom: 1.4, x: 0, y: -0.5 } } });
  });
});

describe('hero photo slot shapes', () => {
  it('gives Pinboard three side-by-side pins of uneven height', () => {
    const shapes = [0, 1, 2].map(i => heroPhotoSlotAspect('pinboardHeader', i, 3));
    expect(new Set(shapes).size).toBe(3);
    shapes.forEach(shape => expect(shape).toBeLessThan(1));
    // One photo spans the width.
    expect(heroPhotoSlotAspect('pinboardHeader', 0, 1)).toBeGreaterThan(2);
  });
});
