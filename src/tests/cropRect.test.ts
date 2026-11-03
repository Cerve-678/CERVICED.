import { fitContain, MIN_CROP_POINTS, moveCrop, moveHandle, toImageCrop } from '../utils/cropRect';

const photo = { x: 50, y: 0, width: 200, height: 600 };
const image = { width: 1000, height: 3000 };

describe('fitContain', () => {
  it('fits a full-length photo whole, centred', () => {
    expect(fitContain(image, { width: 300, height: 600 })).toEqual(photo);
  });

  it('is empty until the photo and the space are known', () => {
    expect(fitContain({ width: 0, height: 0 }, { width: 300, height: 600 }).width).toBe(0);
    expect(fitContain(image, { width: 0, height: 0 }).width).toBe(0);
  });
});

describe('moveHandle', () => {
  it('moves only the sides that handle owns', () => {
    expect(moveHandle(photo, 'top', 30, 100, photo)).toEqual({ x: 50, y: 100, width: 200, height: 500 });
    expect(moveHandle(photo, 'left', 20, 100, photo)).toEqual({ x: 70, y: 0, width: 180, height: 600 });
    expect(moveHandle(photo, 'bottomRight', -20, -100, photo)).toEqual({ x: 50, y: 0, width: 180, height: 500 });
  });

  it('never leaves the photo', () => {
    expect(moveHandle(photo, 'topLeft', -500, -500, photo)).toEqual(photo);
    expect(moveHandle(photo, 'bottomRight', 500, 500, photo)).toEqual(photo);
  });

  it('never goes below the minimum size', () => {
    const squeezed = moveHandle(photo, 'bottomRight', -5000, -5000, photo);
    expect(squeezed.width).toBe(MIN_CROP_POINTS);
    expect(squeezed.height).toBe(MIN_CROP_POINTS);
  });
});

describe('moveCrop', () => {
  it('slides inside the photo at the same size', () => {
    const crop = { x: 100, y: 100, width: 100, height: 100 };
    expect(moveCrop(crop, 20, 30, photo)).toEqual({ x: 120, y: 130, width: 100, height: 100 });
    expect(moveCrop(crop, -500, 5000, photo)).toEqual({ x: 50, y: 500, width: 100, height: 100 });
  });
});

describe('toImageCrop', () => {
  it('is null for the whole photo, so the original uploads untouched', () => {
    expect(toImageCrop(photo, photo, image)).toBeNull();
  });

  it('converts to the photo pixels', () => {
    expect(toImageCrop({ x: 60, y: 100, width: 100, height: 200 }, photo, image))
      .toEqual({ originX: 50, originY: 500, width: 500, height: 1000 });
  });

  it('stays inside the photo despite rounding', () => {
    const c = toImageCrop({ x: 50.3, y: 0.3, width: 199.7, height: 599.7 }, photo, image)!;
    expect(c.originX + c.width).toBeLessThanOrEqual(image.width);
    expect(c.originY + c.height).toBeLessThanOrEqual(image.height);
  });
});
