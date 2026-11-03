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
