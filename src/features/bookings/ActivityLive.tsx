// src/features/bookings/ActivityLive.tsx
//
// The moving parts of the client's Activity Centre: the live dot each item
// carries, the tile itself, the status pill at the top that cycles through
// what's happening, and the dated line the tiles hang on when the things
// waiting on the client fall on more than one day.
//
// One motion per layer, so the page stays calm: the pill only fades its
// text, the line draws in once and only today's marker pulses, and each tile
// has just its dot. Every loop runs only while the screen is focused, and
// nothing moves when the phone's Reduce Motion setting is on.

import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import type { ActivityItem, ActivityPulse } from './activityCentre';

// The last answer, so a second visit knows straight away.
let knownReduceMotion: boolean | null = null;

/**
 * The phone's Reduce Motion setting, or null until it's known. Callers hold
 * back one-shot entrances while it's null, or a Reduce Motion user would see
 * them play once before the answer arrives.
 */
export function useReduceMotion(): boolean | null {
  const [reduce, setReduce] = useState<boolean | null>(knownReduceMotion);
  useEffect(() => {
    let alive = true;
    const remember = (on: boolean) => {
      knownReduceMotion = on;
      if (alive) setReduce(on);
    };
    AccessibilityInfo.isReduceMotionEnabled()
      .then(remember)
      .catch(() => remember(false));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', remember);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

const RING_MS: Partial<Record<ActivityPulse, number>> = { urgent: 1800, soon: 3200 };
const BREATHE_MS = 3400;

interface LiveDotProps {
  pulse: ActivityPulse;
  animate: boolean;
  size?: number;
  /** Overrides the pulse's own ring speed. */
  ringMs?: number;
}

/** A small dot: a ring that spreads off it, breathing, or still. */
export function LiveDot({ pulse, animate, size = 10, ringMs }: LiveDotProps) {
  const { palette: P } = useTheme();
  const t = useRef(new Animated.Value(0)).current;
  const waiting = pulse === 'waiting';
  const duration = waiting ? BREATHE_MS : (ringMs ?? RING_MS[pulse]);

  useEffect(() => {
    t.setValue(0);
    if (!animate || !duration) return;
    const loop = waiting
      ? Animated.loop(Animated.sequence([
          Animated.timing(t, { toValue: 1, duration: duration / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(t, { toValue: 0, duration: duration / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]))
      : Animated.loop(Animated.timing(t, { toValue: 1, duration, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [animate, duration, waiting, t]);

  const dot = { width: size, height: size, borderRadius: size / 2 };

  if (pulse === 'done') {
    return <Ionicons name="checkmark" size={size + 4} color={P.sub} style={st.doneTick} />;
  }

  if (waiting) {
    const breathing = animate
      ? {
          opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
          transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
        }
      : null;
    return <Animated.View style={[dot, { backgroundColor: P.sub }, breathing]} />;
  }

  return (
    <View style={dot}>
      {animate && !!duration && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: size / 2,
              backgroundColor: P.accent,
              opacity: t.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.35, 0, 0] }),
              transform: [{ scale: t.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 2.2, 2.2] }) }],
            },
          ]}
        />
      )}
      <View style={[dot, { backgroundColor: P.accent }]} />
    </View>
  );
}

/** Settles in from slightly below, once, a little after the one before it. */
function useEntrance(index: number, animate: boolean) {
  const v = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (!animate) {
      v.setValue(1);
      return;
    }
    Animated.timing(v, { toValue: 1, duration: 500, delay: index * 120, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
    // Only on first appearance: a tile that's already in place stays put.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] };
}

interface ActivityTileProps {
  item: ActivityItem;
  index: number;
  animate: boolean;
  /** Whether entrances play: false under Reduce Motion. */
  enter: boolean;
  onPress: (item: ActivityItem) => void;
}

export function ActivityTile({ item, index, animate, enter, onPress }: ActivityTileProps) {
  const { palette: P, isDarkMode } = useTheme();
  const entrance = useEntrance(index, enter);
  const waiting = item.pulse === 'waiting';
  const done = item.pulse === 'done';
  return (
    <Animated.View style={[entrance, done && st.tileDoneFade]}>
      <TouchableOpacity
        style={[
          st.tile,
          {
            backgroundColor: P.card,
            borderColor: P.border,
            shadowColor: isDarkMode ? '#000000' : P.accent,
            shadowOpacity: isDarkMode ? 0.45 : 0.2,
          },
          // Done sits flat: no lift, so it reads as settled.
          done && st.tileDone,
        ]}
        activeOpacity={0.7}
        onPress={() => onPress(item)}
        accessibilityRole="button"
        accessibilityLabel={`${done ? 'Done. ' : waiting ? '' : 'Needs you. '}${item.title}. ${item.detail}${item.caption ? ` ${item.caption}.` : ''}`}
      >
        <View style={st.tileDot}>
          <LiveDot pulse={item.pulse} animate={animate} />
        </View>
        <View style={st.tileText}>
          <Text style={[st.tileTitle, { color: waiting || done ? P.sub : P.text }, done && st.struck]}>{item.title}</Text>
          <Text style={[st.tileDetail, { color: P.sub }]}>{item.detail}</Text>
          {!!item.caption && <Text style={[st.tileCaption, { color: P.accentText }]}>{item.caption}</Text>}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const PILL_STEP_MS = 3000;
const PILL_FADE_MS = 220;

/** One line at a time from `messages`, fading from one to the next. */
export function StatusPill({ messages, animate }: { messages: readonly string[]; animate: boolean }) {
  const { palette: P, isDarkMode } = useTheme();
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const cycling = animate && messages.length > 1;
  // A refresh that brings back the same lines mustn't restart the cycle.
  const signature = messages.join('\n');

  useEffect(() => {
    setIndex(0);
    fade.setValue(1);
    if (!cycling) return;
    const id = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: PILL_FADE_MS, useNativeDriver: true }).start(({ finished }) => {
        if (!finished) return;
        setIndex(i => (i + 1) % messages.length);
        Animated.timing(fade, { toValue: 1, duration: PILL_FADE_MS, useNativeDriver: true }).start();
      });
    }, PILL_STEP_MS);
    return () => {
      clearInterval(id);
      fade.stopAnimation();
    };
    // messages is read through signature, so a new array with the same lines is ignored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycling, signature, fade]);

  const text = messages[index] ?? messages[0] ?? '';
  return (
    <View
      style={[
        st.pill,
        {
          backgroundColor: P.card,
          borderColor: P.border,
          shadowColor: isDarkMode ? '#000000' : P.accent,
          shadowOpacity: isDarkMode ? 0.45 : 0.2,
        },
      ]}
      accessible
      accessibilityLabel={messages.join('. ')}
    >
      <LiveDot pulse="still" animate={false} />
      <Animated.Text
        numberOfLines={2}
        style={[
          st.pillText,
          {
            color: P.text,
            opacity: fade,
            transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
          },
        ]}
      >
        {text}
      </Animated.Text>
    </View>
  );
}

/** The thin line down the left that the day groups hang on. Draws in once. */
export function TimelineRail({ enter, children }: { enter: boolean; children: React.ReactNode }) {
  const { palette: P } = useTheme();
  const draw = useRef(new Animated.Value(enter ? 0 : 1)).current;
  useEffect(() => {
    if (!enter) {
      draw.setValue(1);
      return;
    }
    Animated.timing(draw, { toValue: 1, duration: 1200, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={st.rail}>
      <Animated.View
        style={[st.railLine, { backgroundColor: P.border, transformOrigin: 'top', transform: [{ scaleY: draw }] }]}
      />
      {children}
    </View>
  );
}

interface TimelineGroupProps {
  label: string;
  /** Today's marker is filled and pulses; others are hollow. */
  isToday?: boolean;
  /** The group of things someone else has: a muted hollow marker. */
  waiting?: boolean;
  animate: boolean;
  children: React.ReactNode;
}

export function TimelineGroup({ label, isToday = false, waiting = false, animate, children }: TimelineGroupProps) {
  const { palette: P } = useTheme();
  return (
    <View style={st.group}>
      <View style={st.node}>
        {isToday ? (
          <LiveDot pulse="urgent" animate={animate} size={9} ringMs={2400} />
        ) : (
          <View style={[st.nodeHollow, { backgroundColor: P.bg, borderColor: waiting ? P.sub : P.accent }]} />
        )}
      </View>
      <Text style={[st.groupLabel, { color: P.sub }]}>{label}</Text>
      {children}
    </View>
  );
}

const st = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 10,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
  },
  tileDot: { marginTop: 6 },
  tileDone: { shadowOpacity: 0, elevation: 0 },
  tileDoneFade: { opacity: 0.7 },
  struck: { textDecorationLine: 'line-through' },
  doneTick: { marginTop: -4, marginLeft: -2 },
  tileText: { flex: 1 },
  tileTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  tileDetail: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  tileCaption: { fontSize: 11.5, fontWeight: '600', marginTop: 6 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 50,
    borderRadius: 100,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 18,
    paddingRight: 16,
    paddingVertical: 8,
    marginTop: 2,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
  },
  pillText: { flex: 1, fontSize: 13.5, lineHeight: 17, fontWeight: '600' },
  rail: { position: 'relative', paddingLeft: 24 },
  railLine: { position: 'absolute', left: 4, top: 8, bottom: 8, width: 1.5 },
  group: { position: 'relative', marginBottom: 8 },
  node: { position: 'absolute', left: -24, top: 2 },
  nodeHollow: { width: 9, height: 9, borderRadius: 4.5, borderWidth: 2 },
  groupLabel: { fontFamily: 'JosefinSans-Bold', fontSize: 10.5, letterSpacing: 1.5, lineHeight: 13, marginBottom: 8 },
});
