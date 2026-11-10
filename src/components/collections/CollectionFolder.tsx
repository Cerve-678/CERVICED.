import React, { memo, useEffect, useId, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ViewInstance } from 'react-native';
import { LinearGradient as FadeGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Svg, { ClipPath, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { COLLECTION_PALETTES } from '../../constants/collectionColors';
import type { CollectionColor } from '../../types/collections';
import { FOLDER_PHOTO_COUNT } from '../../stores/useCollectionsStore';

/**
 * A pastel "jelly" folder for an Explore collection (design chosen
 * 2026-11-09: Jelly finish, Fanned photos). The newest saved photos stick out
 * of the top, fanned like papers dropped in; each photo added after the
 * folder is on screen springs up into place.
 *
 * Drawn at a 150 × 124 design size and scaled by `width`, so every offset
 * below is in design units.
 */

const DESIGN_W = 150;
const DESIGN_H = 124;
const FRONT_H = 84;
// Front panel: high on the left, curving down to a lower right shoulder.
const FRONT_PATH =
  'M0 18 Q0 0 18 0 H56 C66 0 70 4 76 12 C82 20 86 24 98 24 H132 Q150 24 150 42 V66 Q150 84 132 84 H18 Q0 84 0 66 Z';
// Where the 1st…4th newest-but-oldest photo sits. The latest one added is
// always drawn last, so it is on top.
const FAN = [
  { left: 16, top: 22, rotate: -10 },
  { left: 58, top: 20, rotate: 9 },
  { left: 36, top: 12, rotate: -2 },
  { left: 48, top: 4, rotate: 5 },
] as const;
const PAPER_W = 72;
const PAPER_H = 92;

/** Where one sticking-out look sits on screen, for the open animation. */
export interface FolderPaperRect {
  id: string;
  uri: string | null;
  /** Window coordinates of the un-rotated photo. */
  x: number;
  y: number;
  width: number;
  height: number;
  rotate: number;
  /** Corner radius and white border, so the flying copy starts identical. */
  radius: number;
  border: number;
}

export interface CollectionFolderPhoto {
  /** The saved item id, so a photo keeps its identity as more are added. */
  id: string;
  uri: string | null;
}

interface CollectionFolderProps {
  name: string;
  count: number;
  color: CollectionColor;
  /** Oldest first; only the newest FOLDER_PHOTO_COUNT are shown. */
  photos: CollectionFolderPhoto[];
  width?: number;
  /** Hides the name and count, for small folders next to a text label. */
  hideLabel?: boolean;
  /** Gets where each sticking-out look is, newest first, so they can fly out. */
  onPress?: (papers: FolderPaperRect[]) => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
}

const Paper = memo(function Paper({
  uri,
  slot,
  scale,
  animateIn,
  lift,
}: {
  uri: string | null;
  slot: number;
  scale: number;
  animateIn: boolean;
  lift: Animated.Value;
}) {
  const enter = useRef(new Animated.Value(animateIn ? 0 : 1)).current;
  useEffect(() => {
    if (!animateIn) return;
    Animated.spring(enter, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }).start();
  }, [animateIn, enter]);

  const pos = FAN[slot] ?? FAN[0];
  return (
    <Animated.View
      style={[
        styles.paper,
        {
          left: pos.left * scale,
          top: pos.top * scale,
          width: PAPER_W * scale,
          height: PAPER_H * scale,
          borderRadius: 10 * scale,
          borderWidth: Math.max(2, 3 * scale),
          opacity: enter,
          transform: [
            {
              translateY: Animated.add(
                enter.interpolate({ inputRange: [0, 1], outputRange: [64 * scale, 0] }),
                lift.interpolate({ inputRange: [0, 1], outputRange: [0, -9 * scale] }),
              ),
            },
            { rotate: `${pos.rotate}deg` },
          ],
        },
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.paperBlank]} />
      )}
      {/* Shaded where it goes into the folder, so it reads as tucked inside. */}
      <FadeGradient
        pointerEvents="none"
        colors={['rgba(60,10,35,0)', 'rgba(60,10,35,0.32)']}
        locations={[0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
});

export const CollectionFolder = memo(function CollectionFolder({
  name,
  count,
  color,
  photos,
  width = DESIGN_W,
  hideLabel = false,
  onPress,
  onLongPress,
  accessibilityLabel,
}: CollectionFolderProps) {
  const scale = width / DESIGN_W;
  const palette = COLLECTION_PALETTES[color];
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '');

  // Photos already in the folder when it first draws sit still; only ones
  // added while it's on screen spring in.
  const seenRef = useRef<Set<string> | null>(null);
  const shown = photos.slice(-FOLDER_PHOTO_COUNT);
  if (seenRef.current === null) seenRef.current = new Set(shown.map(p => p.id));
  const seen = seenRef.current;
  useEffect(() => {
    shown.forEach(p => seen.add(p.id));
  });

  const lift = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(0)).current;
  const animatePress = (to: number) => {
    Animated.parallel([
      Animated.timing(lift, { toValue: to, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(press, { toValue: to, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  };

  const countLabel = count === 0 ? 'Empty' : count === 1 ? '1 look' : `${count} looks`;

  // Where the looks are, worked out from the folder's own position so the
  // fan's rotation doesn't skew the measurement. Newest first: that's the
  // order the open collection lists them in.
  const bodyRef = useRef<ViewInstance>(null);
  const handlePress = () => {
    if (!onPress) return;
    const node = bodyRef.current;
    if (!node) { onPress([]); return; }
    node.measureInWindow((x, y) => {
      const papers = shown.map((photo, slot) => {
        const pos = FAN[slot] ?? FAN[0];
        return {
          id: photo.id,
          uri: photo.uri,
          x: x + pos.left * scale,
          y: y + (pos.top - 9) * scale,
          width: PAPER_W * scale,
          height: PAPER_H * scale,
          rotate: pos.rotate,
          radius: 10 * scale,
          border: Math.max(2, 3 * scale),
        };
      });
      onPress(papers.reverse());
    });
  };

  const body = (
    <Animated.View
      ref={bodyRef}
      collapsable={false}
      style={{
        width,
        height: DESIGN_H * scale,
        transform: [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] }) }],
      }}
    >
      {/* Two shadows: a tight one where it touches the ground, a soft one around it. */}
      <View
        style={[
          styles.contact,
          {
            left: 16 * scale,
            right: 16 * scale,
            height: 12 * scale,
            borderRadius: 6 * scale,
            backgroundColor: palette.back,
            shadowOffset: { width: 0, height: 3 * scale },
            shadowRadius: 4 * scale,
          },
        ]}
      />
      <View
        style={[
          styles.back,
          {
            top: 10 * scale,
            borderRadius: 18 * scale,
            backgroundColor: palette.back,
            shadowColor: palette.deep,
            shadowOffset: { width: 0, height: 10 * scale },
            shadowRadius: 14 * scale,
          },
        ]}
      >
        {/* Darker toward where the looks go in. */}
        <FadeGradient
          pointerEvents="none"
          colors={[palette.back, palette.backShade, palette.backShade]}
          locations={[0, 0.38, 1]}
          style={[StyleSheet.absoluteFill, { borderRadius: 18 * scale }]}
        />
      </View>
      <View
        style={[
          styles.tab,
          {
            top: 1 * scale,
            width: 60 * scale,
            height: 26 * scale,
            borderTopLeftRadius: 13 * scale,
            borderTopRightRadius: 13 * scale,
            backgroundColor: palette.back,
          },
        ]}
      />
      {shown.map((photo, slot) => (
        <Paper
          key={photo.id}
          uri={photo.uri}
          slot={slot}
          scale={scale}
          animateIn={!seen.has(photo.id)}
          lift={lift}
        />
      ))}
      <Svg
        width={width}
        height={FRONT_H * scale}
        viewBox={`0 0 ${DESIGN_W} ${FRONT_H}`}
        style={styles.front}
      >
        <Defs>
          <LinearGradient id={`b${gid}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={palette.front} stopOpacity={0.92} />
            <Stop offset="1" stopColor={palette.front} stopOpacity={0.8} />
          </LinearGradient>
          <RadialGradient id={`g${gid}`} cx="22%" cy="0%" rx="95%" ry="75%" fx="22%" fy="0%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.62} />
            <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id={`s${gid}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.5" stopColor="#3C001E" stopOpacity={0} />
            <Stop offset="1" stopColor="#3C001E" stopOpacity={0.16} />
          </LinearGradient>
          <LinearGradient id={`h${gid}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.4} />
            <Stop offset="0.2" stopColor="#FFFFFF" stopOpacity={0} />
          </LinearGradient>
          <ClipPath id={`c${gid}`}>
            <Path d={FRONT_PATH} />
          </ClipPath>
        </Defs>
        <Path d={FRONT_PATH} fill={`url(#b${gid})`} />
        <Path d={FRONT_PATH} fill={`url(#s${gid})`} />
        <Path d={FRONT_PATH} fill={`url(#h${gid})`} />
        <Path d={FRONT_PATH} fill={`url(#g${gid})`} />
        <Path
          d={FRONT_PATH}
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity={0.75}
          strokeWidth={2.5}
          clipPath={`url(#c${gid})`}
        />
      </Svg>
      {!hideLabel && (
        <View
          pointerEvents="none"
          style={[styles.label, { left: 14 * scale, right: 10 * scale, bottom: 11 * scale }]}
        >
          <Text
            numberOfLines={1}
            style={[styles.name, { color: palette.ink, fontSize: 15 * scale, lineHeight: 18 * scale }]}
          >
            {name}
          </Text>
          <Text style={[styles.count, { color: palette.ink, fontSize: 10.5 * scale, lineHeight: 13 * scale }]}>
            {countLabel}
          </Text>
        </View>
      )}
    </Animated.View>
  );

  if (!onPress && !onLongPress) return body;
  return (
    <Pressable
      onPress={handlePress}
      onLongPress={onLongPress}
      onPressIn={() => animatePress(1)}
      onPressOut={() => animatePress(0)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${name}, ${countLabel}`}
    >
      {body}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  contact: {
    position: 'absolute',
    bottom: 0,
    shadowColor: '#280A19',
    shadowOpacity: 0.4,
    elevation: 2,
  },
  back: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    shadowOpacity: 0.3,
    elevation: 4,
  },
  tab: {
    position: 'absolute',
    left: 0,
  },
  paper: {
    position: 'absolute',
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#28141E',
    shadowOpacity: 0.22,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 4 },
  },
  paperBlank: {
    backgroundColor: '#F2ECEE',
  },
  front: {
    position: 'absolute',
    left: 0,
    bottom: 0,
  },
  label: {
    position: 'absolute',
  },
  name: {
    fontFamily: 'JosefinSans-VariableFont_wght',
    fontWeight: '700',
  },
  count: {
    fontFamily: 'JosefinSans-VariableFont_wght',
    fontWeight: '600',
    opacity: 0.8,
  },
});
