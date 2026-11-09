import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ViewInstance } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { dimensions } from '../../constants/PlatformDimensions';
import type { FolderPaperRect } from './CollectionFolder';

/**
 * "Looks fly out" (chosen 2026-11-09): when a folder opens, the looks
 * sticking out of it fly into their places in the open collection's grid.
 *
 * Three parts:
 *   - CollectionFolder reports where its looks are when tapped (window coords).
 *   - CollectionFlightTarget wraps every grid card. The first few measure
 *     where they landed and stay hidden until their look arrives.
 *   - CollectionOpenFlight draws copies of the looks above the screen and
 *     moves each from its folder spot to its card.
 *
 * What keeps it smooth:
 *   - Everything moves on the UI thread (Reanimated), so the grid mounting
 *     underneath can't make the looks stutter.
 *   - The looks lift out of the folder straight away instead of sitting still
 *     while the grid lays out, and each sets off as soon as its own card is
 *     measured.
 *   - Cards report to a CollectionFlight object, not to screen state, so the
 *     Explore screen doesn't re-render once per card mid-flight.
 *   - Each look lands on the card's photo (same size and corners), the card
 *     appears under it, and the copy fades away, so the price, heart and name
 *     fade in instead of popping.
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

const LIFT_MS = 160;
const FLIGHT_MS = 480;
const STAGGER_MS = 55;
// Once a look lands, its copy fades to show the real card under it.
const SETTLE_MS = 200;
// Long enough for the grid to lay out after the data swaps.
const WAIT_FOR_TARGET_MS = 450;
// How far a look rises out of the folder, and how much it grows doing so.
const LIFT_PX = 10;
const LIFT_SCALE = 1.05;
// Extra height at the middle of the flight, for a soft arc.
const ARC_PX = 28;
const CARD_RADIUS = dimensions.card.smallBorderRadius;

/**
 * One folder opening. Grid cards report where they are and the flying looks
 * read them here, outside React state, so the screen doesn't re-render for
 * every card that measures itself.
 */
export class CollectionFlight {
  readonly key = Date.now();
  readonly papers: FolderPaperRect[];
  private targets: (FlightRect | null)[];
  private revealed: boolean[];
  private listeners = new Set<() => void>();

  constructor(papers: FolderPaperRect[]) {
    this.papers = papers;
    this.targets = papers.map(() => null);
    this.revealed = papers.map(() => false);
  }

  get count(): number {
    return this.papers.length;
  }

  target(index: number): FlightRect | null {
    return this.targets[index] ?? null;
  }

  report(index: number, rect: FlightRect): void {
    if (index >= this.targets.length || this.targets[index]) return;
    this.targets[index] = rect;
    this.emit();
  }

  /** True while card `index` should stay hidden for its look to land on. */
  isWaiting(index: number): boolean {
    return index < this.revealed.length && !this.revealed[index];
  }

  reveal(index: number): void {
    if (index >= this.revealed.length || this.revealed[index]) return;
    this.revealed[index] = true;
    this.emit();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    this.listeners.forEach(listener => listener());
  }
}

const subscribeToNothing = () => () => {};

interface CollectionFlightTargetProps {
  index: number;
  /** The folder opening in progress, if any. */
  flight: CollectionFlight | null;
  /** Height of the card's photo, which is where the look lands. */
  landHeight: number;
  children: React.ReactNode;
}

/**
 * Wraps every grid card, waiting or not. Adding and removing the wrapper
 * would remount the card and replay its fade-in just as its look lands.
 */
export function CollectionFlightTarget({ index, flight, landHeight, children }: CollectionFlightTargetProps) {
  const ref = useRef<ViewInstance>(null);
  const waiting = useSyncExternalStore(
    flight?.subscribe ?? subscribeToNothing,
    () => flight?.isWaiting(index) ?? false,
  );
  const measure = useCallback(() => {
    if (!flight) return;
    // The layout callback fires before the card is in its final place on
    // screen; one frame later, it is.
    requestAnimationFrame(() => {
      ref.current?.measureInWindow((x, y, width, height) => {
        // The wrapper includes the card's bottom margin; land on the photo.
        if (width > 0 && height > 0) flight.report(index, { x, y, width, height: Math.min(height, landHeight) });
      });
    });
  }, [flight, index, landHeight]);
  // A card that was already on screen in the same place won't lay out again.
  useEffect(() => {
    if (waiting) measure();
  }, [waiting, measure]);
  return (
    <View
      ref={ref}
      collapsable={false}
      onLayout={waiting ? measure : undefined}
      style={waiting ? styles.hidden : undefined}
    >
      {children}
    </View>
  );
}

interface CollectionOpenFlightProps {
  flight: CollectionFlight;
  /** Every look has landed (or given up) and faded away. */
  onDone: () => void;
}

