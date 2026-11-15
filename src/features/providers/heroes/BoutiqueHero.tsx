// src/features/providers/heroes/BoutiqueHero.tsx
//
// The Boutique page style's hero (pageStyles hero 'basket'): a handheld shop
// basket in their accent, rows of slots moulded into its sides and two handles
// folded up to meet over the middle, with a cream shop label on its front
// carrying a big logo, their name and their area. It replaced a woven basket
// with tissue paper (owner, 2026-11-15: "change to a shopping cart, the
// handheld one"), which had replaced a shopping bag with a small printed logo.
// Their stars, years and slots sit under it.

import React, { useId } from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Path, Pattern, Rect, Stop } from "react-native-svg";

import { blend, isDarkColor } from "../../../constants/providerThemes";

/** The label is card stock, so its paper is fixed; its ink follows the brand. */
const LABEL_PAPER = "#FBF6EE";

const BASKET_W = 270;
const HANDLE_H = 92;
const BODY_TOP = HANDLE_H - 6;
const BODY_H = 210;
/** The moulded bands with no slots: the rim on top, the foot below. */
const RIM_H = 18;
const FOOT_H = 26;
/** One row of slots; the slotted area holds whole rows so none is cut off. */
const SLOT_ROW = 22;
const SLOTS_H = Math.floor((BODY_H - RIM_H - FOOT_H - 8) / SLOT_ROW) * SLOT_ROW;

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
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  // Moulded plastic in their accent: the slots show the darker inside.
  const shell = accent;
  const shellHi = blend(accent, "#FFFFFF", isDarkColor(accent) ? 0.2 : 0.32);
  const inside = blend(accent, "#000000", 0.5);
  const rim = blend(accent, "#000000", 0.26);
  const handleBack = blend(accent, "#000000", 0.4);
  const ink = isDarkColor(accent) ? accent : blend(accent, "#000000", 0.6);
  const inkSub = blend(ink, LABEL_PAPER, 0.35);

  // The body narrows a little towards its rounded foot, like a real basket.
  const body = `M0 0 H${BASKET_W} L${BASKET_W - 14} ${BODY_H - 12} Q${BASKET_W - 16} ${BODY_H} ${BASKET_W - 30} ${BODY_H} H30 Q16 ${BODY_H} 14 ${BODY_H - 12} Z`;
  // Each handle hinges at one end of the basket and folds up to the middle,
  // where the two grips lie side by side.
  const mid = BASKET_W / 2;
  const leftHandle = `M18 ${HANDLE_H + 4} C14 34 40 12 ${mid + 22} 12`;
  const rightHandle = `M${BASKET_W - 18} ${HANDLE_H + 4} C${BASKET_W - 14} 34 ${BASKET_W - 40} 12 ${mid - 22} 12`;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.kicker, { color: heroSub }, shadow]}>NOW BOOKING</Text>
      <View style={styles.basketArea}>
        {/* Two handles folded up to meet: the far one behind, the near one in front. */}
        <Svg width={BASKET_W} height={HANDLE_H + 10} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Path d={rightHandle} stroke={handleBack} strokeWidth={12} fill="none" strokeLinecap="round" />
          <Path d={leftHandle} stroke={rim} strokeWidth={12} fill="none" strokeLinecap="round" />
          <Path d={leftHandle} stroke={shellHi} strokeWidth={2.5} fill="none" strokeLinecap="round" opacity={0.7} />
          {/* The hinges where each handle meets the rim. */}
          <Circle cx={18} cy={HANDLE_H + 2} r={5} fill={handleBack} />
          <Circle cx={BASKET_W - 18} cy={HANDLE_H + 2} r={5} fill={handleBack} />
        </Svg>

        <View style={styles.bodyShadow}>
          <Svg width={BASKET_W} height={BODY_H} pointerEvents="none">
            <Defs>
              {/* Rows of rounded slots moulded through the side. */}
              <Pattern id={`slots${id}`} x={18} y={RIM_H + 6} width={26} height={SLOT_ROW} patternUnits="userSpaceOnUse">
                <Rect x={3} y={3} width={20} height={14} rx={5} fill={inside} />
              </Pattern>
              <SvgLinearGradient id={`shade${id}`} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#000000" stopOpacity={0.3} />
                <Stop offset="0.25" stopColor="#000000" stopOpacity={0} />
                <Stop offset="0.75" stopColor="#000000" stopOpacity={0} />
                <Stop offset="1" stopColor="#000000" stopOpacity={0.3} />
              </SvgLinearGradient>
            </Defs>
            <Path d={body} fill={shell} />
            <Rect x={18} y={RIM_H + 6} width={BASKET_W - 36} height={SLOTS_H} fill={`url(#slots${id})`} />
            <Path d={body} fill={`url(#shade${id})`} />
            {/* The moulded line above the foot. */}
            <Rect x={20} y={BODY_H - FOOT_H + 4} width={BASKET_W - 40} height={2} rx={1} fill={rim} opacity={0.6} />
            {/* The thick rim along the top. */}
            <Rect x={0} y={0} width={BASKET_W} height={RIM_H} rx={6} fill={rim} />
            <Rect x={8} y={3} width={BASKET_W - 16} height={3} rx={1.5} fill={shellHi} opacity={0.55} />
          </Svg>

          {/* The shop label clipped to the front. */}
          <View style={styles.label}>
            <View style={[styles.labelRule, { borderColor: inkSub }]} pointerEvents="none" />
            {/* HeroLogo keeps 20pt under itself; the label shouldn't. */}
            <View style={styles.logoNoGap}>{renderLogo(84)}</View>
            <View style={styles.nameRow} accessible accessibilityRole="header" accessibilityLabel={name}>
              <Text style={[styles.name, { color: ink }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
                {name.toUpperCase()}
              </Text>
              {tick}
            </View>
            {location ? (
              <Text style={[styles.location, { color: inkSub }]} numberOfLines={2}>
                {location.toUpperCase()}
              </Text>
            ) : null}
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
  basketArea: { width: BASKET_W, height: BODY_TOP + BODY_H, marginTop: 14 },
  bodyShadow: {
    position: "absolute", left: 0, top: BODY_TOP, width: BASKET_W, height: BODY_H,
    shadowColor: "#28060C", shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.32, shadowRadius: 16, elevation: 8,
  },
  label: {
    position: "absolute", left: 46, right: 46, top: 30,
    backgroundColor: LABEL_PAPER, borderRadius: 6,
    paddingTop: 14, paddingBottom: 12, paddingHorizontal: 12,
    alignItems: "center", gap: 6,
    shadowColor: "#000000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.22, shadowRadius: 5, elevation: 4,
  },
  labelRule: { position: "absolute", top: 4, left: 4, right: 4, bottom: 4, borderRadius: 4, borderWidth: StyleSheet.hairlineWidth },
  logoNoGap: { marginBottom: -20 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%" },
  name: { fontFamily: "DMSerifDisplay-Regular", fontSize: 18, lineHeight: 24, letterSpacing: 2.4, textAlign: "center", flexShrink: 1 },
  location: { fontFamily: "Manrope-Bold", fontSize: 9, lineHeight: 13, letterSpacing: 2.8, textAlign: "center" },
  details: { alignItems: "center", marginTop: 16 },
});
