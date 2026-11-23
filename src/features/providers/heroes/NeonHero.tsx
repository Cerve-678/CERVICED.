// Neon's top (owner's pick from the 2026-11-22 "range of branding
// templates" canvas): a dark wall with the name lit up as a neon script sign,
// a glowing tube under it and what they do in thin spaced caps.
//
// The wall is the whole top of the page whatever their colours are, so it
// reaches up behind the status bar and back button (the hero sits under the
// profile's 100pt top padding), and heroIsDarkForStyle inks everything round
// it white. Their colour is the glow.

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { blend } from "../../../constants/providerThemes";

/** The wall behind the sign: a near-black plum, the same on every theme. */
export const NEON_WALL = "#1A1119";
const BRICK_LINE = "#241A24";
/** How far the wall reaches up behind the profile's top padding. */
const WALL_REACH = 140;

/** The lit tube colour and the glow round it, from their accent. */
export function neonColours(accent: string): { tube: string; glow: string } {
  return { tube: blend(accent, "#FFFFFF", 0.82), glow: blend(accent, "#FFFFFF", 0.2) };
}

export function NeonHero({
  name,
  kicker,
  accent,
  renderLogo,
  tick,
  meta,
  details,
}: {
  name: string;
  kicker: string;
  accent: string;
  renderLogo: (size: number) => React.ReactNode;
  tick: React.ReactNode;
  meta: React.ReactNode;
  details: React.ReactNode;
}) {
  const { tube, glow } = neonColours(accent);
  return (
    <View style={styles.wrap}>
      <View style={styles.wall} pointerEvents="none">
        {Array.from({ length: 24 }, (_, row) => (
          <View key={row} style={styles.brick} />
        ))}
      </View>
      {renderLogo(52)}
      <View accessible accessibilityRole="header" accessibilityLabel={name} style={styles.nameRow}>
        <Text
          style={[styles.name, { color: tube, textShadowColor: glow }]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.55}
        >
          {name}
        </Text>
        {tick}
      </View>
      <View style={[styles.tube, { backgroundColor: tube, shadowColor: glow }]} />
      {kicker ? <Text style={styles.kicker} numberOfLines={1}>{kicker.toUpperCase()}</Text> : null}
      <View style={styles.foot}>{meta}{details}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingHorizontal: 22, paddingTop: 14, paddingBottom: 30 },
  wall: {
    position: "absolute",
    top: -WALL_REACH,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: NEON_WALL,
    overflow: "hidden",
  },
  brick: { height: 26, borderBottomWidth: 1, borderBottomColor: BRICK_LINE },
  nameRow: { alignItems: "center", marginTop: 14, maxWidth: "100%" },
  name: {
    fontFamily: "MsMadi-Regular",
    fontSize: 68,
    lineHeight: 86,
    textAlign: "center",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  tube: {
    width: 130,
    height: 2,
    borderRadius: 1,
    marginTop: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
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
