// src/features/providers/heroes/BoutiqueHero.tsx
//
// The Boutique page style's hero (pageStyles hero 'productPage'): the top of
// the profile reads like a product page in an online boutique. Their logo,
// big, on their colour in a block with rounded top corners; under it, on a panel in
// their Branding card colour with rounded bottom corners, the brand line (name
// and area), the name as the product title, their stars, years and slots,
// and what they do as chips.
//
// Picked by the owner on 2026-11-16 (canvas 6e85xnbB9f2DzbkHrqCLrC, board H),
// replacing the online shop header (board G) from earlier that day. The owner
// then took the portfolio photos out of the top ("no photos, logo on colour"),
// put the panel in their branding and dropped the Add to basket bar.

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { blend, isDarkColor } from "../../../constants/providerThemes";
import { useContentWidth } from '../../../components/ReadableWidth';

/** The panel's ink on their card colour. The stars, years and slots under the
 *  name are inked the same way by the profile (detailsSitOnCard, cardInk). */
export function cardInk(cardColour: string): { text: string; sub: string; rule: string } {
  const text = isDarkColor(cardColour) ? "#F7F1F3" : "#1F1A1C";
  return { text, sub: blend(text, cardColour, 0.35), rule: blend(text, cardColour, 0.8) };
}

/** Height of the colour block as a share of the screen's width. It starts
 *  under the header buttons (ProviderProfileScreen's heroInfoWrap padding)
 *  rather than reaching up to the top edge, so its rounded top corners show,
 *  like the panel's at the foot (owner, 2026-11-16). */
const TOP_RATIO = 0.66;
/** At most this many of what they do show as chips. */
const MAX_CHIPS = 4;

export function BoutiqueHero({
  name,
  location,
  kicker,
  accent,
  cardColour,
  renderLogo,
  details,
  tick,
}: {
  name: string;
  location: string;
  /** What they do, "LASHES · BROWS": the chips. */
  kicker: string;
  accent: string;
  /** Their Branding card colour: the panel. */
  cardColour: string;
  renderLogo: (size: number) => React.ReactNode;
  details: React.ReactNode;
  tick: React.ReactNode;
}) {
  const { width } = useContentWidth();
  const topHeight = Math.round(width * TOP_RATIO);
  const ink = cardInk(cardColour);

  const chips = kicker
    .split("·")
    .map(part => part.trim())
    .filter(Boolean)
    .slice(0, MAX_CHIPS);
  const brandLine = [name, location].filter(Boolean).join(" · ").toUpperCase();

  return (
    <View style={styles.wrap}>
      {/* Their logo, big, on their colour, below the header buttons, rounded at the top. */}
      <View style={[styles.top, { height: topHeight, backgroundColor: accent }]}>
        {renderLogo(120)}
      </View>

      <View style={[styles.panel, { backgroundColor: cardColour }]}>
        {/* The big logo is just above, so the brand line is words only. */}
        <Text style={[styles.brandLine, { color: ink.sub }]} numberOfLines={1}>{brandLine}</Text>
        <View style={styles.titleRow} accessible accessibilityRole="header" accessibilityLabel={name}>
          <Text style={[styles.title, { color: ink.text }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
            {name}
          </Text>
          {tick}
        </View>
        <View style={styles.details}>{details}</View>
        {chips.length > 0 ? (
          <View style={styles.chips}>
            {chips.map(chip => (
              <View key={chip} style={[styles.chip, { borderColor: ink.rule }]}>
                <Text style={[styles.chipText, { color: ink.text }]} numberOfLines={1}>{chip.charAt(0) + chip.slice(1).toLowerCase()}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // A little further down from the header buttons (owner, 2026-11-16).
  wrap: { alignSelf: "stretch", marginTop: 20, marginBottom: 24 },
  // Rounded at the top as the panel is at the foot (owner, 2026-11-16).
  top: {
    alignItems: "center", justifyContent: "center",
    borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden",
  },
  panel: {
    paddingHorizontal: 22, paddingTop: 18, paddingBottom: 22, gap: 10,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
  },
  brandLine: { fontFamily: "Manrope-Bold", fontSize: 9, lineHeight: 13, letterSpacing: 2.6, flexShrink: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontFamily: "DMSerifDisplay-Regular", fontSize: 30, lineHeight: 36, flexShrink: 1 },
  details: { alignItems: "flex-start" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  chip: { borderWidth: 1, paddingVertical: 8, paddingHorizontal: 13 },
  chipText: { fontFamily: "Manrope-Bold", fontSize: 11, lineHeight: 15 },
});
