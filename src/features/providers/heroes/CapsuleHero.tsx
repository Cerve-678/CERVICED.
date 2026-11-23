// Capsule's top (owner's pick 14 from the 2026-11-23 clean-girl round of the
// "range of branding templates" canvas): pilates-studio calm, everything a
// soft pill. Their chosen photo stands in a tall capsule; beside it sit the
// logo, the name in light lowercase, their area and what they do as pill
// chips in the two quiet tones. A full-width Book pill in the ink runs under
// it, then the stars and slots.

import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { blend, isDarkColor } from "../../../constants/providerThemes";
import { HeroPhoto } from "../HeroPhoto";

/** The oat Capsule pairs with the accent's tint (the canvas's "sage and oat"). */
export const CAPSULE_OAT = "#C9B394";

/** Capsule's two quiet tones on a page of this colour: a soft tint of the
 *  accent, then oat, each blended toward the page so it stays as light (or as
 *  dark) as the page and the page's ink still reads on it. */
export function capsuleTones(accent: string, sheet: string): readonly [string, string] {
  const dark = isDarkColor(sheet);
  return [blend(accent, sheet, dark ? 0.5 : 0.55), blend(CAPSULE_OAT, sheet, dark ? 0.72 : 0.6)];
}

/** Ink for something drawn on one of the tones. */
export function capsuleInk(tone: string): { text: string; sub: string } {
  return isDarkColor(tone)
    ? { text: "#EEF1E8", sub: "rgba(238,241,232,0.78)" }
    : { text: "#24291F", sub: "rgba(36,41,31,0.72)" };
}

export function CapsuleHero({
  name,
  kicker,
  location,
  accent,
  sheetColour,
  heroText,
  heroSub,
  photo,
  renderLogo,
  tick,
  details,
  onBookNow,
  onOpenPhoto,
}: {
  name: string;
  /** What they do, "LASHES · BROWS": one chip each. */
  kicker: string;
  location: string;
  accent: string;
  /** The content sheet's colour: the tones are blended toward it. */
  sheetColour: string;
  heroText: string;
  heroSub: string;
  /** Their chosen photo (Branding → Your Photos); none yet draws the capsule in the accent's tint with the logo in it. */
  photo: string | undefined;
  renderLogo: (size: number) => React.ReactNode;
  tick: React.ReactNode;
  details: React.ReactNode;
  /** Jumps to Services. Left out for a link-only provider, and then there's no button. */
  onBookNow?: (() => void) | undefined;
  onOpenPhoto?: (() => void) | undefined;
}) {
  const tones = capsuleTones(accent, sheetColour);
  const chips = kicker.split("·").map(part => part.trim().toLowerCase()).filter(Boolean);
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.capsule, { backgroundColor: tones[0] }]}
          disabled={!photo || !onOpenPhoto}
          onPress={onOpenPhoto}
          accessibilityRole={photo && onOpenPhoto ? "imagebutton" : undefined}
          accessibilityLabel={photo ? `${name} featured work` : undefined}
          activeOpacity={0.88}
        >
          {photo ? <HeroPhoto uri={photo} /> : <View style={styles.capsuleLogo}>{renderLogo(76)}</View>}
        </TouchableOpacity>
        <View style={styles.side}>
          {photo ? renderLogo(44) : null}
          <View accessible accessibilityRole="header" accessibilityLabel={name} style={styles.nameRow}>
            <Text style={[styles.name, { color: heroText }]} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.6}>
              {name.toLowerCase()}
            </Text>
            {tick}
          </View>
          {location ? <Text style={[styles.area, { color: heroSub }]} numberOfLines={1}>{location.toLowerCase()}</Text> : null}
          {chips.length ? (
            <View style={styles.chips}>
              {chips.map((chip, index) => {
                const tone = tones[index % 2]!;
                return (
                  <View key={chip} style={[styles.chip, { backgroundColor: tone }]}>
                    <Text style={[styles.chipText, { color: capsuleInk(tone).text }]} numberOfLines={1}>{chip}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      </View>
      {onBookNow ? (
        <TouchableOpacity
          style={[styles.book, { backgroundColor: heroText }]}
          onPress={onBookNow}
          accessibilityRole="button"
          accessibilityLabel="Book a session"
          activeOpacity={0.85}
        >
          <Text style={[styles.bookText, { color: isDarkColor(heroText) ? "#FAF8F3" : "#26241F" }]}>book a session</Text>
        </TouchableOpacity>
      ) : null}
      <View style={styles.foot}>{details}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 22, paddingTop: 14, paddingBottom: 26, gap: 18 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 16 },
  capsule: { width: 128, height: 210, borderRadius: 999, overflow: "hidden" },
  capsuleLogo: { flex: 1, alignItems: "center", justifyContent: "center" },
  side: { flex: 1, gap: 8, paddingBottom: 6 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { flexShrink: 1, fontFamily: "LeagueSpartan-Light", fontSize: 30, lineHeight: 33, letterSpacing: -0.8 },
  area: { fontFamily: "Figtree-SemiBold", fontSize: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontFamily: "Figtree-SemiBold", fontSize: 11 },
  book: { minHeight: 48, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  bookText: { fontFamily: "Figtree-SemiBold", fontSize: 14 },
  foot: { alignItems: "center" },
});
