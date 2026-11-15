// src/features/providers/heroes/SheerHero.tsx
//
// The Sheer page style's hero (round 4, 2026-11-15): their cover photo or
// colours seen through a see-through black veil, an oval monogram round the
// logo and the name in thin, widely spaced Bellefair caps. (The "How to book"
// box was removed at the owner's request, 2026-11-15.) The veil is always dark, so everything here
// is drawn in white whatever is behind it; the profile and the preview treat a
// veil hero as dark for the same reason (heroIsDarkForStyle).

import React from "react";
import { StyleSheet, Text, View } from "react-native";

/** White ink on the veil, and the lines and panels drawn on it. */
export const VEIL_INK = {
  text: "#FFFFFF",
  sub: "rgba(255,255,255,0.84)",
  line: "rgba(255,255,255,0.5)",
  panel: "rgba(0,0,0,0.28)",
} as const;

/** How dark the veil is: the photo still shows through, but white type reads on any of them. */
const VEIL = "rgba(8,6,6,0.6)";

export function SheerHero({
  name,
  kicker,
  location,
  renderLogo,
  details,
  tick,
}: {
  name: string;
  /** What they do ("LASHES · BROWS"). */
  kicker: string;
  location: string;
  renderLogo: (size: number) => React.ReactNode;
  /** Stars, years and the slots pill (or a link-only provider's Book block). */
  details: React.ReactNode;
  /** The verified tick, when they have one. */
  tick: React.ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      {/* Runs up past the top of the hero and down under the sheet's rounded
          edge, so no strip of bare photo shows at either end. */}
      <View style={styles.veil} pointerEvents="none" />

      <View style={styles.center}>
        <View style={styles.oval}>
          <View style={styles.ovalInner} pointerEvents="none" />
          {renderLogo(70)}
        </View>
        {kicker ? <Text style={styles.kicker} numberOfLines={2}>{kicker}</Text> : null}

        <View style={styles.nameRow} accessible accessibilityRole="header" accessibilityLabel={name}>
          <Text style={styles.name} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.6}>
            {name.toUpperCase()}
          </Text>
          {tick}
        </View>
        {location ? <Text style={styles.location} numberOfLines={2}>{location.toUpperCase()}</Text> : null}
        <View style={styles.details}>{details}</View>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingBottom: 40 },
  veil: { position: "absolute", top: -700, bottom: -60, left: 0, right: 0, backgroundColor: VEIL },
  center: { alignItems: "center" },
  // A tall capsule with a second hairline inside it, round a small logo.
  oval: {
    width: 96, height: 128, borderRadius: 48, borderWidth: 1, borderColor: VEIL_INK.text,
    alignItems: "center", justifyContent: "center",
  },
  ovalInner: {
    position: "absolute", top: 5, left: 5, right: 5, bottom: 5, borderRadius: 43,
    borderWidth: StyleSheet.hairlineWidth, borderColor: VEIL_INK.line,
  },
  kicker: {
    fontFamily: "Jost-Light", fontSize: 11, lineHeight: 16, letterSpacing: 3.2,
    color: VEIL_INK.sub, marginTop: 14, textAlign: "center",
  },
  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 40 },
  name: {
    fontFamily: "Bellefair-Regular", fontSize: 38, lineHeight: 50, letterSpacing: 5,
    color: VEIL_INK.text, textAlign: "center", flexShrink: 1,
  },
  location: {
    fontFamily: "Jost-Light", fontSize: 12, lineHeight: 17, letterSpacing: 3,
    color: VEIL_INK.sub, marginTop: 8, marginBottom: 16, textAlign: "center",
  },
  details: { alignItems: "center", alignSelf: "stretch" },
});
