// src/components/ProfileHeroBackdrop.tsx
// The colour behind the top of a provider's profile when there's no photo,
// drawn in the hero finish they picked in Branding & Style. One component so
// the client profile, My Profile, the InfoReg preview and Branding's own
// preview can never draw the same finish differently.
import React, { useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { blend, isDarkColor, type HeroFinish } from '../constants/providerThemes';

/** Where Split's hard edge falls along the diagonal. */
const SPLIT_AT = 0.58;

/** How tall the part of the backdrop that shows as the hero is, against its
 *  width. On the profiles the backdrop fills the whole screen but only the
 *  top shows above the content cards, so Split and Sheen are laid out over
 *  that top part. Drawn over the full height, their edge and band landed
 *  behind the cards. Branding's swatches and preview are no taller than this,
 *  so they are drawn over their whole height as before. */
const HERO_HEIGHT_PER_WIDTH = 1.25;

/** The share of the backdrop's height that Split and Sheen are laid out
 *  over. Past it the gradient holds its last colour, which is the colour
 *  each finish ends on, so there is no seam. */
export function finishHeightShare(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 1;
  return Math.min(1, (width * HERO_HEIGHT_PER_WIDTH) / height);
}

/** How far Sheen lifts the second colour toward white for its band of light.
 *  Less on a dark hero, where a strong white band reads as a glare. Taken
 *  down a little from 0.6 / 0.25 on 2026-11-09 (owner: "slightly reduced"). */
const SHEEN_LIGHT_ON_PALE = 0.45;
const SHEEN_LIGHT_ON_DARK = 0.18;

/** How strong Glow's second colour is at the top corner it spreads from.
 *  Was full strength until 2026-11-09 (owner: "slightly reduced"). */
const GLOW_STRENGTH = 0.8;

/** Sheen's colours: the first colour at both corners, the second either side
 *  of a lighter band through the middle. Exported so the test can pin it. */
export function sheenColors(from: string, to: string): [string, string, string, string, string] {
  const light = blend(to, '#FFFFFF', isDarkColor(from) ? SHEEN_LIGHT_ON_DARK : SHEEN_LIGHT_ON_PALE);
  return [from, to, light, to, from];
}

export default function ProfileHeroBackdrop({
  colors,
  finish,
  style,
}: {
  /** The saved hero gradient; the first colour leads in every finish. */
  colors: readonly string[];
  finish: HeroFinish;
  style?: StyleProp<ViewStyle>;
}) {
  const from = colors[0] ?? '#000000';
  const to = colors[1] ?? from;

  // Until it has been measured, assume the full screen, which is how the
  // profiles draw it, so they get it right from the first frame.
  const window = useWindowDimensions();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size?.width || height !== size?.height) setSize({ width, height });
  };
  const share = finishHeightShare(size?.width ?? window.width, size?.height ?? window.height);

  if (finish === 'solid') {
    return <View style={[style, { backgroundColor: from }]} />;
  }

  if (finish === 'glow') {
    return (
      <View style={[style, { backgroundColor: from }]}>
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <RadialGradient id="heroGlow" cx="85%" cy="8%" rx="90%" ry="70%" fx="85%" fy="8%">
              <Stop offset="0" stopColor={to} stopOpacity={GLOW_STRENGTH} />
              <Stop offset="1" stopColor={to} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroGlow)" />
        </Svg>
      </View>
    );
  }

  if (finish === 'sheen') {
    return (
      <LinearGradient
        colors={sheenColors(from, to)}
        locations={[0, 0.36, 0.5, 0.64, 1]}
        start={{ x: 0, y: 0.15 * share }}
        end={{ x: 1, y: 0.85 * share }}
        style={style}
        onLayout={onLayout}
      />
    );
  }

  if (finish === 'split') {
    return (
      <LinearGradient
        colors={[from, from, to, to]}
        locations={[0, SPLIT_AT, SPLIT_AT, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: share }}
        style={style}
        onLayout={onLayout}
      />
    );
  }

  return (
    <LinearGradient
      colors={colors.length >= 2 ? (colors as [string, string, ...string[]]) : [from, to]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={style}
    />
  );
}
