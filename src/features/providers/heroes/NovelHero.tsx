// src/features/providers/heroes/NovelHero.tsx
//
// The Novel page style's hero (pageStyles hero 'hardback'): the provider's
// profile opens on a cloth-bound book cover. The cloth is their accent pressed
// dark, the logo sits in a foil ring, their name is stamped in gold foil over
// a foil rule, and a ribbon bookmark hangs out of the pages. The elements of a
// hardback, not a literal book (owner, 2026-11-15), from the round-4 canvas
// https://claude.ai/artifact/68xp8mxLLTCV6pVuiQHJZS.

import React, { useId } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Pattern,
  Polygon,
  Rect,
  Stop,
} from "react-native-svg";

import { blend, isDarkColor } from "../../../constants/providerThemes";

/** Gold foil: a physical finish, so it's the same on every colour set. */
const FOIL = "#D6B46E";
const PAGE_EDGE = "#F4EDDD";
const PAGE_LINE = "#D9CDB5";

const COVER_W = 232;
const COVER_H = 300;

/** The cloth: the accent pressed dark enough for gold foil to read on it. */
export function clothColour(accent: string): string {
  return isDarkColor(accent) ? blend(accent, "#000000", 0.18) : blend(accent, "#000000", 0.58);
}

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
  accent,
  renderLogo,
  details,
  isVerified,
}: {
  name: string;
  kicker: string;
  location: string;
  accent: string;
  renderLogo: (size: number) => React.ReactNode;
  details: React.ReactNode;
  isVerified?: boolean | undefined;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const cloth = clothColour(accent);
  const ribbon = blend(accent, "#FFFFFF", isDarkColor(accent) ? 0.22 : 0.05);
  const line = subtitle(kicker);

  return (
    <View style={styles.wrap}>
      <View style={styles.book}>
        {/* The page block: its right and bottom edges show past the cover. */}
        <View style={styles.pages}>
          <Svg width="100%" height="100%" pointerEvents="none">
            <Defs>
              <Pattern id={`leaves${id}`} width={2} height={2} patternUnits="userSpaceOnUse">
                <Rect width={1} height={2} fill={PAGE_EDGE} />
                <Rect x={1} width={1} height={2} fill={PAGE_LINE} />
              </Pattern>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#leaves${id})`} />
          </Svg>
        </View>

        <View style={[styles.cover, { backgroundColor: cloth }]}>
          {/* Cloth weave: two fine diagonal hatchings, one light, one dark. */}
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <Pattern id={`weave${id}`} width={3} height={3} patternUnits="userSpaceOnUse">
                <Path d="M0 3L3 0" stroke="rgba(255,255,255,0.07)" strokeWidth={0.8} />
                <Path d="M0 0L3 3" stroke="rgba(0,0,0,0.16)" strokeWidth={0.8} />
              </Pattern>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#weave${id})`} />
          </Svg>
          {/* The hinge where the cover meets the spine. */}
          <LinearGradient
            colors={["rgba(0,0,0,0.38)", "rgba(255,255,255,0.08)", "rgba(0,0,0,0.25)", "transparent"]}
            locations={[0, 0.55, 0.8, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.hinge}
            pointerEvents="none"
          />
          <View style={[styles.frame, styles.frameOuter]} pointerEvents="none" />
          <View style={[styles.frame, styles.frameInner]} pointerEvents="none" />

          <View style={styles.coverText}>
            <View style={styles.logoRing}>{renderLogo(62)}</View>
            <View style={styles.nameRow} accessible accessibilityRole="header" accessibilityLabel={name}>
              <Text style={styles.name} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.55}>
                {name}
              </Text>
              {isVerified ? <Ionicons name="checkmark-circle" size={16} color={FOIL} accessibilityLabel="Verified" /> : null}
            </View>
            <Svg width={120} height={14} viewBox="0 0 120 14" pointerEvents="none">
              <Path d="M4 7h44M72 7h44" stroke={FOIL} strokeWidth={1} />
              <Path d="M60 1l6 6-6 6-6-6z" fill={FOIL} />
              <Circle cx={50} cy={7} r={1.6} fill={FOIL} />
              <Circle cx={70} cy={7} r={1.6} fill={FOIL} />
            </Svg>
            {line ? <Text style={styles.subtitle} numberOfLines={2}>{line}</Text> : null}
            {location ? <Text style={styles.location} numberOfLines={2}>{location.toUpperCase()}</Text> : null}
          </View>
        </View>

        {/* The ribbon bookmark hanging out from between the pages. */}
        <View style={styles.ribbon} pointerEvents="none">
          <Svg width={16} height={58} viewBox="0 0 16 58">
            <Defs>
              <SvgLinearGradient id={`ribbon${id}`} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={ribbon} />
                <Stop offset="0.5" stopColor={blend(ribbon, "#FFFFFF", 0.25)} />
                <Stop offset="1" stopColor={ribbon} />
              </SvgLinearGradient>
            </Defs>
            <Polygon points="0,0 16,0 16,58 8,47 0,58" fill={`url(#ribbon${id})`} />
          </Svg>
        </View>
      </View>
      <View style={styles.details}>{details}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", marginTop: 8, marginBottom: 30, paddingHorizontal: 20 },
  book: { width: COVER_W + 14, height: COVER_H + 60 },
  pages: {
    position: "absolute", left: 12, top: 6, width: COVER_W, height: COVER_H,
    borderTopRightRadius: 4, borderBottomRightRadius: 4, overflow: "hidden",
    shadowColor: "#000000", shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 12 },
    elevation: 6, backgroundColor: PAGE_EDGE,
  },
  cover: {
    position: "absolute", left: 0, top: 0, width: COVER_W, height: COVER_H - 2,
    borderTopLeftRadius: 3, borderBottomLeftRadius: 3, borderTopRightRadius: 5, borderBottomRightRadius: 5,
    overflow: "hidden", elevation: 7,
  },
  hinge: { position: "absolute", left: 0, top: 0, bottom: 0, width: 20 },
  frame: { position: "absolute", borderWidth: 1, borderColor: FOIL },
  frameOuter: { left: 30, right: 12, top: 12, bottom: 12, opacity: 0.8 },
  frameInner: { left: 34, right: 16, top: 16, bottom: 16, opacity: 0.45 },
  coverText: {
    position: "absolute", left: 38, right: 20, top: 22, bottom: 22,
    alignItems: "center", justifyContent: "center", gap: 8,
  },
  logoRing: { padding: 3, borderRadius: 40, borderWidth: 1.5, borderColor: FOIL },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "100%" },
  name: {
    fontFamily: "IMFellEnglish-Regular", fontSize: 30, lineHeight: 39, color: FOIL, textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.45)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0,
    flexShrink: 1,
  },
  subtitle: { fontFamily: "IMFellEnglish-Italic", fontSize: 15, lineHeight: 20, color: FOIL, textAlign: "center" },
  location: { fontFamily: "IMFellEnglishSC-Regular", fontSize: 10.5, lineHeight: 14, letterSpacing: 3, color: FOIL, textAlign: "center", marginTop: 6 },
  ribbon: { position: "absolute", left: 164, top: COVER_H - 6, elevation: 8 },
  details: { alignItems: "center", marginTop: 4 },
});
