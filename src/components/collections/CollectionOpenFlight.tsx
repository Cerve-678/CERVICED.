import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import type { ViewInstance } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import type { FolderPaperRect } from './CollectionFolder';

/**
 * "Looks fly out" (chosen 2026-11-09): when a folder opens, the looks
 * sticking out of it fly into their places in the open collection's grid.
 *
 * Three parts:
 *   - CollectionFolder reports where its looks are when tapped (window coords).
 *   - CollectionFlightTarget wraps the first few grid cards. It measures where
 *     each card landed and keeps the card hidden until its look arrives.
 *   - CollectionOpenFlight draws copies of the looks above the screen and
 *     moves each from its folder spot to its card, straightening as it goes.
 *
 * If a card never reports its position (not loaded yet, or scrolled away), that
 * look fades out where it is instead.
 */

export interface FlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const FLIGHT_MS = 520;
const STAGGER_MS = 60;
// Long enough for the grid to lay out after the data swaps.
const WAIT_FOR_TARGETS_MS = 450;
const ARC_LIFT = 40;

interface CollectionFlightTargetProps {
  index: number;
  /** A look is flying to this card: hide it and report where it is. */
  active: boolean;
  onMeasured: (index: number, rect: FlightRect) => void;
  children: React.ReactNode;
}

/**
 * Wraps every grid card, active or not. Adding and removing the wrapper
 * would remount the card and replay its fade-in just as its look lands.
 */
export function CollectionFlightTarget({ index, active, onMeasured, children }: CollectionFlightTargetProps) {
  const ref = useRef<ViewInstance>(null);
  const measure = useCallback(() => {
    // The layout callback fires before the card is in its final place on
    // screen; one frame later, it is.
    requestAnimationFrame(() => {
      ref.current?.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) onMeasured(index, { x, y, width, height });
      });
    });
  }, [index, onMeasured]);
  // A card that was already on screen in the same place won't lay out again.
  useEffect(() => {
    if (active) measure();
  }, [active, measure]);
  return (
    <View
      ref={ref}
      collapsable={false}
      onLayout={active ? measure : undefined}
      style={active ? styles.hidden : undefined}
    >
      {children}
    </View>
  );
}

interface CollectionOpenFlightProps {
  /** Newest first; paper k flies to grid card k. */
  papers: FolderPaperRect[];
  targets: (FlightRect | null)[];
  onLanded: () => void;
}

export function CollectionOpenFlight({ papers, targets, onLanded }: CollectionOpenFlightProps) {
  const overlayRef = useRef<ViewInstance>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [launched, setLaunched] = useState<(FlightRect | null)[] | null>(null);
  const progress = useRef(papers.map(() => new Animated.Value(0))).current;

  const allMeasured = targets.length > 0 && targets.every(t => t !== null);

  // Launch once every card has reported, or after a short wait, using
  // whatever has reported by then.
  useEffect(() => {
    if (launched || !origin) return;
    if (allMeasured) { setLaunched(targets); return; }
    const timer = setTimeout(() => setLaunched(targets), WAIT_FOR_TARGETS_MS);
    return () => clearTimeout(timer);
  }, [allMeasured, launched, origin, targets]);

  useEffect(() => {
    if (!launched) return;
    Animated.stagger(
      STAGGER_MS,
      progress.map(value =>
        Animated.timing(value, {
          toValue: 1,
          duration: FLIGHT_MS,
          easing: Easing.bezier(0.3, 0.7, 0.2, 1),
          // Width, height and corner radius change, which the native driver can't animate.
          useNativeDriver: false,
        }),
      ),
    ).start(() => {
      Haptics.selectionAsync().catch(() => {});
      onLanded();
    });
  }, [launched]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View
      ref={overlayRef}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={() => overlayRef.current?.measureInWindow((x, y) => setOrigin({ x, y }))}
    >
      {origin && papers.map((paper, k) => {
        const p = progress[k];
        if (!p) return null;
        const from = { x: paper.x - origin.x, y: paper.y - origin.y, width: paper.width, height: paper.height };
        const target = launched?.[k] ?? null;
        const to = target
          ? { x: target.x - origin.x, y: target.y - origin.y, width: target.width, height: target.height }
          : null;
        const midY = to ? Math.min(from.y, to.y) + (Math.abs(to.y - from.y) / 2) - ARC_LIFT : from.y;
        return (
          <Animated.View
            key={paper.id}
            style={[
              styles.fly,
              to
                ? {
                    left: p.interpolate({ inputRange: [0, 1], outputRange: [from.x, to.x] }),
                    top: p.interpolate({ inputRange: [0, 0.45, 1], outputRange: [from.y, midY, to.y] }),
                    width: p.interpolate({ inputRange: [0, 1], outputRange: [from.width, to.width] }),
                    height: p.interpolate({ inputRange: [0, 1], outputRange: [from.height, to.height] }),
                    borderRadius: p.interpolate({ inputRange: [0, 1], outputRange: [10, 12] }),
                    borderWidth: p.interpolate({ inputRange: [0, 1], outputRange: [3, 0] }),
                    transform: [{ rotate: p.interpolate({ inputRange: [0, 1], outputRange: [`${paper.rotate}deg`, '0deg'] }) }],
                  }
                : {
                    left: from.x,
                    top: from.y,
                    width: from.width,
                    height: from.height,
                    opacity: p.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0], extrapolate: 'clamp' }),
                    transform: [{ rotate: `${paper.rotate}deg` }],
                  },
            ]}
          >
            {paper.uri ? (
              <Image source={{ uri: paper.uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
            ) : null}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { opacity: 0 },
  fly: {
    position: 'absolute',
    overflow: 'hidden',
    borderColor: '#FFFFFF',
    backgroundColor: '#F2ECEE',
    shadowColor: '#28141E',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
});
