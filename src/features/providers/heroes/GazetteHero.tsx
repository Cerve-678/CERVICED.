// src/features/providers/heroes/GazetteHero.tsx
//
// The Gazette page style's hero (round 4, 2026-11-15): the top of the profile
// as a newspaper front page laid over their photo or colours. A blackletter
// masthead beside the logo in the left "ear", a dateline of today's date and
// their area, their business name as the banner headline, their services below,
// and an inverse "Located in" bar. Everything on it is real: the date is
// today's, the edition is their area, the ear is their rating (or nothing).
//
// The sheet uses the provider's card colour, with ink chosen for contrast.

import React, { useId, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, Pattern, Rect } from "react-native-svg";
import { isDarkColor } from "../../../constants/providerThemes";

const DARK_INK = "#1F1D1A";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** A full date, built by hand so it never depends on Intl. */
export function gazetteDate(date: Date): string {
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function GazetteHero({
  name,
  kicker,
  location,
  rating,
  cardColour,
  logo,
  tick,
}: {
  name: string;
  kicker: string;
  location: string;
  /** Their star rating, for the right ear. Left out with no CERVICED reviews. */
  rating?: string | null | undefined;
  cardColour: string;
  /** The logo, already drawn at ear size. */
  logo: React.ReactNode;
  tick: React.ReactNode;
}) {
  // Today's date for the dateline; worked out once per mount.
  const dateline = useMemo(() => {
    const parts = [gazetteDate(new Date())];
    if (location) parts.push(`${location} Edition`);
    return parts.join(" · ").toUpperCase();
  }, [location]);
  const ink = isDarkColor(cardColour) ? "#FFFFFF" : DARK_INK;
  return (
    <View style={[styles.sheet, { backgroundColor: cardColour }]}>
      <View style={[styles.doubleRuleTop, { borderColor: ink }]} />
      <View style={[styles.mastRow, { borderBottomColor: ink }]}>
        <View style={[styles.ear, styles.earLeft, { borderRightColor: ink }]}>{logo}</View>
        <View style={styles.mastCentre}>
          <Text style={[styles.masthead, { color: ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            The Gazette
          </Text>
        </View>
        <View style={[styles.ear, styles.earRight, { borderLeftColor: ink }]}>
          {rating ? (
            <>
              <Text style={[styles.earBig, { color: ink }]}>★ {rating}</Text>
              <Text style={[styles.earSmall, { color: ink }]}>RATED</Text>
            </>
          ) : null}
        </View>
      </View>
      <Text style={[styles.dateline, { color: ink }]} numberOfLines={2}>{dateline}</Text>
      <View style={[styles.doubleRuleBottom, { borderColor: ink }]} />

      <Text
        style={[styles.headline, { color: ink }]}
        // Read the name as written, not letter-shouted capitals.
        accessibilityRole="header"
        accessibilityLabel={name}
        numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.5}>
        {name.toUpperCase()}
      </Text>
      {kicker || tick ? (
        <View style={styles.byRow}>
          {kicker ? <Text style={[styles.byline, { color: ink }]} numberOfLines={2}>{kicker.toUpperCase()}</Text> : null}
          {tick}
        </View>
      ) : null}
      {location ? (
        <View style={[styles.barFrame, { borderColor: ink }]}>
          <View style={[styles.bar, { backgroundColor: ink }]}>
            <Text style={[styles.barText, { color: cardColour }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              LOCATED IN {location.toUpperCase()}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    marginHorizontal: 16,
    marginBottom: 18,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 14,
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  doubleRuleTop: { borderTopWidth: 4, borderBottomWidth: 1, height: 7 },
  doubleRuleBottom: { borderTopWidth: 1, borderBottomWidth: 4, height: 7 },
  mastRow: { flexDirection: "row", alignItems: "stretch", borderBottomWidth: 1 },
  ear: { width: 78, alignItems: "center", justifyContent: "center", paddingVertical: 6 },
  earLeft: { borderRightWidth: 1 },
  earRight: { width: 58, borderLeftWidth: 1 },
  earBig: { fontFamily: "Oswald-Bold", fontSize: 13, lineHeight: 17 },
  earSmall: { fontFamily: "Oswald-Medium", fontSize: 9, lineHeight: 12, letterSpacing: 1 },
  mastCentre: { flex: 1, justifyContent: "center", paddingHorizontal: 4, paddingVertical: 2 },
  masthead: {
    fontFamily: "UnifrakturMaguntia-Book",
    fontSize: 32,
    lineHeight: 44,
    textAlign: "center",
  },
  dateline: {
    fontFamily: "Oswald-Medium",
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.8,
    textAlign: "center",
    paddingVertical: 5,
  },
  headline: {
    fontFamily: "Oswald-Bold",
    fontSize: 62,
    lineHeight: 78,
    textAlign: "center",
    marginTop: 6,
  },
  byRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 2 },
  byline: {
    fontFamily: "Oswald-Medium",
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 1.6,
    textAlign: "center",
    flexShrink: 1,
  },
  barFrame: { borderWidth: 1, padding: 3, marginTop: 12 },
  bar: { paddingVertical: 6, paddingHorizontal: 8 },
  barText: {
    fontFamily: "Oswald-Medium",
    fontSize: 13,
    lineHeight: 17,
    letterSpacing: 1.8,
    textAlign: "center",
  },
});

/** A newsprint dot screen laid over a photo (Gazette's portfolio), so the
 *  pictures read as printed halftones. Faint, so the photo still shows. */
export function HalftoneScreen() {
  const id = `dots${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id={id} patternUnits="userSpaceOnUse" width={4} height={4}>
          <Circle cx={2} cy={2} r={0.9} fill="#1F1D1A" />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} opacity={0.22} />
    </Svg>
  );
}
