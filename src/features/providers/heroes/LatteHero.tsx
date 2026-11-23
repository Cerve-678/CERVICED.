// Latte's top (owner's pick 11 from the 2026-11-23 clean-girl round of the
// "range of branding templates" canvas): a tonal pour. Every section sits on
// a band one shade deeper than the one above, milk → oat → latte → mocha →
// espresso down the page, each band's rounded top lapping over the one above,
// the ink turning light on the deep ones. A dark page pours the other way,
// espresso at the top. This top is the first, palest band: a round photo, the
// name huge in an italic serif, what they do and where in spaced caps.

import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import type { PageSectionKey } from "../../../constants/pageStyles";
import { blend, isDarkColor } from "../../../constants/providerThemes";
import { HeroPhoto } from "../HeroPhoto";

/** The five shades of the pour, top of the page first, from the accent. On a
 *  dark page they run the other way: espresso at the top, milk at the foot. */
export function latteStops(accent: string, sheet: string): readonly [string, string, string, string, string] {
  return isDarkColor(sheet)
    ? [blend(accent, "#000000", 0.78), blend(accent, "#000000", 0.65), blend(accent, "#000000", 0.48), blend(accent, "#000000", 0.25), blend(accent, "#FFFFFF", 0.82)]
    : [blend(accent, "#FFFFFF", 0.9), blend(accent, "#FFFFFF", 0.7), blend(accent, "#FFFFFF", 0.45), blend(accent, "#000000", 0.15), blend(accent, "#000000", 0.62)];
}

/** How far down the pour each section sits (0 the top, 1 the Book bar at the
 *  foot), in the order the profile draws them (ProviderPageSheet): About,
 *  Policies, Services, the policy pictures, Reviews, Contact, Hours, the
 *  portfolio, Additional Information, then the provider's own sections. Each
 *  is a step deeper than the one before, whichever of them a page has. */
export const LATTE_POUR: Record<PageSectionKey, number> = {
  about: 0.12,
  policies: 0.22,
  services: 0.32,
  policyPages: 0.4,
  reviews: 0.48,
  contact: 0.56,
  hours: 0.63,
  portfolio: 0.7,
  info: 0.77,
  specialities: 0.77,
  keyInfo: 0.82,
  faq: 0.86,
  aftercare: 0.9,
  custom: 0.93,
  disclaimer: 0.96,
};

/** The shade `t` of the way down the pour (0 the top band, 1 the foot). */
export function latteShade(accent: string, sheet: string, t: number): string {
  const stops = latteStops(accent, sheet);
  const at = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
  const from = Math.floor(at);
  if (from >= stops.length - 1) return stops[stops.length - 1]!;
  return blend(stops[from]!, stops[from + 1]!, at - from);
}

/** A section's band. */
export function latteBand(accent: string, sheet: string, section: PageSectionKey): string {
  return latteShade(accent, sheet, LATTE_POUR[section]);
}

/** The ink on a band: dark on the pale ones, light on the deep ones. */
export function latteInk(band: string): { text: string; sub: string } {
  return isDarkColor(band)
    ? { text: "#FBF6F0", sub: "rgba(251,246,240,0.78)" }
    : { text: "#2A1F19", sub: "rgba(42,31,25,0.72)" };
}

/** The soft see-through pill a service sits in, on its band. */
export function latteGlass(band: string): string {
  return isDarkColor(band) ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.55)";
}

/** How far each band's rounded top laps over the band above it. */
export const LATTE_OVERLAP = 18;

/** How far the top band reaches up behind the profile's top padding. */
const BAND_REACH = 140;
/** How far it reaches down behind the top of the content sheet, which rises over the hero with round corners. */
const BAND_UNDER = 60;

export function LatteHero({
  name,
  kicker,
  location,
  accent,
  sheetColour,
  photo,
  renderLogo,
  tick,
  details,
  onOpenPhoto,
}: {
  name: string;
  /** What they do, "LASHES · BROWS". */
  kicker: string;
  location: string;
  accent: string;
  sheetColour: string;
  /** Their chosen photo (Branding → Your Photos); none yet puts the logo in the circle. */
  photo: string | undefined;
  renderLogo: (size: number) => React.ReactNode;
  tick: React.ReactNode;
  details: React.ReactNode;
  onOpenPhoto?: (() => void) | undefined;
}) {
  const band = latteShade(accent, sheetColour, 0);
  const ink = latteInk(band);
  const caps = [kicker.split("·").map(part => part.trim()).filter(Boolean).join(" & "), location].filter(Boolean).join(" · ").toUpperCase();
  return (
    <View style={styles.wrap}>
      <View style={[styles.band, { backgroundColor: band }]} pointerEvents="none" />
      {photo ? (
        <TouchableOpacity
          style={[styles.photo, { backgroundColor: latteShade(accent, sheetColour, 0.4) }]}
          disabled={!onOpenPhoto}
          onPress={onOpenPhoto}
          accessibilityRole={onOpenPhoto ? "imagebutton" : undefined}
          accessibilityLabel={`${name} featured work`}
          activeOpacity={0.88}
        >
          <HeroPhoto uri={photo} />
        </TouchableOpacity>
      ) : (
        renderLogo(118)
      )}
      <View accessible accessibilityRole="header" accessibilityLabel={name} style={styles.nameRow}>
        <Text style={[styles.name, { color: ink.text }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.55}>
          {name}
        </Text>
        {tick}
      </View>
      {caps ? <Text style={[styles.caps, { color: ink.text }]} numberOfLines={2}>{caps}</Text> : null}
      <View style={styles.foot}>{details}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingHorizontal: 24, paddingTop: 14, paddingBottom: 34, gap: 8 },
  // Up behind the top padding, and down behind the sheet's rounded corners.
  band: { position: "absolute", top: -BAND_REACH, left: 0, right: 0, bottom: -BAND_UNDER },
  photo: { width: 118, height: 118, borderRadius: 59, overflow: "hidden" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%", marginTop: 4 },
  name: { flexShrink: 1, fontFamily: "InstrumentSerif-Italic", fontSize: 52, lineHeight: 58, textAlign: "center" },
  caps: { fontFamily: "HankenGrotesk-Medium", fontSize: 12, letterSpacing: 3, textAlign: "center" },
  foot: { alignItems: "center", marginTop: 6 },
});
