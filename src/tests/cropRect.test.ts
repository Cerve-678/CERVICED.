import { fitContain, fitCropInside, MAX_ZOOM, MIN_CROP_POINTS, moveCrop, moveHandle, pinchView, toImageCrop, visiblePhoto } from '../utils/cropRect';

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

describe('pinch zoom', () => {
  // A 300×600 area holding a square photo fitted to 300×300, centred.
  const area = { width: 300, height: 600 };
  const fit = { x: 0, y: 150, width: 300, height: 300 };
  const centre = { x: 150, y: 300 };

  it('zooms around the point between the fingers', () => {
    const view = pinchView(fit, fit, area, { focal: centre, distance: 100 }, { focal: centre, distance: 200 });
    expect(view).toEqual({ x: -150, y: 0, width: 600, height: 600 });
  });

  it("won't zoom out past the fitted photo or in past the limit", () => {
    expect(pinchView(fit, fit, area, { focal: centre, distance: 200 }, { focal: centre, distance: 50 })).toEqual(fit);
    const far = pinchView(fit, fit, area, { focal: centre, distance: 10 }, { focal: centre, distance: 1000 });
    expect(far.width).toBe(300 * MAX_ZOOM);
  });

  it('moves with the fingers but never leaves a gap at an edge', () => {
    const zoomed = { x: -150, y: 0, width: 600, height: 600 };
    const moved = pinchView(zoomed, fit, area, { focal: centre, distance: 100 }, { focal: { x: 400, y: 300 }, distance: 100 });
    expect(moved.x).toBe(0);
  });

  it('keeps the crop on the part of the photo still on screen', () => {
    const zoomed = { x: -150, y: 0, width: 600, height: 600 };
    expect(visiblePhoto(zoomed, area)).toEqual({ x: 0, y: 0, width: 300, height: 600 });
    expect(fitCropInside({ x: 250, y: 500, width: 100, height: 200 }, { x: 0, y: 0, width: 300, height: 600 }))
      .toEqual({ x: 200, y: 400, width: 100, height: 200 });
  });

  it('crops the zoomed-in part of the photo in its own pixels', () => {
    const zoomed = { x: -150, y: 0, width: 600, height: 600 };
    // The middle quarter of a 1000×1000 photo fills a 150-point crop at 2×.
    expect(toImageCrop({ x: 75, y: 225, width: 150, height: 150 }, zoomed, { width: 1000, height: 1000 }))
      .toEqual({ originX: 375, originY: 375, width: 250, height: 250 });
  });
});
