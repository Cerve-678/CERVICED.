// src/features/providers/heroes/NovelHero.tsx
//
// The Novel page style's hero (pageStyles hero 'titlePage'): a book's title
// page set straight on their backdrop. There's no drawn object: the logo in a
// fine double ring, a small-caps line, the name in IM Fell English, an
// ornament (rule, diamond, rule) in the accent, what they do in italic, and
// their area in spaced small caps. It replaced a cloth-bound book cover that
// the owner didn't like (2026-11-15).

import React from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

/** What they do, as the book's subtitle: "LASHES · BROWS" → "Lashes & Brows". */
function subtitle(kicker: string): string {
  const parts = kicker.split("·").map(part => part.trim()).filter(Boolean);
  if (parts.length === 0) return "";
  const words = parts.map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
  return words.length === 1 ? words[0]! : `${words.slice(0, -1).join(", ")} & ${words[words.length - 1]}`;
}

export function NovelHero({
  name,
  kicker,
  location,
  heroText,
  heroSub,
  heroAccent,
  shadow,
  renderLogo,
  details,
  tick,
}: {
  name: string;
  kicker: string;
  location: string;
  heroText: string;
  heroSub: string;
  /** The accent, lifted when the hero is dark so the ornament still reads. */
  heroAccent: string;
  /** The hero's text shadow over a dark photo, or null. */
  shadow: TextStyle | null;
  renderLogo: (size: number) => React.ReactNode;
  details: React.ReactNode;
  tick: React.ReactNode;
}) {
  const line = subtitle(kicker);
  return (
    <View style={styles.wrap}>
      <View style={[styles.ringOuter, { borderColor: heroAccent }]}>
        <View style={[styles.ringInner, { borderColor: heroAccent }]}>
          {/* HeroLogo keeps 20pt under itself; the ring shouldn't. */}
          <View style={styles.logoNoGap}>{renderLogo(84)}</View>
        </View>
      </View>

      <Text style={[styles.overline, { color: heroSub }, shadow]}>THE BOOKING PAGE OF</Text>
      <View style={styles.nameRow} accessible accessibilityRole="header" accessibilityLabel={name}>
        <Text style={[styles.name, { color: heroText }, shadow]} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.55}>
          {name}
        </Text>
        {tick}
      </View>

      <Svg width={150} height={14} viewBox="0 0 150 14" pointerEvents="none" style={styles.ornament}>
        <Path d="M4 7h56M90 7h56" stroke={heroAccent} strokeWidth={1} />
        <Path d="M75 1l6 6-6 6-6-6z" fill={heroAccent} />
        <Circle cx={63} cy={7} r={1.6} fill={heroAccent} />
        <Circle cx={87} cy={7} r={1.6} fill={heroAccent} />
      </Svg>

      {line ? <Text style={[styles.subtitle, { color: heroText }, shadow]} numberOfLines={2}>{line}</Text> : null}
      {location ? <Text style={[styles.location, { color: heroSub }, shadow]} numberOfLines={2}>{location.toUpperCase()}</Text> : null}
      <View style={styles.details}>{details}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", marginTop: 8, marginBottom: 30, paddingHorizontal: 24 },
  ringOuter: { padding: 3, borderRadius: 60, borderWidth: 1 },
  ringInner: { padding: 4, borderRadius: 56, borderWidth: StyleSheet.hairlineWidth },
  logoNoGap: { marginBottom: -20 },
  overline: { fontFamily: "IMFellEnglishSC-Regular", fontSize: 12, lineHeight: 17, letterSpacing: 3.4, marginTop: 18, textAlign: "center" },
  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4, maxWidth: "100%" },
  // IM Fell's tall ascenders: 1.3x keeps their tops from being cropped.
  name: { fontFamily: "IMFellEnglish-Regular", fontSize: 40, lineHeight: 52, textAlign: "center", flexShrink: 1 },
  ornament: { marginTop: 8 },
  subtitle: { fontFamily: "IMFellEnglish-Italic", fontSize: 18, lineHeight: 24, marginTop: 8, textAlign: "center" },
  location: { fontFamily: "IMFellEnglishSC-Regular", fontSize: 11, lineHeight: 15, letterSpacing: 3, marginTop: 8, textAlign: "center" },
  details: { alignItems: "center", alignSelf: "stretch", marginTop: 16 },
});
