// Index's top (owner's pick from the 2026-11-22 "range of branding
// templates" canvas): a little pile of index cards. Two tinted cards sit
// askew behind a ruled front card with a margin line in the accent; the logo
// is stamped in its corner and the name, what they do and where they are are
// written on its rules. The stars and slots sit under the pile, on the hero.

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { blend } from "../../../constants/providerThemes";
import { cardInk } from "./BoutiqueHero";

/** The rule spacing on an index card; the lines of writing sit on it. */
export const INDEX_RULE = 26;

/** The three tints the cards and tabs come in, from the accent. */
export function indexTints(accent: string, card: string): readonly [string, string, string] {
  return [blend(accent, card, 0.55), blend(accent, card, 0.72), blend(accent, card, 0.4)];
}

/** The margin line down the left of a card. */
export function indexMargin(accent: string, card: string): string {
  return blend(accent, card, 0.35);
}

export function IndexHero({
  name,
  kicker,
  location,
  accent,
  cardColour,
  renderLogo,
  tick,
  meta,
  details,
}: {
  name: string;
  kicker: string;
  location: string;
  accent: string;
  cardColour: string;
  renderLogo: (size: number) => React.ReactNode;
  tick: React.ReactNode;
  meta: React.ReactNode;
  details: React.ReactNode;
}) {
  const ink = cardInk(cardColour);
  const [tintA, tintB] = indexTints(accent, cardColour);
  const lines = [kicker, location].filter(Boolean);
  return (
    <View style={styles.wrap}>
      <View style={styles.pile}>
        <View style={[styles.behind, styles.behindRight, { backgroundColor: tintB }]} />
        <View style={[styles.behind, styles.behindLeft, { backgroundColor: tintA }]} />
        <View style={[styles.card, { backgroundColor: cardColour }]}>
          {Array.from({ length: 7 }, (_, row) => (
            <View key={row} style={[styles.rule, { top: 44 + row * INDEX_RULE, backgroundColor: ink.rule }]} />
          ))}
          <View style={[styles.margin, { backgroundColor: indexMargin(accent, cardColour) }]} />
          <View style={styles.stamp}>{renderLogo(46)}</View>
          <View accessible accessibilityRole="header" accessibilityLabel={name} style={styles.nameRow}>
            <Text style={[styles.name, { color: ink.text }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>{name}</Text>
            {tick}
          </View>
          {lines.map(line => (
            <Text key={line} style={[styles.line, { color: ink.sub }]} numberOfLines={1}>{line}</Text>
          ))}
        </View>
      </View>
      <View style={styles.foot}>{meta}{details}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 26 },
  pile: { marginTop: 8 },
  behind: { position: "absolute", top: 0, bottom: 0, borderRadius: 6 },
  behindRight: { left: 14, right: 4, transform: [{ rotate: "3deg" }] },
  behindLeft: { left: 4, right: 14, transform: [{ rotate: "-2deg" }] },
  card: {
    minHeight: 196,
    borderRadius: 6,
    paddingLeft: 42,
    paddingRight: 70,
    paddingTop: 18,
    paddingBottom: 16,
    overflow: "hidden",
    shadowColor: "#26201E",
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  rule: { position: "absolute", left: 0, right: 0, height: StyleSheet.hairlineWidth },
  margin: { position: "absolute", left: 30, top: 0, bottom: 0, width: 1.5 },
  stamp: { position: "absolute", right: 14, top: 14 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { flexShrink: 1, fontFamily: "YoungSerif-Regular", fontSize: 27, lineHeight: 34 },
  line: { fontFamily: "Figtree-SemiBold", fontSize: 13, lineHeight: INDEX_RULE },
  foot: { alignItems: "center", marginTop: 18 },
});
