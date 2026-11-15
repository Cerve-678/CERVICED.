// src/features/providers/heroes/GazetteHero.tsx
//
// The Gazette page style's hero (round 4, 2026-11-15): the top of the profile
// as a newspaper front page laid over their photo or colours. A blackletter
// masthead with their name and the logo in the left "ear", a dateline of
// today's date and their area, what they do as the banner headline, "BY" their
// name, and an inverse "Located in" bar. Everything on it is real: the date is
// today's, the edition is their area, the ear is their rating (or nothing).
//
// The sheet is newsprint, a physical object, so its paper and ink are fixed
// whatever the theme (as Apothecary's tag and Quiet's band are).

import React, { useId, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, Pattern, Rect } from "react-native-svg";

/** Newsprint and its ink. */
export const GAZETTE_PAPER = "#EEEBE4";
export const GAZETTE_INK = "#1F1D1A";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "Saturday 15 November 2026". Built by hand so it never depends on Intl. */
export function gazetteDate(date: Date): string {
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** The masthead: "The Amara Gazette", or the name alone when that would be long. */
export function gazetteMasthead(name: string): string {
  const trimmed = name.trim();
  return trimmed.length <= 16 ? `The ${trimmed} Gazette` : trimmed;
}

/** The banner headline: the first thing they do ("LASHES · BROWS" → "LASHES"). */
export function gazetteHeadline(kicker: string): string {
  return (kicker.split("·")[0] ?? "").trim().toUpperCase();
}

export function GazetteHero({
  name,
  kicker,
  location,
  rating,
  logo,
  tick,
}: {
  name: string;
  kicker: string;
  location: string;
  /** Their star rating, for the right ear. Left out with no CERVICED reviews. */
  rating?: string | null | undefined;
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
  const headline = gazetteHeadline(kicker);

  return (
    <View style={styles.sheet}>
      <View style={styles.doubleRuleTop} />
      <View style={styles.mastRow}>
        <View style={[styles.ear, styles.earLeft]}>{logo}</View>
        <View style={styles.mastCentre} accessible accessibilityRole="header" accessibilityLabel={name}>
          <Text style={styles.masthead} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.55}>
            {gazetteMasthead(name)}
          </Text>
        </View>
        <View style={[styles.ear, styles.earRight]}>
          {rating ? (
            <>
              <Text style={styles.earBig}>★ {rating}</Text>
              <Text style={styles.earSmall}>RATED</Text>
            </>
          ) : null}
        </View>
      </View>
      <Text style={styles.dateline} numberOfLines={2}>{dateline}</Text>
      <View style={styles.doubleRuleBottom} />

      {headline ? (
        <Text style={styles.headline} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.4}>
          {headline}
        </Text>
      ) : null}
      <View style={styles.byRow}>
        <Text style={styles.byline} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
          BY {name.toUpperCase()}
        </Text>
        {tick}
      </View>
      {location ? (
        <View style={styles.barFrame}>
          <View style={styles.bar}>
            <Text style={styles.barText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              LOCATED IN {location.toUpperCase()}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const RULE = GAZETTE_INK;

const styles = StyleSheet.create({
  sheet: {
    marginHorizontal: 16,
    marginBottom: 18,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: GAZETTE_PAPER,
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  doubleRuleTop: { borderTopWidth: 4, borderBottomWidth: 1, borderColor: RULE, height: 7 },
  doubleRuleBottom: { borderTopWidth: 1, borderBottomWidth: 4, borderColor: RULE, height: 7 },
  mastRow: { flexDirection: "row", alignItems: "stretch", borderBottomWidth: 1, borderBottomColor: RULE },
  ear: { width: 58, alignItems: "center", justifyContent: "center", paddingVertical: 6 },
  earLeft: { borderRightWidth: 1, borderRightColor: RULE },
  earRight: { borderLeftWidth: 1, borderLeftColor: RULE },
  earBig: { fontFamily: "Oswald-Bold", fontSize: 13, lineHeight: 17, color: GAZETTE_INK },
  earSmall: { fontFamily: "Oswald-Medium", fontSize: 9, lineHeight: 12, letterSpacing: 1, color: GAZETTE_INK },
  mastCentre: { flex: 1, justifyContent: "center", paddingHorizontal: 6, paddingVertical: 2 },
  masthead: {
    fontFamily: "UnifrakturMaguntia-Book",
    fontSize: 30,
    lineHeight: 42,
    textAlign: "center",
    color: GAZETTE_INK,
  },
  dateline: {
    fontFamily: "Oswald-Medium",
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.8,
    textAlign: "center",
    color: GAZETTE_INK,
    paddingVertical: 5,
  },
  headline: {
    fontFamily: "Oswald-Bold",
    fontSize: 84,
    lineHeight: 108,
    textAlign: "center",
    color: GAZETTE_INK,
    marginTop: 2,
  },
  byRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: -10 },
  byline: {
    fontFamily: "Oswald-Medium",
    fontSize: 19,
    lineHeight: 25,
    letterSpacing: 2.4,
    textAlign: "center",
    color: GAZETTE_INK,
    flexShrink: 1,
  },
  barFrame: { borderWidth: 1, borderColor: RULE, padding: 3, marginTop: 12 },
  bar: { backgroundColor: GAZETTE_INK, paddingVertical: 6, paddingHorizontal: 8 },
  barText: {
    fontFamily: "Oswald-Medium",
    fontSize: 13,
    lineHeight: 17,
    letterSpacing: 1.8,
    textAlign: "center",
    color: GAZETTE_PAPER,
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
