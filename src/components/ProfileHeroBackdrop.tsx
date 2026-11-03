// src/components/ProfileHeroBackdrop.tsx
// The colour behind the top of a provider's profile when there's no photo,
// drawn in the hero finish they picked in Branding & Style. One component so
// the client profile, My Profile, the InfoReg preview and Branding's own
// preview can never draw the same finish differently.
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { HeroFinish } from '../constants/providerThemes';

/** Where Split's hard edge falls along the diagonal. */
const SPLIT_AT = 0.58;

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

  if (finish === 'solid') {
    return <View style={[style, { backgroundColor: from }]} />;
  }

  if (finish === 'glow') {
    return (
      <View style={[style, { backgroundColor: from }]}>
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <RadialGradient id="heroGlow" cx="85%" cy="8%" rx="90%" ry="70%" fx="85%" fy="8%">
              <Stop offset="0" stopColor={to} stopOpacity={1} />
              <Stop offset="1" stopColor={to} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroGlow)" />
        </Svg>
      </View>
    );
  }

  if (finish === 'split') {
    return (
      <LinearGradient
        colors={[from, from, to, to]}
        locations={[0, SPLIT_AT, SPLIT_AT, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={style}
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
