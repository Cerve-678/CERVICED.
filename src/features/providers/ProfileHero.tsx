// src/features/providers/ProfileHero.tsx
//
// Pieces of the public profile's hero that the profile and Branding's preview
// both draw, so the preview can't drift from what clients actually see: the
// logo in its page-style frame, Cover's pills, and the business name's size.

import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { LogoCircle } from "../../components/FramedLogo";
import type { PageStyle } from "../../constants/pageStyles";
import { blend, withAlpha } from "../../constants/providerThemes";
import type { LogoFraming } from "../../types/database";

/** The business name under the logo; a thin script is drawn larger than
 *  this (see resolveProviderFontScale), and Cover larger still (nameScale). */
export const HERO_NAME_SIZE = 30;
export const HERO_NAME_LINE_HEIGHT = 40;

/** Up to two initials, for a provider with no logo. */
export function logoInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map(word => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * The logo in the hero, in the page style's frame: Scrapbook mounts it as a
 * polaroid, Spa adds a fine outer ring, Glossy a shiny one, Arch and Framed
 * round only its top. Without a logo it shows the initials on the accent.
 */
export function HeroLogo({
  uri,
  framing,
  name,
  fallbackColor,
  accent,
  heroText,
  pageStyle,
  onPress,
  accessibilityLabel,
}: {
  uri: string | null | undefined;
  framing?: LogoFraming | null;
  name: string;
  fallbackColor: string;
  accent: string;
  /** The hero's text colour; Spa's outer ring follows it. */
  heroText: string;
  pageStyle: PageStyle;
  /** Tap to see the logo in full. Left out in the preview. */
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const frame =
    pageStyle.logo === "arch"
      ? styles.arch
      : pageStyle.logo === "polaroid"
        ? styles.polaroidPhoto
        : pageStyle.logo === "doubleRing" || pageStyle.logo === "glossRing"
          ? styles.thinRim
          : null;

  const logo = uri ? (
    <LogoCircle uri={uri} framing={framing} style={[styles.logo, frame]} />
  ) : (
    <View style={[styles.logo, frame, styles.initialsWrap, { backgroundColor: fallbackColor }]}>
      <Text style={styles.initials}>{logoInitials(name)}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={pageStyle.logo === "polaroid" ? styles.polaroid : undefined}>
        <View style={styles.wrapper}>
          {pageStyle.logo === "glossRing" ? (
            <LinearGradient
              colors={["#FFFFFF", blend(accent, "#FFFFFF", 0.45), "#FFFFFF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.glossRing}
              pointerEvents="none"
            />
          ) : null}
          {pageStyle.logo === "doubleRing" ? (
            <View style={[styles.doubleRing, { borderColor: withAlpha(heroText, 0.7) }]} pointerEvents="none" />
          ) : null}
          {uri && onPress ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onPress}
              accessibilityRole="imagebutton"
              accessibilityLabel={accessibilityLabel}
            >
              {logo}
            </TouchableOpacity>
          ) : (
            logo
          )}
          {/* Sits on top of the logo, so it must let taps through. */}
          <LinearGradient
            colors={["rgba(255,255,255,0.3)", "transparent"]}
            style={[styles.gloss, frame]}
            pointerEvents="none"
          />
        </View>
      </View>
    </View>
  );
}

/** Cover's white pills under the name. */
export function HeroPills({ labels }: { labels: readonly string[] }) {
  return (
    <View style={styles.pillRow}>
      {labels.map(label => (
        <View key={label} style={styles.pill}>
          <Text style={styles.pillText} numberOfLines={1}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", marginBottom: 20, marginTop: 0 },
  wrapper: { position: "relative", width: 148, height: 148 },
  logo: {
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 4,
    borderColor: "rgba(255, 253, 251, 0.9)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 10,
  },
  gloss: { position: "absolute", top: 0, left: 0, width: 148, height: 148, borderRadius: 74 },
  initialsWrap: { alignItems: "center", justifyContent: "center" },
  initials: { color: "#fff", fontSize: 28, fontWeight: "800" },
  arch: { borderRadius: 10, borderTopLeftRadius: 74, borderTopRightRadius: 74 },
  polaroidPhoto: { borderRadius: 0, borderWidth: 0, shadowOpacity: 0, elevation: 0 },
  thinRim: { borderWidth: 2 },
  polaroid: {
    backgroundColor: "#FFFFFF",
    padding: 8,
    paddingBottom: 30,
    transform: [{ rotate: "-3deg" }],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 8,
  },
  glossRing: { position: "absolute", top: -8, left: -8, width: 164, height: 164, borderRadius: 82 },
  doubleRing: { position: "absolute", top: -11, left: -11, width: 170, height: 170, borderRadius: 85, borderWidth: 1.5 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, paddingHorizontal: 24, marginBottom: 12 },
  pill: { height: 28, paddingHorizontal: 12, borderRadius: 100, backgroundColor: "#FFFFFF", justifyContent: "center", maxWidth: 220 },
  pillText: { fontFamily: "BakbakOne-Regular", fontSize: 10, letterSpacing: 1, color: "#1F1A18" },
});
