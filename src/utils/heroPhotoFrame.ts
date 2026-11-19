// How a portfolio photo sits in a page style's hero slot
// (portfolio_items.hero_frame; types/database HeroPhotoFrame).
//
// The photo always covers its slot. `zoom` scales it up from "just covers"
// (1) to MAX_HERO_PHOTO_ZOOM. `x`/`y` are fractions of how far it can move
// in the slot (-1 shows its left/top edge, 1 its right/bottom, 0 centred).
// That keeps one frame meaningful across every style's slot shape, since the
// picks are shared between styles.

import type { HeroPhotoFrame } from '../types/database';

export const DEFAULT_HERO_PHOTO_FRAME: HeroPhotoFrame = { zoom: 1, x: 0, y: 0 };
export const MAX_HERO_PHOTO_ZOOM = 3;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));

/** Keeps a frame inside what the database accepts (portfolio_items_hero_frame_check). */
export function clampHeroPhotoFrame(frame: HeroPhotoFrame): HeroPhotoFrame {
  return {
    zoom: clamp(Number.isFinite(frame.zoom) ? frame.zoom : 1, 1, MAX_HERO_PHOTO_ZOOM),
    x: clamp(frame.x, -1, 1),
    y: clamp(frame.y, -1, 1),
  };
}

/** True when the frame draws the photo as it was before framing existed. */
export function isDefaultHeroPhotoFrame(frame: HeroPhotoFrame | null | undefined): boolean {
  if (!frame) return true;
  return Math.abs(frame.zoom - 1) < 0.005 && Math.abs(frame.x) < 0.005 && Math.abs(frame.y) < 0.005;
}

/** A stored frame, or null for anything that isn't one (old rows, bad data). */
export function parseHeroPhotoFrame(value: unknown): HeroPhotoFrame | null {
  if (!value || typeof value !== 'object') return null;
  const { zoom, x, y } = value as Record<string, unknown>;
  if (typeof zoom !== 'number' || typeof x !== 'number' || typeof y !== 'number') return null;
  return clampHeroPhotoFrame({ zoom, x, y });
}

/** The photo's size at zoom 1: just covering a `width` × `height` slot. */
function coverSize(width: number, height: number, imageRatio: number): { width: number; height: number } {
  const ratio = imageRatio > 0 ? imageRatio : 1;
  return ratio > width / height
    ? { width: height * ratio, height }
    : { width, height: width / ratio };
}

/** Where to draw the photo inside its slot, in points. */
export function heroPhotoLayout(
  width: number,
  height: number,
  imageRatio: number,
  frame: HeroPhotoFrame,
): { width: number; height: number; left: number; top: number } {
  const { zoom, x, y } = clampHeroPhotoFrame(frame);
  const cover = coverSize(width, height, imageRatio);
  const w = cover.width * zoom;
  const h = cover.height * zoom;
  // Half the overflow each way; x/y slide across it.
  const spareX = (w - width) / 2;
  const spareY = (h - height) / 2;
  return { width: w, height: h, left: -spareX + x * spareX, top: -spareY + y * spareY };
}

/** The frame after a finger moves the photo `dx`, `dy` points in the slot. */
export function panHeroPhotoFrame(
  frame: HeroPhotoFrame,
  dx: number,
  dy: number,
  width: number,
  height: number,
  imageRatio: number,
): HeroPhotoFrame {
  const box = heroPhotoLayout(width, height, imageRatio, frame);
  const spareX = (box.width - width) / 2;
  const spareY = (box.height - height) / 2;
  return clampHeroPhotoFrame({
    zoom: frame.zoom,
    // Dragging right shows more of the left: the photo's left edge moves right.
    x: spareX > 0.5 ? frame.x + dx / spareX : frame.x,
    y: spareY > 0.5 ? frame.y + dy / spareY : frame.y,
  });
}
