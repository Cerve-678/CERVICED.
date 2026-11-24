// Neon's top (owner's pick from the 2026-11-22 "range of branding
// templates" canvas): a dark wall with the name lit up as a neon script sign,
// a glowing tube under it and what they do in thin spaced caps.
//
// The wall is the whole top of the page, so it reaches up behind the status
// bar and back button (the hero sits under the profile's 100pt top padding),
// and heroIsDarkForStyle inks everything round it white. Their accent is the
// glow. The wall takes their Branding colour, always deepened to night, and
// the name takes their Business Name Font when they've picked one (owner,
// 2026-11-23: "allow for background colour change but still dark", "allow
// for header font change").

import React from "react";
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from "react-native";

import { blend, isDarkColor } from "../../../constants/providerThemes";

/** How far the wall reaches up behind the profile's top padding. */
const WALL_REACH = 140;

/** How far the wall runs on down behind the page sheet, so the dark fills the
 *  gaps at the sheet's rounded top corners (36pt) instead of the page colour
 *  showing through them (owner, 11-23). The sheet draws over the rest. */
const WALL_TAIL = 40;

/** The sign's name size. 62 crowded the top and a longer name ran to two
 *  huge lines (owner, 11-24: "neon title is too big"); a long name also
 *  shrinks to fit rather than wrapping further. */
export const NEON_NAME_SIZE = 46;

/** The wall: their backdrop colour, deepened until it reads as night. */
export function neonWallColour(heroColour: string): string {
  return blend(heroColour, "#000000", isDarkColor(heroColour) ? 0.55 : 0.82);
}

/** The lit tube colour and the glow round it, from their accent. */
export function neonColours(accent: string): { tube: string; glow: string } {
  return { tube: blend(accent, "#FFFFFF", 0.82), glow: blend(accent, "#FFFFFF", 0.2) };
}

/**
 * Text that glows like a lit tube. iOS draws one blurred shadow per Text, too
 * faint for a sign on its own (owner, 2026-11-23: "it isn't glowing that
 * much"), so two copies in the glow colour with wide shadows sit behind the
 * crisp one. Android draws the crisp copy and its own shadow.
 */
export function GlowText({
  children,
  style,
  tube,
  glow,
  strength = 1,
  numberOfLines,
  fit = false,
}: {
  children: string;
  style: StyleProp<TextStyle>;
  tube: string;
  glow: string;
  /** Scales the halo: 1 for the sign, less for headings. */
  strength?: number;
  numberOfLines?: number;
  /** Shrinks a long line to fit. The halo layers share the crisp copy's box,
   *  so they shrink by the same amount and stay lined up. */
  fit?: boolean;
}) {
  const fitProps = fit ? { adjustsFontSizeToFit: true, minimumFontScale: 0.6 } : null;
  const layer = (radius: number) => (
    <Text
      style={[style, styles.glowLayer, { color: glow, textShadowColor: glow, textShadowRadius: radius * strength }]}
      numberOfLines={numberOfLines}
      {...fitProps}
      accessible={false}
      importantForAccessibility="no"
    >
      {children}
    </Text>
  );
  return (
    <View>
      {layer(34)}
      {layer(16)}
      <Text style={[style, { color: tube, textShadowColor: glow, textShadowRadius: 7 * strength, textShadowOffset: { width: 0, height: 0 } }]} numberOfLines={numberOfLines} {...fitProps}>
        {children}
      </Text>
    </View>
  );
}

export function NeonHero({
  name,
  kicker,
  accent,
  heroColour,
  pickedNameStyle,
  renderLogo,
  tick,
  meta,
  details,
}: {
  name: string;
  kicker: string;
  accent: string;
  /** Their Branding backdrop colour; the wall is it, deepened. */
  heroColour: string;
  /** Their Business Name Font at the sign's size, or null for the neon script. */
  pickedNameStyle: TextStyle | null;
  renderLogo: (size: number) => React.ReactNode;
  tick: React.ReactNode;
  meta: React.ReactNode;
  details: React.ReactNode;
}) {
  const { tube, glow } = neonColours(accent);
  const wall = neonWallColour(heroColour);
  const brick = blend(wall, "#FFFFFF", 0.06);
  return (
    <View style={styles.wrap}>
      <View style={[styles.wall, { backgroundColor: wall }]} pointerEvents="none">
        {Array.from({ length: 24 }, (_, row) => (
          <View key={row} style={[styles.brick, { borderBottomColor: brick }]} />
        ))}
      </View>
      {renderLogo(52)}
      <View accessible accessibilityRole="header" accessibilityLabel={name} style={styles.nameRow}>
        <GlowText style={[styles.name, pickedNameStyle, styles.nameRoom]} tube={tube} glow={glow} numberOfLines={2} fit>
          {name}
        </GlowText>
        {tick}
      </View>
      <View style={[styles.tube, { backgroundColor: tube, shadowColor: glow }]} />
      {kicker ? <Text style={styles.kicker} numberOfLines={1}>{kicker.toUpperCase()}</Text> : null}
      <View style={styles.foot}>{meta}{details}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingHorizontal: 14, paddingTop: 14, paddingBottom: 30 },
  wall: {
    position: "absolute",
    top: -WALL_REACH,
    left: 0,
    right: 0,
    bottom: -WALL_TAIL,
    overflow: "hidden",
  },
  brick: { height: 26, borderBottomWidth: 1 },
  nameRow: { alignItems: "center", marginTop: 10, maxWidth: "100%" },
  // Ms Madi's loops and tails reach well outside its letters, so the line is
  // tall and the text has room either side (owner, 2026-11-23: it was cut off).
  name: {
    fontFamily: "MsMadi-Regular",
    fontSize: NEON_NAME_SIZE,
    lineHeight: 72,
    textAlign: "center",
    textShadowOffset: { width: 0, height: 0 },
  },
  nameRoom: { paddingHorizontal: 18, paddingVertical: 6, includeFontPadding: false },
  glowLayer: { position: "absolute", left: 0, right: 0, top: 0, textShadowOffset: { width: 0, height: 0 } },
  tube: {
    width: 130,
    height: 2.5,
    borderRadius: 2,
    marginTop: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 9,
  },
  kicker: {
    color: "#FFFFFF",
    fontFamily: "Jost-Light",
    fontSize: 13,
    letterSpacing: 6,
    marginTop: 14,
    textAlign: "center",
  },
  foot: { alignItems: "center", marginTop: 12 },
});
