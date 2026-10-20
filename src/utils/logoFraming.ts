import type { LogoCardFrame, LogoCardSlot } from '../types/database';

/** The two Home card shapes, copied from HomeScreen's `brandCardBlur`
 *  (small) and `providerBlur` (large). If those change, change these too, or
 *  the framer frames a shape clients never see. */
export const LOGO_CARD_SIZES: Record<LogoCardSlot, { width: number; height: number; radius: number }> = {
  small: { width: 160, height: 70, radius: 12 },
  large: { width: 282, height: 147, radius: 16 },
};

/** Fills the card and centres the logo: how a card looks with no framing. */
export const DEFAULT_LOGO_FRAME: LogoCardFrame = { zoom: 1, x: 0, y: 0 };

/** How far in a provider can pinch, relative to just filling the card. */
export const MAX_LOGO_ZOOM = 4;

/** The smallest zoom: the whole logo fits inside the card, with the card's
 *  background showing either side (or above and below). */
export function minLogoZoom(cardRatio: number, imageRatio: number): number {
  'worklet';
  if (!(cardRatio > 0) || !(imageRatio > 0)) return 1;
  return Math.min(cardRatio / imageRatio, imageRatio / cardRatio);
}

/** Where to draw the logo inside a card of `width` × `height`, in points. */
export function logoFrameLayout(
  width: number,
  height: number,
  imageRatio: number,
  frame: LogoCardFrame,
): { width: number; height: number; left: number; top: number } {
  'worklet';
  const ratio = imageRatio > 0 ? imageRatio : 1;
  // The size at which the logo just covers the card (zoom 1).
  const fillsHeight = ratio > width / height;
  const coverW = fillsHeight ? height * ratio : width;
  const coverH = fillsHeight ? height : width / ratio;
  const w = coverW * frame.zoom;
  const h = coverH * frame.zoom;
  return {
    width: w,
    height: h,
    left: (width - w) / 2 + frame.x * width,
    top: (height - h) / 2 + frame.y * height,
  };
}

/** Keeps a frame usable: zoom between "whole logo" and MAX_LOGO_ZOOM, and the
 *  logo positioned so a card bigger than it shows no gap past its edges, while
 *  a logo smaller than the card stays wholly inside it. */
export function clampLogoFrame(
  frame: LogoCardFrame,
  cardRatio: number,
  imageRatio: number,
): LogoCardFrame {
  'worklet';
  const zoom = Math.min(MAX_LOGO_ZOOM, Math.max(minLogoZoom(cardRatio, imageRatio), frame.zoom));
  // Measured on a card 1 tall, so x and y come out as fractions directly.
  const box = logoFrameLayout(cardRatio, 1, imageRatio, { zoom, x: 0, y: 0 });
  const maxX = Math.abs(box.width - cardRatio) / 2 / cardRatio;
  const maxY = Math.abs(box.height - 1) / 2;
  return {
    zoom,
    x: Math.min(maxX, Math.max(-maxX, frame.x)),
    y: Math.min(maxY, Math.max(-maxY, frame.y)),
  };
}
