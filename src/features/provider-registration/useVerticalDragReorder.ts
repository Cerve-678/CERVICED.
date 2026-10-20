import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  PanResponder,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';

/** Press-and-hold before a drag engages, matching the category strip and the
 *  service-image carousel so every reorder in the app feels the same. */
const DRAG_HOLD_MS = 220;
/** Finger movement tolerated while waiting to arm. Past this it's a scroll. */
const HOLD_SLOP = 6;

type RowLayout = { y: number; height: number };

/**
 * The order a drag would leave, with the carried row SWAPPED with the row
 * it's over: the two exchange places and every other row stays put. (It used
 * to insert instead, which pushed every row in between up or down by one —
 * not what a provider expects from dropping one service onto another.)
 *
 * The row "under" the carried one is whichever row's centre is nearest the
 * carried row's centre, the carried row's own slot included, so hovering at
 * home swaps nothing.
 */
export function swapOrderForDrag(
  order: string[],
  layouts: Record<string, RowLayout>,
  key: string,
  dy: number,
): string[] {
  const carried = layouts[key];
  const from = order.indexOf(key);
  if (!carried || from === -1) return order;
  const centre = carried.y + dy + carried.height / 2;
  let target = from;
  let best = Infinity;
  order.forEach((k, i) => {
    const row = layouts[k];
    if (!row) return;
    const distance = Math.abs(centre - (row.y + row.height / 2));
    if (distance < best) {
      best = distance;
      target = i;
    }
  });
  if (target === from) return order;
  const next = [...order];
  next[from] = order[target]!;
  next[target] = key;
  return next;
}

interface Options {
  /** Stable ids, in current display order. */
  keys: string[];
  /** Commit a finished drag. Receives the full reordered key list. */
  onReorder: (nextKeys: string[]) => void;
}

/**
 * Drag-to-reorder for a vertical list living inside a scrolling screen.
 *
 * Two things make this work where a naive PanResponder doesn't:
 *
 * 1. **The responder is per row and claims on touch-down**, then *grants
 *    termination back* to the enclosing ScrollView whenever it asks — which is
 *    exactly what a scroll flick looks like — and refuses only once the hold
 *    has armed. A responder attached to the ScrollView itself is never asked;
 *    its own recognizer claims the gesture on first movement.
 *
 * 2. **Slot maths runs against the order frozen at grant time**, not the live
 *    one. The live order is what this hook rewrites on every swap, so walking
 *    it means walking a list whose recorded y values no longer ascend with it,
 *    and the target index starts jumping around after the first swap. Freezing
 *    it makes the result a pure function of finger position: the same place
 *    always yields the same order, whatever path got you there.
 *
 * A drop SWAPS the carried row with the one under it (see swapOrderForDrag).
 */
