// src/features/providers/heroes/CallingCardHero.tsx
//
// The Calling Card page style (round 4, board 23 on
// https://claude.ai/artifact/68xp8mxLLTCV6pVuiQHJZS): satin folds behind the
// hero, and a cream calling card held by a gold bulldog clip carrying the
// logo, the name in a copperplate script, and the stars, years and slots pill.
// The clip and the satin are drawn from Views and gradients, not SVG, so they
// render the same on every platform.

import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { blend, isDarkColor } from "../../../constants/providerThemes";

/** The card is a physical object, so its paper is fixed; its ink follows the brand. */
export const CALLING_CARD_PAPER = "#F4EBDD";
const CARD_RULE = "#E1D2BD";

/** Deep enough to read on the cream card: the accent, or a darker press of it. */
export function callingCardInk(accent: string): string {
  return isDarkColor(accent) ? accent : blend(accent, "#000000", 0.62);
}

const GOLD_LEVER = ["#7A5520", "#C99A4A", "#F6E2A8", "#D2A653", "#8A6428"] as const;
const GOLD_HINGE = ["#6E4B1B", "#E9CF8C", "#6E4B1B"] as const;
const GOLD_JAW = ["#F8E7B4", "#D9B062", "#B4893C", "#8C6428"] as const;

/**
 * A gold bulldog clip: a rounded lever, a hinge bar, and the jaw that grips the
 * card's top edge. `width` is the jaw's width; the rest scales from it. The
 * caller positions it (absolutely, over the card's top edge).
 */
export function GoldClip({ width, style }: { width: number; style?: StyleProp<ViewStyle> }) {
  const lever = { width: width * 0.28, height: width * 0.33, borderTopLeftRadius: width * 0.14, borderTopRightRadius: width * 0.14, borderBottomLeftRadius: width * 0.06, borderBottomRightRadius: width * 0.06 };
  const hinge = { width: width * 0.36, height: Math.max(3, width * 0.065), marginTop: -2 };
  const jaw = { width, height: width * 0.23, borderTopLeftRadius: width * 0.07, borderTopRightRadius: width * 0.07, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 };
  return (
    <View style={[clip.wrap, style]} pointerEvents="none">
      <LinearGradient colors={GOLD_LEVER} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={lever} />
      <LinearGradient colors={GOLD_HINGE} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={hinge} />
      <LinearGradient colors={GOLD_JAW} style={[jaw, clip.jaw]} />
    </View>
  );
}

/** Satin folds in the brand colour: deep burgundy-like folds for a dark accent,
 *  champagne for a pale one. Fills its parent, behind everything else. */
export function SatinBackdrop({ accent, style }: { accent: string; style?: StyleProp<ViewStyle> }) {
  const dark = isDarkColor(accent);
  const deep = dark ? blend(accent, "#000000", 0.62) : blend(accent, "#5C4636", 0.32);
  const mid = dark ? accent : blend(accent, "#FFFFFF", 0.55);
  const high = dark ? blend(accent, "#FFFFFF", 0.18) : blend(accent, "#FFFFFF", 0.88);
  const sheen = dark ? "rgba(255,190,200,0.22)" : "rgba(255,255,255,0.55)";
  return (
    <View style={[StyleSheet.absoluteFill, satin.clip, style]} pointerEvents="none">
      <LinearGradient
        colors={[deep, mid, deep, high, deep, mid, deep]}
        locations={[0, 0.14, 0.28, 0.44, 0.58, 0.76, 1]}
        start={{ x: 0, y: 0.15 }}
        end={{ x: 1, y: 0.85 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Two long soft highlights running across the folds. */}
      <LinearGradient
        colors={["transparent", sheen, "transparent"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[satin.sheen, satin.sheenTop]}
      />
      <LinearGradient
        colors={["transparent", sheen, "transparent"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[satin.sheen, satin.sheenLow]}
      />
    </View>
  );
}

/** The hero itself. */
export function CallingCardHero({
  name,
  kicker,
  location,
  accent,
  logo,
  details,
  tick,
}: {
  name: string;
  kicker: string;
  location: string;
  accent: string;
  /** The logo, already sized (renderLogo). */
  logo: React.ReactNode;
  /** Stars, years and the slots pill: inked dark by the profile (detailsSitOnCard). */
  details: React.ReactNode;
  tick: React.ReactNode;
}) {
  const ink = callingCardInk(accent);
  const sub = blend(ink, CALLING_CARD_PAPER, 0.35);
  return (
    <View style={hero.wrap}>
      <SatinBackdrop accent={accent} style={hero.satin} />
      <View style={hero.cardWrap}>
        <View style={[hero.card, { backgroundColor: CALLING_CARD_PAPER }]}>
          <View style={hero.cardRow}>
            <View style={hero.logo}>{logo}</View>
            <View style={hero.text} accessible accessibilityRole="header" accessibilityLabel={name}>
              <Text style={[hero.name, { color: ink }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.5}>
                {name}
              </Text>
              {kicker ? <Text style={[hero.kicker, { color: ink }]} numberOfLines={2}>{kicker}</Text> : null}
              {location ? <Text style={[hero.location, { color: sub }]} numberOfLines={2}>{location}</Text> : null}
              {tick}
            </View>
          </View>
          <View style={[hero.rule, { backgroundColor: CARD_RULE }]} />
          <View style={hero.details}>{details}</View>
        </View>
        <GoldClip width={124} style={hero.clip} />
      </View>
    </View>
  );
}

const clip = StyleSheet.create({
  wrap: {
    alignItems: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 6,
  },
  jaw: { marginTop: -1 },
});

const satin = StyleSheet.create({
  clip: { overflow: "hidden" },
  sheen: { position: "absolute", left: -60, right: -60, height: 90, opacity: 0.9 },
  sheenTop: { top: "24%", transform: [{ rotate: "-14deg" }] },
  sheenLow: { top: "62%", transform: [{ rotate: "-10deg" }] },
});

const hero = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 108, paddingBottom: 30 },
  // Runs up behind the header and down to the sheet, so the satin fills the hero.
  satin: { top: -400, bottom: -40 },
  cardWrap: { transform: [{ rotate: "-2deg" }] },
  card: {
    borderRadius: 2,
    paddingTop: 30,
    paddingHorizontal: 18,
    paddingBottom: 16,
    shadowColor: "#14040A",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 10,
  },
  clip: { position: "absolute", top: -46, alignSelf: "center" },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  // HeroLogo keeps 20pt under itself; take it back so it sits level with the text.
  logo: { marginBottom: -20 },
  text: { flex: 1, minWidth: 0 },
  // A loopy copperplate: tall line and side room, or its swashes are clipped.
  name: { fontFamily: "MonsieurLaDoulaise-Regular", fontSize: 40, lineHeight: 64, paddingHorizontal: 8, marginLeft: -8 },
  kicker: { fontFamily: "Forum-Regular", fontSize: 13, lineHeight: 18, letterSpacing: 2.6, marginTop: -4 },
  location: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  rule: { height: 1, marginTop: 14, marginBottom: 10 },
  details: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 6 },
});
