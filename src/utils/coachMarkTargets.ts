// Pure geometry/selection rules behind the coach-mark tours. Kept out of
// CoachMarkTour.tsx / ExploreScreen.tsx so they're testable without dragging
// in the whole render tree, and so the "which card does the tour point at"
// rule is discoverable rather than buried in a render callback.

export type TargetRect = { x: number; y: number; width: number; height: number };
export type ScreenSize = { width: number; height: number };

// A target only counts as spotlightable if most of it is actually inside the
// viewport. measureInWindow happily returns coordinates for something
// scrolled off the bottom of a list — spotlighting that would put both the
// cutout and its caption card somewhere nobody can see.
//
// This is an OVERLAP test, not a "is the top edge on screen" test, on
// purpose: the client/provider home tours target the floating tab bar via a
// precomputed rect that starts at `screenH - 80`, which any naive
// top-edge-based bounds check would reject even though the bar is fully
// visible.
export const MIN_VISIBLE_FRACTION = 0.6;

export const isTargetOnScreen = (r: TargetRect, screen: ScreenSize): boolean => {
  if (r.width <= 0 || r.height <= 0) return false;
  const visibleH = Math.min(r.y + r.height, screen.height) - Math.max(r.y, 0);
  const visibleW = Math.min(r.x + r.width, screen.width) - Math.max(r.x, 0);
  return visibleH >= r.height * MIN_VISIBLE_FRACTION && visibleW >= r.width * MIN_VISIBLE_FRACTION;
};

// How far into the feed the Explore tour will look for a card to point at.
// Anything past this is likely below the fold on first paint, and
// isTargetOnScreen would reject it anyway.
export const TOUR_SCAN_DEPTH = 6;

/**
 * Picks the single Explore card the first-visit tour spotlights.
 *
 * Prefers a card carrying a price, because that one card can serve BOTH the
 * "tap the heart to save" and the "a price means you can book this exact
 * service" steps — the two targets stay on the same tile, so the spotlight
 * barely moves between them. When the top of the feed happens to be all
 * portfolio photos (no price), the first card still anchors the heart step
 * and the price step drops itself, since CoachMarkTour skips any target it
 * can't measure on screen.
 */
export const pickTourCardId = (
  items: readonly { id: string; price?: string | undefined }[],
  depth: number = TOUR_SCAN_DEPTH
): string | null => {
  const head = items.slice(0, depth);
  return (head.find(i => i.price) ?? head[0])?.id ?? null;
};