export function useVerticalDragReorder({ keys, onReorder }: Options) {
  const [liveKeys, setLiveKeys] = useState<string[] | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);

  const dragY = useRef(new Animated.Value(0)).current;
  const layoutRef = useRef<Record<string, { y: number; height: number }>>({});
  const baselineLayoutRef = useRef<Record<string, { y: number; height: number }>>({});
  const baselineOrderRef = useRef<string[]>([]);
  const liveKeysRef = useRef<string[]>(keys);
  const targetIndexRef = useRef<number>(0);
  const draggingKeyRef = useRef<string | null>(null);
  const armedRef = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only tracks the incoming order while nothing is being carried — mid-drag
  // this hook is the author of the order, and letting the prop stomp it would
  // undo each swap as it happened.
  if (!draggingKeyRef.current) liveKeysRef.current = keys;

  const onItemLayout = useCallback(
    (key: string) => (event: LayoutChangeEvent) => {
      const { y, height } = event.nativeEvent.layout;
      layoutRef.current[key] = { y, height };
    },
    [],
  );

  const clearHold = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  const endDrag = useCallback(() => {
    armedRef.current = false;
    draggingKeyRef.current = null;
    dragY.setValue(0);
    setDraggingKey(null);
    setLiveKeys(null);
  }, [dragY]);

  const applyPosition = useCallback(
    (key: string, dy: number) => {
      dragY.setValue(dy);
      const next = swapOrderForDrag(baselineOrderRef.current, baselineLayoutRef.current, key, dy);
      const target = next.indexOf(key);
      if (target !== targetIndexRef.current) {
        targetIndexRef.current = target;
        liveKeysRef.current = next;
        setLiveKeys(next);
        Haptics.selectionAsync().catch(() => {});
      }
    },
    [dragY],
  );

  const makeResponder = useCallback(
    (key: string) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          clearHold();
          holdTimer.current = setTimeout(() => {
            holdTimer.current = null;
            // Freeze both the geometry and the order it was measured in.
            baselineLayoutRef.current = { ...layoutRef.current };
            baselineOrderRef.current = [...liveKeysRef.current];
            targetIndexRef.current = baselineOrderRef.current.indexOf(key);
            armedRef.current = true;
            draggingKeyRef.current = key;
            dragY.setValue(0);
            setDraggingKey(key);
            setLiveKeys([...liveKeysRef.current]);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
              () => {},
            );
          }, DRAG_HOLD_MS);
        },
        // Letting the ScrollView take over is what keeps the page scrollable;
        // refusing once armed is what makes the drag stick.
        onPanResponderTerminationRequest: () => {
          if (armedRef.current) return false;
          clearHold();
          return true;
        },
        onPanResponderMove: (_evt, gesture) => {
          if (!armedRef.current) {
            if (
              Math.abs(gesture.dy) > HOLD_SLOP ||
              Math.abs(gesture.dx) > HOLD_SLOP
            ) {
              clearHold();
            }
            return;
          }
          applyPosition(key, gesture.dy);
        },
        onPanResponderRelease: () => {
          clearHold();
          const wasArmed = armedRef.current;
          const finalOrder = [...liveKeysRef.current];
          endDrag();
          if (wasArmed) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
              () => {},
            );
            onReorder(finalOrder);
          }
        },
        onPanResponderTerminate: () => {
          clearHold();
          endDrag();
        },
      }),
    [applyPosition, clearHold, dragY, endDrag, onReorder],
  );

  // One responder per row, rebuilt only when the set of rows changes — a fresh
  // one on every render would swap handlers out from under a live gesture, and
  // a drag re-renders on every slot it crosses.
  const responders = useMemo(() => {
    const map: Record<string, ReturnType<typeof PanResponder.create>> = {};
    for (const key of keys) map[key] = makeResponder(key);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join('\0'), makeResponder]);

  // While a drag is live, rows are RENDERED in the frozen baseline order and
  // moved purely by transform. Rendering them in the live order instead would
  // move each row twice — once because layout reflowed it into its new slot,
  // and again by the shift transform below — and would also yank the carried
  // row's own base position out from under the translateY tracking the finger.
  // Layout changes exactly once, on release, when every transform is back to
  // zero and there is nothing left to jump.
  const orderedKeys = draggingKey ? baselineOrderRef.current : keys;
  // liveKeys isn't rendered directly, but it has to be state rather than a ref
  // so a swap re-renders and getItemStyle recomputes the shifts.
  const logicalOrder = liveKeys ?? keys;

  /** Where a row sits right now: the carried one follows the finger, and the
   *  one it's over slides into the carried row's old slot — the swap it'll
   *  drop as. Every other row stays still. */
  const getItemStyle = useCallback(
    (key: string): Animated.WithAnimatedObject<ViewStyle> => {
      if (!draggingKey) return {};
      if (key === draggingKey) {
        return {
          transform: [{ translateY: dragY }, { scale: 1.02 }],
          zIndex: 20,
          // Elevation is Android's z-order; zIndex alone doesn't lift it.
          elevation: 8,
          opacity: 0.97,
        };
      }
      const from = baselineOrderRef.current.indexOf(key);
      const to = logicalOrder.indexOf(key);
      if (from === -1 || to === -1 || from === to) return {};
      // Only the swapped row moves, straight into the carried row's measured
      // slot — measured positions, so card spacing is included exactly.
      const carried = baselineLayoutRef.current[draggingKey];
      const own = baselineLayoutRef.current[key];
      if (!carried || !own) return {};
      return { transform: [{ translateY: carried.y - own.y }] };
    },
    [draggingKey, dragY, logicalOrder],
  );

  return {
    /** Rows in the order to render right now — live order during a drag. */
    orderedKeys,
    draggingKey,
    getHandlers: (key: string) => responders[key]?.panHandlers ?? {},
    getItemStyle,
    onItemLayout,
  };
}
