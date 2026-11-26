// Capsule's top (owner's pick 14 from the 2026-11-23 clean-girl round of the
// "range of branding templates" canvas): pilates-studio calm, everything a
// soft pill. Their chosen photo stands in a tall capsule; beside it sit the
// logo with the name in light lowercase to its right, their area and what
// they do as pill chips in the two tones, then the stars and slots. No Book
// button in the top: the page's own Book buttons cover it (owner, 11-23).

import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { blend, isDarkColor } from "../../../constants/providerThemes";
import { HeroPhoto } from "../HeroPhoto";
import { tr } from '../../../i18n';
import { useTranslation } from '../../../i18n';

/** Capsule's two tones, both from the provider's own chosen colours: a soft
 *  tint of their accent (blended toward the page so it stays as light, or as
 *  dark, as the page), then their card colour exactly as picked. */
export function capsuleTones(accent: string, sheet: string, card: string): readonly [string, string] {
  return [blend(accent, sheet, isDarkColor(sheet) ? 0.5 : 0.55), card];
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
  cardColour,
  heroText,
  heroSub,
  photo,
  renderLogo,
  tick,
  details,
  onOpenPhoto,
}: {
  name: string;
  /** What they do, "LASHES · BROWS": one chip each. */
  kicker: string;
  location: string;
  accent: string;
  /** The content sheet's colour: the tones are blended toward it. */
  sheetColour: string;
  /** Their chosen card colour: the second tone. */
  cardColour: string;
  heroText: string;
  heroSub: string;
  /** Their chosen photo (Branding → Your Photos); none yet draws the capsule in the accent's tint with the logo in it. */
  photo: string | undefined;
  renderLogo: (size: number) => React.ReactNode;
  tick: React.ReactNode;
  details: React.ReactNode;
  onOpenPhoto?: (() => void) | undefined;
}) {
  // Re-render when the language changes (the text below uses tr()).
  useTranslation();
  const tones = capsuleTones(accent, sheetColour, cardColour);
  const chips = kicker.split("·").map(part => part.trim().toLowerCase()).filter(Boolean);
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.capsule, { backgroundColor: tones[0] }]}
          disabled={!photo || !onOpenPhoto}
          onPress={onOpenPhoto}
          accessibilityRole={photo && onOpenPhoto ? "imagebutton" : undefined}
          accessibilityLabel={photo ? tr('discover.page.featuredWork', { name }) : undefined}
          activeOpacity={0.88}
        >
          {photo ? <HeroPhoto uri={photo} /> : <View style={styles.capsuleLogo}>{renderLogo(84)}</View>}
        </TouchableOpacity>
        <View style={styles.side}>
          <View style={styles.nameRow}>
            {photo ? renderLogo(54) : null}
            <View accessible accessibilityRole="header" accessibilityLabel={name} style={styles.nameAndTick}>
              <Text style={[styles.name, { color: heroText }]} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.6}>
                {name.toLowerCase()}
              </Text>
              {tick}
            </View>
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
      <View style={styles.foot}>{details}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 22, paddingTop: 14, paddingBottom: 26, gap: 18 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 16 },
  capsule: { width: 142, height: 232, borderRadius: 999, overflow: "hidden" },
  capsuleLogo: { flex: 1, alignItems: "center", justifyContent: "center" },
  side: { flex: 1, gap: 8, paddingBottom: 6 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  nameAndTick: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  name: { flexShrink: 1, fontFamily: "LeagueSpartan-Light", fontSize: 30, lineHeight: 33, letterSpacing: -0.8 },
  area: { fontFamily: "Figtree-SemiBold", fontSize: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontFamily: "Figtree-SemiBold", fontSize: 11 },
  foot: { alignItems: "center" },
});
