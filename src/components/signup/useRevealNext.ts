// src/components/signup/useRevealNext.ts
//
// The gentle "move on" after a single-pick answer in sign-up (user,
// 2026-11-08: "auth scroll should still work but not too drastic", then
// "slightly slower ... it was too big of a jump").
//
// Picking an answer used to snap the next question to the top of the screen,
// which threw the card being answered off screen. Now the page only moves
// when the next question is still below the visible area, only far enough
// to bring its heading and prompt into view near the bottom, never more than
// REVEAL_MAX_STEP in one go, and as a slow glide rather than the native quick
// scroll. Touching the page stops the glide. Callers use it for single-pick
// questions only, never multi-pick toggles, and call it from the tap handler,
// never from inside a state updater.
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollViewInstance } from 'react-native';

/** How much of the next card to bring into view: its label and prompt. */
export const REVEAL_PEEK = 96;
/** Room left under the revealed part, so it doesn't sit flush against the screen edge. */
export const REVEAL_BOTTOM_GAP = 16;
/** The furthest one answer moves the page, so it never reads as a jump. */
export const REVEAL_MAX_STEP = 200;
/** How long the glide takes. The native animated scroll is noticeably quicker. */
export const REVEAL_DURATION_MS = 550;

export interface CardLayout { y: number; height: number }

/**
 * The scroll offset that brings the next card into view, or null when it is
 * already visible enough and the page should stay where it is.
 */
export function revealOffset(
  { scrollY, viewportHeight, next }: { scrollY: number; viewportHeight: number; next: CardLayout },
): number | null {
  if (viewportHeight <= 0 || next.height <= 0) return null;
  const shown = Math.min(next.height, REVEAL_PEEK);
  const target = next.y + shown + REVEAL_BOTTOM_GAP - viewportHeight;
  if (target <= scrollY) return null;
  return Math.min(target, scrollY + REVEAL_MAX_STEP);
}

/** Ease in and out, so the page starts and settles softly. 0..1 → 0..1. */
export function revealEase(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

export function useRevealNext(scrollRef: RefObject<ScrollViewInstance | null>) {
  const scrollY = useRef(0);
  const viewportHeight = useRef(0);
  const frame = useRef<number | null>(null);

  const stopGlide = useCallback(() => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
  }, []);

  useEffect(() => stopGlide, [stopGlide]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
  }, []);

  const onViewportLayout = useCallback((e: LayoutChangeEvent) => {
    viewportHeight.current = e.nativeEvent.layout.height;
  }, []);

  const reveal = useCallback((next: CardLayout) => {
    const to = revealOffset({ scrollY: scrollY.current, viewportHeight: viewportHeight.current, next });
    if (to === null) return;
    stopGlide();
    const from = scrollY.current;
    let start: number | null = null;
    const step = (now: number) => {
      if (start === null) start = now;
      const t = (now - start) / REVEAL_DURATION_MS;
      scrollRef.current?.scrollTo({ y: from + (to - from) * revealEase(t), animated: false });
      frame.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    frame.current = requestAnimationFrame(step);
  }, [scrollRef, stopGlide]);

  // Wire to the ScrollView's onScrollBeginDrag: a finger on the page wins.
  return { onScroll, onViewportLayout, onScrollBeginDrag: stopGlide, reveal };
}
