// Receipt's top (owner's pick from the 2026-11-22 "range of branding
// templates" canvas): the top of the page printed as a till receipt. A slip
// of their card colour with torn zigzag edges, the logo in a ring, the name in
// spaced caps, where they are and what they do, a dashed rule, their stars and
// slots, then a barcode and a thank-you along the foot.
//
// The details sit on the slip, so detailsSitOnCard inks them in the slip's
// own ink (cardInk), not the hero's.

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Line, Path } from "react-native-svg";

import { cardInk } from "./BoutiqueHero";

const TEETH = 30;
/** The zigzag along a torn edge, in a 100 × 8 box: points down for the top
 *  edge (the paper fills below it), up for the bottom. */
function zigzag(pointUp: boolean): string {
  const step = 100 / TEETH;
  const base = pointUp ? 0 : 8;
  const tip = pointUp ? 8 : 0;
  let d = `M0 ${base}`;
  for (let i = 0; i < TEETH; i++) {
    d += ` L${(i + 0.5) * step} ${tip} L${(i + 1) * step} ${base}`;
  }
  return `${d} Z`;
}
const TOP_EDGE = zigzag(false);
const BOTTOM_EDGE = zigzag(true);

/** A torn edge of the slip, in the paper's colour. */
export function TornEdge({ colour, side }: { colour: string; side: "top" | "bottom" }) {
  return (
    <Svg width="100%" height={8} viewBox="0 0 100 8" preserveAspectRatio="none" accessible={false}>
      <Path d={side === "top" ? TOP_EDGE : BOTTOM_EDGE} fill={colour} />
    </Svg>
  );
}

/** A dashed rule across the slip, like the lines a till prints between parts. */
export function DashedRule({ colour }: { colour: string }) {
  return (
    <Svg width="100%" height={2} accessible={false}>
      <Line x1="0" y1="1" x2="100%" y2="1" stroke={colour} strokeWidth={1.5} strokeDasharray="5 4" />
    </Svg>
  );
}

// Bar widths for the barcode: a fixed pattern, so every page prints the same one.
const BARS = [2, 1, 3, 1, 1, 2, 3, 1, 2, 1, 1, 3, 2, 1, 2, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 2];

function Barcode({ ink }: { ink: string }) {
  return (
    <View style={styles.barcode} accessible={false}>
      {BARS.map((width, index) => (
        <View key={index} style={{ width, height: 34, marginRight: index % 3 === 0 ? 2 : 1, backgroundColor: index % 2 === 0 ? ink : "transparent" }} />
      ))}
    </View>
  );
}

export function ReceiptHero({
  name,
  kicker,
  location,
  cardColour,
  renderLogo,
  tick,
  meta,
  details,
}: {
  name: string;
  kicker: string;
  location: string;
  cardColour: string;
  renderLogo: (size: number) => React.ReactNode;
  tick: React.ReactNode;
  meta: React.ReactNode;
  details: React.ReactNode;
}) {
  const ink = cardInk(cardColour);
  return (
    <View style={styles.wrap}>
      <TornEdge colour={cardColour} side="top" />
      <View style={[styles.slip, { backgroundColor: cardColour }]}>
        {renderLogo(46)}
        <View accessible accessibilityRole="header" accessibilityLabel={name} style={styles.nameRow}>
          <Text style={[styles.name, { color: ink.text }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
            {name.toUpperCase()}
          </Text>
          {tick}
        </View>
        {location ? <Text style={[styles.line, { color: ink.sub }]} numberOfLines={1}>{location.toUpperCase()}</Text> : null}
        {kicker ? <Text style={[styles.line, { color: ink.sub }]} numberOfLines={1}>{kicker}</Text> : null}
        <View style={styles.rule}><DashedRule colour={ink.sub} /></View>
        <View style={styles.foot}>{meta}{details}</View>
        <View style={styles.rule}><DashedRule colour={ink.sub} /></View>
        <Barcode ink={ink.text} />
        <Text style={[styles.thanks, { color: ink.sub }]}>THANK YOU FOR VISITING</Text>
      </View>
      <TornEdge colour={cardColour} side="bottom" />
    </View>
  );
}

const JURA = "Jura-VariableFont_wght";

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 28, paddingTop: 6, paddingBottom: 24 },
  slip: { alignItems: "center", paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14 },
  nameRow: { alignItems: "center", marginTop: 10, maxWidth: "100%" },
  name: { fontFamily: JURA, fontWeight: "700", fontSize: 21, lineHeight: 27, letterSpacing: 3, textAlign: "center" },
  line: { fontFamily: JURA, fontWeight: "600", fontSize: 11, letterSpacing: 2, marginTop: 4, textAlign: "center" },
  rule: { alignSelf: "stretch", marginVertical: 12 },
  foot: { alignItems: "center" },
  barcode: { flexDirection: "row", alignItems: "flex-end", marginTop: 2 },
  thanks: { fontFamily: JURA, fontWeight: "600", fontSize: 10, letterSpacing: 3, marginTop: 6 },
});
