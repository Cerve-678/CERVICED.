// src/features/providers/heroes/ApothecaryHero.tsx
//
// The Apothecary page style's hero (pageStyles hero 'prescription'): a
// chemist's prescription pad in the theme's card colour. A band of the accent
// along its top, a line with "PRESCRIPTION" and today's date, a ℞ mark beside
// their name as the dispensary, then dotted lines filled in from their own
// profile (prepared for you, what they do, where they are), and their logo as
// a round pharmacy stamp beside a signed first name. Their stars, years and
// slots sit under the pad.
//
// Picked by the owner on 2026-11-16 (canvas
// https://claude.ai/artifact/Bo9snsRR4j6Sdy65Qso8SK, board A), replacing the
// hanging paper tag. Everything on the pad is real: the date is today's, and a
// line with nothing to say is left off rather than filled with an example.

import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { blend } from "../../../constants/providerThemes";
import { cardInk } from "./BoutiqueHero";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** "16 NOV 2026", built by hand so it never depends on Intl. */
export function prescriptionDate(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** The pad's filled-in lines, leaving off any it has nothing for. */
export function prescriptionLines(kicker: string, location: string): { label: string; value: string }[] {
  const treatments = kicker
    .split("·")
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" · ");
  return [
    { label: "PREPARED FOR", value: "You" },
    { label: "TREATMENTS", value: treatments },
    { label: "DISPENSED AT", value: location.trim() },
  ].filter(line => line.value.length > 0);
}

export function PrescriptionHero({
  name,
  kicker,
  location,
  accent,
  cardColour,
  renderLogo,
  details,
  isVerified,
  verifiedTick,
}: {
  name: string;
  /** What they do, "LASHES · BROWS": the Treatments line. */
  kicker: string;
  location: string;
  accent: string;
  /** Their Branding card colour: the pad. */
  cardColour: string;
  renderLogo: (size: number) => React.ReactNode;
  details: React.ReactNode;
  isVerified: boolean;
  /** The tick, in a colour that reads on the pad. */
  verifiedTick: React.ReactNode;
}) {
  const ink = cardInk(cardColour);
  // The accent, kept readable on the pad: deepened on a pale card, lifted on a dark one.
  const mark = ink.text === "#1F1A1C" ? blend(accent, "#000000", 0.2) : blend(accent, "#FFFFFF", 0.45);
  const today = useMemo(() => prescriptionDate(new Date()), []);
  const lines = prescriptionLines(kicker, location);
  const signedName = name.trim().split(/\s+/)[0] ?? name;

  return (
    <View style={styles.wrap}>
      <View style={[styles.pad, { backgroundColor: cardColour, borderColor: ink.rule }]}>
        <View style={[styles.band, { backgroundColor: accent }]} />
        <View style={styles.topLine}>
          <Text style={[styles.small, { color: ink.sub }]}>PRESCRIPTION</Text>
          <Text style={[styles.small, { color: ink.sub }]}>{today}</Text>
        </View>

        <View style={styles.headRow}>
          <Text style={[styles.rx, { color: mark }]} accessible={false}>℞</Text>
          <View style={styles.nameCol} accessible accessibilityRole="header" accessibilityLabel={name}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: ink.text }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
                {name}
              </Text>
              {isVerified ? verifiedTick : null}
            </View>
          </View>
        </View>

        <View style={styles.lines}>
          {lines.map(line => (
            <View key={line.label} style={styles.line} accessible accessibilityLabel={`${line.label.toLowerCase()}: ${line.value}`}>
              <Text style={[styles.lineLabel, { color: ink.text }]}>{line.label}</Text>
              {/* A dotted leader running out to the value. */}
              <Text style={[styles.leader, { color: ink.rule }]} numberOfLines={1} ellipsizeMode="clip">
                {". ".repeat(60)}
              </Text>
              <Text style={[styles.lineValue, { color: ink.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {line.value}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.footRow}>
          {/* Their logo as a round pharmacy stamp, set down a little crooked. */}
          <View style={[styles.stamp, { borderColor: mark }]}>
            <View style={styles.logoNoGap}>{renderLogo(74)}</View>
          </View>
          <View style={styles.signCol}>
            <Text style={[styles.signature, { color: mark }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {signedName}
            </Text>
            <View style={[styles.signRule, { backgroundColor: ink.rule }]} />
            <Text style={[styles.small, { color: ink.sub }]}>PRACTITIONER</Text>
          </View>
        </View>
      </View>

      <View style={styles.details}>{details}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Opens on the pad's top line, so it starts lower than a logo-first hero
  // (as TEXT_FIRST_DROP in ProfileHero) and clears the header buttons.
  wrap: { alignSelf: "stretch", marginTop: 48, marginBottom: 28, paddingHorizontal: 22 },
  pad: { borderWidth: StyleSheet.hairlineWidth, paddingBottom: 18, overflow: "hidden" },
  band: { height: 8 },
  topLine: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 10 },
  small: { fontFamily: "Manrope-Bold", fontSize: 9, lineHeight: 13, letterSpacing: 2 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 6 },
  // ℞ isn't in Marcellus, so it falls back to the system face; its tall loop
  // needs the room.
  rx: { fontSize: 54, lineHeight: 70 },
  nameCol: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  // Marcellus SC: its caps need 1.28× or their tops crop.
  name: { fontFamily: "MarcellusSC-Regular", fontSize: 28, lineHeight: 36, letterSpacing: 2, flexShrink: 1 },
  lines: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  line: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  lineLabel: { fontFamily: "Manrope-Bold", fontSize: 10, lineHeight: 15, letterSpacing: 1.6, flexShrink: 0 },
  leader: { flex: 1, fontSize: 10, lineHeight: 15, letterSpacing: 1, overflow: "hidden" },
  lineValue: { fontFamily: "Marcellus-Regular", fontSize: 14, lineHeight: 19, flexShrink: 1, maxWidth: "60%" },
  footRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 16, gap: 18 },
  stamp: {
    width: 92, height: 92, borderRadius: 46, borderWidth: 1.5, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center", transform: [{ rotate: "-8deg" }],
  },
  // HeroLogo keeps 20pt under itself; the stamp centres it instead.
  logoNoGap: { marginBottom: -20 },
  signCol: { flex: 1, minWidth: 0 },
  // A handwritten first name; the script's loops need ≥1.45× and side room.
  signature: { fontFamily: "Italianno-Regular", fontSize: 34, lineHeight: 50, paddingHorizontal: 4 },
  signRule: { height: 1, marginTop: -6, marginBottom: 4 },
  details: { alignItems: "center", marginTop: 18 },
});
