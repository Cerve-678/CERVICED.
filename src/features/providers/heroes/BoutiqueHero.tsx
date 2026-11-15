// src/features/providers/heroes/BoutiqueHero.tsx
//
// The Boutique page style's hero (round 4, board 24): a shopping bag with
// rope handles and tissue paper, the provider's logo and name printed on its
// front like a shop's bag, then their stars, years and slots under it.

import React from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Polygon } from "react-native-svg";

import { blend, isDarkColor, withAlpha } from "../../../constants/providerThemes";

export function BoutiqueHero({
  name,
  location,
  accent,
  heroSub,
  shadow,
  renderLogo,
  details,
  tick,
}: {
  name: string;
  location: string;
  accent: string;
  heroSub: string;
  /** The hero's text shadow over a dark photo, or null. */
  shadow: TextStyle | null;
  renderLogo: (size: number) => React.ReactNode;
  details: React.ReactNode;
  tick: React.ReactNode;
}) {
  // The bag is their accent; whatever's printed on it is in the ink that
  // reads on that colour.
  const bag = accent;
  const bagHi = blend(bag, "#FFFFFF", 0.16);
  const bagLo = blend(bag, "#000000", 0.32);
  const rope = blend(bag, "#000000", 0.5);
  const print = isDarkColor(bag) ? "#F8EDE6" : "#2A0A10";
  const tissue = blend(accent, "#FFFFFF", 0.78);
  const tissueLight = blend(accent, "#FFFFFF", 0.9);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.kicker, { color: heroSub }, shadow]}>NOW BOOKING</Text>
      <View style={styles.bagArea}>
        <View style={[styles.handle, styles.handleLeft, { borderColor: rope }]} pointerEvents="none" />
        <View style={[styles.handle, styles.handleRight, { borderColor: rope }]} pointerEvents="none" />
        <Svg width={190} height={60} viewBox="0 0 190 60" style={styles.tissue} pointerEvents="none">
          <Polygon points="24,60 48,10 68,40 88,2 104,60" fill={tissue} />
          <Polygon points="82,60 100,14 122,44 146,4 168,60" fill={tissueLight} />
        </Svg>
        <View style={styles.bagShadow}>
          <View style={styles.bag}>
            {/* The bag's sheen sits behind what's printed on it. */}
            <LinearGradient
              colors={[bagLo, bag, bagHi, bag, bagLo]}
              locations={[0, 0.14, 0.5, 0.86, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={[styles.fold, { backgroundColor: withAlpha(bagLo, 0.55) }]} />
            <View style={[styles.rivet, styles.rivetLeft, { backgroundColor: rope }]} />
            <View style={[styles.rivet, styles.rivetRight, { backgroundColor: rope }]} />
            <View style={styles.printed}>
              <View style={[styles.logoRing, { borderColor: withAlpha(print, 0.75) }]}>
                {/* HeroLogo keeps 20pt under itself; the ring shouldn't. */}
                <View style={styles.logoNoGap}>{renderLogo(52)}</View>
              </View>
              <View style={styles.nameRow} accessible accessibilityRole="header" accessibilityLabel={name}>
                <Text style={[styles.name, { color: print }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
                  {name.toUpperCase()}
                </Text>
                {tick}
              </View>
              <View style={[styles.rule, { backgroundColor: withAlpha(print, 0.55) }]} />
              {location ? (
                <Text style={[styles.location, { color: withAlpha(print, 0.88) }]} numberOfLines={2}>
                  {location.toUpperCase()}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      </View>
      <View style={styles.details}>{details}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Opens on a line of text, so it starts lower than a logo-first hero (as
  // TEXT_FIRST_DROP in ProfileHero).
  wrap: { alignItems: "center", marginTop: 48, marginBottom: 30, paddingHorizontal: 20 },
  kicker: { fontFamily: "Manrope-Bold", fontSize: 11, lineHeight: 15, letterSpacing: 3.3 },
  bagArea: { width: 230, height: 284, marginTop: 14 },
  handle: { position: "absolute", top: 0, width: 50, height: 82, borderWidth: 4, borderBottomWidth: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  handleLeft: { left: 58 },
  handleRight: { left: 122 },
  tissue: { position: "absolute", left: 20, top: 26 },
  bagShadow: {
    position: "absolute", left: 10, top: 74, width: 210, height: 206, borderRadius: 6,
    shadowColor: "#28060C", shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.35, shadowRadius: 17, elevation: 8,
  },
  bag: { flex: 1, borderTopLeftRadius: 2, borderTopRightRadius: 2, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, overflow: "hidden" },
  fold: { height: 14 },
  rivet: { position: "absolute", top: 4, width: 6, height: 6, borderRadius: 3 },
  rivetLeft: { left: 70 },
  rivetRight: { left: 134 },
  printed: { alignItems: "center", paddingTop: 22, paddingHorizontal: 16 },
  logoNoGap: { marginBottom: -20 },
  logoRing: { padding: 4, borderRadius: 40, borderWidth: 1.5, marginBottom: 10 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontFamily: "DMSerifDisplay-Regular", fontSize: 18, lineHeight: 24, letterSpacing: 2.6, textAlign: "center", flexShrink: 1 },
  rule: { width: 34, height: 1, marginVertical: 9 },
  location: { fontFamily: "Manrope-Bold", fontSize: 9, lineHeight: 13, letterSpacing: 2.8, textAlign: "center" },
  details: { alignItems: "center", marginTop: 16 },
});
