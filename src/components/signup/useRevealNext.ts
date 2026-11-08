// src/components/signup/useRevealNext.ts
//
// The gentle "move on" after a single-pick answer in sign-up (user,
// 2026-11-08: "auth scroll should still work but not too drastic").
//
// Picking an answer used to snap the next question to the top of the screen,
// which threw the card being answered off screen. Now the page only moves
// when the next question is still below the visible area, and only by the
// minimum that brings the top of its card into view near the bottom. Callers
// use it for single-pick questions only, never multi-pick toggles, and call
// it from the tap handler, never from inside a state updater.
import { useCallback, useRef, type RefObject } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollViewInstance } from 'react-native';

/** How much of the next card to bring into view: its label, prompt and first row of chips. */
export const REVEAL_PEEK = 150;
/** Room left under the revealed part, so it doesn't sit flush against the screen edge. */
export const REVEAL_BOTTOM_GAP = 16;

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
  return target > scrollY ? target : null;
}

export function useRevealNext(scrollRef: RefObject<ScrollViewInstance | null>) {
  const scrollY = useRef(0);
  const viewportHeight = useRef(0);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
  }, []);

  const onViewportLayout = useCallback((e: LayoutChangeEvent) => {
    viewportHeight.current = e.nativeEvent.layout.height;
  }, []);

  const reveal = useCallback((next: CardLayout) => {
    const y = revealOffset({ scrollY: scrollY.current, viewportHeight: viewportHeight.current, next });
    if (y !== null) scrollRef.current?.scrollTo({ y, animated: true });
  }, [scrollRef]);

  return { onScroll, onViewportLayout, reveal };
}