export function CollectionOpenFlight({ flight, onDone }: CollectionOpenFlightProps) {
  const overlayRef = useRef<ViewInstance>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const landed = useRef(0);
  const finished = useRef(0);

  const handleLanded = useCallback(() => {
    landed.current += 1;
    if (landed.current === 1) Haptics.selectionAsync().catch(() => {});
  }, []);
  const handleFinished = useCallback(() => {
    finished.current += 1;
    if (finished.current === flight.count) onDone();
  }, [flight, onDone]);

  return (
    <View
      ref={overlayRef}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={() => overlayRef.current?.measureInWindow((x, y) => setOrigin({ x, y }))}
    >
      {origin && flight.papers.map((paper, order) => (
        <FlyingLook
          key={paper.id}
          paper={paper}
          order={order}
          originX={origin.x}
          originY={origin.y}
          flight={flight}
          onLanded={handleLanded}
          onFinished={handleFinished}
        />
      ))}
    </View>
  );
}

interface FlyingLookProps {
  paper: FolderPaperRect;
  order: number;
  originX: number;
  originY: number;
  flight: CollectionFlight;
  onLanded: () => void;
  onFinished: () => void;
}

function FlyingLook({ paper, order, originX, originY, flight, onLanded, onFinished }: FlyingLookProps) {
  const lift = useSharedValue(0);
  const travel = useSharedValue(0);
  const fade = useSharedValue(1);
  // Where it lands, relative to the overlay. Unset until its card reports.
  const hasDest = useSharedValue(false);
  const destX = useSharedValue(0);
  const destY = useSharedValue(0);
  const destW = useSharedValue(0);
  const destH = useSharedValue(0);
  const settled = useRef(false);

  // Rise out of the folder at once, so nothing sits still while the grid lays out.
  useEffect(() => {
    lift.value = withTiming(1, { duration: LIFT_MS, easing: Easing.out(Easing.cubic) });
  }, [lift]);

  const land = useCallback(() => {
    // The card appears under the copy, then the copy fades to show it.
    flight.reveal(order);
    onLanded();
    fade.value = withTiming(0, { duration: SETTLE_MS, easing: Easing.out(Easing.quad) }, done => {
      if (done) runOnJS(onFinished)();
    });
  }, [fade, flight, onFinished, onLanded, order]);

  useEffect(() => {
    const launch = () => {
      const rect = flight.target(order);
      if (!rect || settled.current) return;
      settled.current = true;
      destX.value = rect.x - originX;
      destY.value = rect.y - originY;
      destW.value = rect.width;
      destH.value = rect.height;
      hasDest.value = true;
      travel.value = withDelay(
        order * STAGGER_MS,
        withTiming(1, { duration: FLIGHT_MS, easing: Easing.bezier(0.3, 0.7, 0.2, 1) }, done => {
          if (done) runOnJS(land)();
        }),
      );
    };
    launch();
    const unsubscribe = flight.subscribe(launch);
    const timer = setTimeout(() => {
      if (settled.current) return;
      settled.current = true;
      flight.reveal(order);
      fade.value = withTiming(0, { duration: SETTLE_MS }, done => {
        if (done) runOnJS(onFinished)();
      });
    }, WAIT_FOR_TARGET_MS);
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [destH, destW, destX, destY, fade, flight, hasDest, land, onFinished, order, originX, originY, travel]);

  const fromX = paper.x - originX;
  const fromY = paper.y - originY;
  const { width: paperW, height: paperH, rotate, radius, border } = paper;
  const lookStyle = useAnimatedStyle(() => {
    const l = lift.value;
    const t = hasDest.value ? travel.value : 0;
    // Lifted out of the folder: a little higher and bigger, partly straightened.
    const grow = 1 + (LIFT_SCALE - 1) * l;
    const w0 = paperW * grow;
    const h0 = paperH * grow;
    const x0 = fromX - (w0 - paperW) / 2;
    const y0 = fromY - (h0 - paperH) / 2 - LIFT_PX * l;
    const r0 = rotate * (1 - 0.35 * l);
    const toX = hasDest.value ? destX.value : x0;
    const toY = hasDest.value ? destY.value : y0;
    const toW = hasDest.value ? destW.value : w0;
    const toH = hasDest.value ? destH.value : h0;
    return {
      left: x0 + (toX - x0) * t,
      // A smooth arc, highest halfway, with no corner in the path.
      top: y0 + (toY - y0) * t - ARC_PX * 4 * t * (1 - t),
      width: w0 + (toW - w0) * t,
      height: h0 + (toH - h0) * t,
      borderRadius: radius + (CARD_RADIUS - radius) * t,
      borderWidth: border * (1 - t),
      opacity: fade.value,
      // Rises off the screen as it leaves the folder, then settles to the
      // card's own soft shadow.
      shadowOpacity: 0.22 + 0.08 * l - 0.2 * t,
      shadowRadius: 7 + 5 * l - 6 * t,
      transform: [{ rotate: `${r0 * (1 - t)}deg` }],
    };
  });
  // The folder darkens where a look goes in; that lifts away with it.
  const shadeStyle = useAnimatedStyle(() => ({ opacity: 1 - lift.value }));

  return (
    <Animated.View style={[styles.fly, lookStyle]}>
      {paper.uri ? (
        <Image source={{ uri: paper.uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
      ) : null}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, shadeStyle]}>
        <LinearGradient
          colors={['rgba(60,10,35,0)', 'rgba(60,10,35,0.32)']}
          locations={[0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </Animated.View>
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
    shadowOffset: { width: 0, height: 6 },
  },
});
