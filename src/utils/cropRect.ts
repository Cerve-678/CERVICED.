// The geometry behind ImageCropModal. Everything is in the modal's on-screen
// points except toImageCrop, which converts to the photo's own pixels.

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export type CropHandle = 'top' | 'bottom' | 'left' | 'right' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

export const CROP_HANDLES: CropHandle[] = ['top', 'bottom', 'left', 'right', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight'];

export const MIN_CROP_POINTS = 60;

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), Math.max(min, max));

/** Where a photo sits when fitted whole inside a container, centred. */
export function fitContain(image: Size, container: Size): CropRect {
  if (image.width <= 0 || image.height <= 0 || container.width <= 0 || container.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const scale = Math.min(container.width / image.width, container.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return { x: (container.width - width) / 2, y: (container.height - height) / 2, width, height };
}

/** Drags one handle, keeping the crop inside the photo and above the minimum size. */
export function moveHandle(start: CropRect, handle: CropHandle, dx: number, dy: number, photo: CropRect): CropRect {
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;

  if (handle === 'left' || handle === 'topLeft' || handle === 'bottomLeft') {
    left = clamp(left + dx, photo.x, right - MIN_CROP_POINTS);
  }
  if (handle === 'right' || handle === 'topRight' || handle === 'bottomRight') {
    right = clamp(right + dx, left + MIN_CROP_POINTS, photo.x + photo.width);
  }
  if (handle === 'top' || handle === 'topLeft' || handle === 'topRight') {
    top = clamp(top + dy, photo.y, bottom - MIN_CROP_POINTS);
  }
  if (handle === 'bottom' || handle === 'bottomLeft' || handle === 'bottomRight') {
    bottom = clamp(bottom + dy, top + MIN_CROP_POINTS, photo.y + photo.height);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Slides the whole crop, keeping its size and keeping it inside the photo. */
export function moveCrop(start: CropRect, dx: number, dy: number, photo: CropRect): CropRect {
  return {
    ...start,
    x: clamp(start.x + dx, photo.x, photo.x + photo.width - start.width),
    y: clamp(start.y + dy, photo.y, photo.y + photo.height - start.height),
  };
}

/** The crop in the photo's pixels, or null when it still covers the whole photo. */
export function toImageCrop(
  crop: CropRect,
  photo: CropRect,
  image: Size,
): { originX: number; originY: number; width: number; height: number } | null {
  if (photo.width <= 0 || photo.height <= 0) return null;
  const scale = image.width / photo.width;
  const originX = clamp(Math.round((crop.x - photo.x) * scale), 0, image.width - 1);
  const originY = clamp(Math.round((crop.y - photo.y) * scale), 0, image.height - 1);
  const width = clamp(Math.round(crop.width * scale), 1, image.width - originX);
  const height = clamp(Math.round(crop.height * scale), 1, image.height - originY);
  if (originX === 0 && originY === 0 && width === image.width && height === image.height) return null;
  return { originX, originY, width, height };
}

// ── Zoom ─────────────────────────────────────────────────────────────────────
// Pinching zooms the photo under the crop. The photo's on-screen rect (the
// "view") grows from its fitted size, and the crop is kept inside the part of
// the photo that's still on screen.

/** How far in a pinch can go, as a multiple of the fitted photo. */
export const MAX_ZOOM = 5;

export interface Point {
  x: number;
  y: number;
}

/**
 * Keeps a zoomed photo where it belongs: centred along any side where it's
 * smaller than the container, and covering the container (no gap at an edge)
 * along any side where it's bigger.
 */
export function clampView(view: CropRect, container: Size): CropRect {
  const axis = (start: number, length: number, room: number) =>
    length <= room ? (room - length) / 2 : clamp(start, room - length, 0);
  return { ...view, x: axis(view.x, view.width, container.width), y: axis(view.y, view.height, container.height) };
}

/**
 * The photo after a pinch: scaled by how far the fingers have spread, around
 * the point between them, and moved with that point. Never smaller than the
 * fitted photo or larger than MAX_ZOOM times it.
 */
export function pinchView(
  start: CropRect,
  fit: CropRect,
  container: Size,
  from: { focal: Point; distance: number },
  to: { focal: Point; distance: number },
): CropRect {
  if (start.width <= 0 || fit.width <= 0 || from.distance <= 0) return start;
  const width = clamp(start.width * (to.distance / from.distance), fit.width, fit.width * MAX_ZOOM);
  const scale = width / start.width;
  return clampView(
    {
      x: to.focal.x - (from.focal.x - start.x) * scale,
      y: to.focal.y - (from.focal.y - start.y) * scale,
      width,
      height: start.height * scale,
    },
    container,
  );
}

/** The part of the photo that's on screen: the view cut to the container. */
export function visiblePhoto(view: CropRect, container: Size): CropRect {
  const left = Math.max(view.x, 0);
  const top = Math.max(view.y, 0);
  const right = Math.min(view.x + view.width, container.width);
  const bottom = Math.min(view.y + view.height, container.height);
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/** The crop moved and, if it has to be, shrunk so it sits inside the bounds. */
export function fitCropInside(crop: CropRect, bounds: CropRect): CropRect {
  const width = Math.min(crop.width, bounds.width);
  const height = Math.min(crop.height, bounds.height);
  return {
    x: clamp(crop.x, bounds.x, bounds.x + bounds.width - width),
    y: clamp(crop.y, bounds.y, bounds.y + bounds.height - height),
    width,
    height,
  };
}
