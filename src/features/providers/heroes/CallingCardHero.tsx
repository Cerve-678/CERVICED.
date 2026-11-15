// src/features/providers/heroes/CallingCardHero.tsx
//
// The Calling Card page style (round 4, board 23 on
// https://claude.ai/artifact/68xp8mxLLTCV6pVuiQHJZS): satin folds behind the
// hero, and a cream calling card held by a bulldog clip carrying the logo, the
// name in a copperplate script, and the stars, years and slots pill. The satin
// is the theme's own backdrop colour and the clip is the theme accent, so both
// change with the theme (owner, 2026-11-15). The clip and the satin are drawn
// from Views and gradients, not SVG, so they render the same on every platform.

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

/** The clip's metal: a polished press of one colour, dark at the edges with a bright catch-light. */
function clipMetal(colour: string) {
  const lo = blend(colour, "#000000", 0.5);
  const mid = blend(colour, "#000000", 0.12);
  const hi = blend(colour, "#FFFFFF", 0.7);
  return {
    lever: [lo, mid, hi, colour, lo] as const,
    hinge: [lo, hi, lo] as const,
    jaw: [hi, colour, mid, lo] as const,
  };
}

/**
 * A bulldog clip in the given colour (the theme accent): a rounded lever, a
 * hinge bar, and the jaw that grips the card's top edge. `width` is the jaw's
 * width; the rest scales from it. The caller positions it (absolutely, over
 * the card's top edge).
 */
export function BulldogClip({ width, colour, style }: { width: number; colour: string; style?: StyleProp<ViewStyle> }) {
  const metal = clipMetal(colour);
  const lever = { width: width * 0.28, height: width * 0.33, borderTopLeftRadius: width * 0.14, borderTopRightRadius: width * 0.14, borderBottomLeftRadius: width * 0.06, borderBottomRightRadius: width * 0.06 };
  const hinge = { width: width * 0.36, height: Math.max(3, width * 0.065), marginTop: -2 };
  const jaw = { width, height: width * 0.23, borderTopLeftRadius: width * 0.07, borderTopRightRadius: width * 0.07, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 };
  return (
    <View style={[clip.wrap, style]} pointerEvents="none">
      <LinearGradient colors={metal.lever} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={lever} />
      <LinearGradient colors={metal.hinge} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={hinge} />
      <LinearGradient colors={metal.jaw} style={[jaw, clip.jaw]} />
    </View>
  );
}

/** Satin folds in the theme's backdrop colour: the colour itself on the lit
 *  folds, pressed a little darker in the hollows, so the hero reads as the
 *  same colour as the theme. Fills its parent, behind everything else. */
export function SatinBackdrop({ colour, style }: { colour: string; style?: StyleProp<ViewStyle> }) {
  const dark = isDarkColor(colour);
  const deep = blend(colour, "#000000", dark ? 0.4 : 0.16);
  const mid = colour;
  const high = blend(colour, "#FFFFFF", dark ? 0.16 : 0.45);
  const sheen = dark ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.5)";
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
  heroColour,
  logo,
  details,
  tick,
}: {
  name: string;
  kicker: string;
  location: string;
  accent: string;
  /** The theme's backdrop colour: the satin is drawn in it. */
  heroColour: string;
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
      <SatinBackdrop colour={heroColour} style={hero.satin} />
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
        <BulldogClip width={124} colour={accent} style={hero.clip} />
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
