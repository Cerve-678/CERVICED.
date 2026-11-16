// src/features/providers/heroes/BoutiqueHero.tsx
//
// The Boutique page style's hero (pageStyles hero 'productPage'): the top of
// the profile reads like a product page in an online boutique. Their portfolio
// photos fill the top edge to edge, to swipe through with a "1 / 3" count and
// dots; under them, on a white panel, the brand line (logo, name, area), the
// name as the product title, their stars, years and slots, what they do as
// chips, and an Add to basket bar that jumps to Services.
//
// Picked by the owner on 2026-11-16 (canvas 6e85xnbB9f2DzbkHrqCLrC, board H),
// replacing the online shop header (board G) from earlier that day.

import React, { useCallback, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Image } from "expo-image";

import { blend } from "../../../constants/providerThemes";

/** The panel is a product page's white, whatever the theme, so the details
 *  under the name use ProfileHero's on-card ink (detailsSitOnCard). */
const PRODUCT_PANEL = "#FFFFFF";
const INK = "#1F1A1C";
const MUTED = "#6A5A60";
const RULE = "rgba(31,26,28,0.16)";
/** The photos sit this far up, under the header buttons, to reach the top edge
 *  (the hero is laid out below ProviderProfileScreen's heroInfoWrap padding). */
const BLEED_UP = 100;
/** Height of the photos as a share of the screen's width. */
const PHOTO_RATIO = 0.95;
/** At most this many of what they do show as chips. */
const MAX_CHIPS = 4;

export function BoutiqueHero({
  name,
  location,
  kicker,
  accent,
  photoUris,
  renderLogo,
  details,
  tick,
  onBookNow,
}: {
  name: string;
  location: string;
  /** What they do, "LASHES · BROWS": the chips. */
  kicker: string;
  accent: string;
  /** Their portfolio photos, newest first; empty when they have none yet. */
  photoUris: readonly string[];
  renderLogo: (size: number) => React.ReactNode;
  details: React.ReactNode;
  tick: React.ReactNode;
  /** Jumps to Services. Left out where there's nothing to jump to (a
   *  link-only provider books elsewhere), and then there's no bar. */
  onBookNow?: (() => void) | undefined;
}) {
  const { width } = useWindowDimensions();
  const photoHeight = Math.round(width * PHOTO_RATIO);
  const [page, setPage] = useState(0);
  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      setPage(Math.round(e.nativeEvent.contentOffset.x / Math.max(width, 1)));
    },
    [width],
  );

  const chips = kicker
    .split("·")
    .map(part => part.trim())
    .filter(Boolean)
    .slice(0, MAX_CHIPS);
  const brandLine = [name, location].filter(Boolean).join(" · ").toUpperCase();

  return (
    <View style={styles.wrap}>
      <View style={[styles.photos, { width, height: photoHeight, backgroundColor: accent }]}>
        {photoUris.length > 0 ? (
          <>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onScrollEnd}
              scrollEnabled={photoUris.length > 1}
            >
              {photoUris.map((uri, i) => (
                <Image
                  key={uri}
                  source={{ uri }}
                  style={{ width, height: photoHeight }}
                  contentFit="cover"
                  transition={0}
                  accessibilityLabel={`Photo ${i + 1} of ${photoUris.length} of their work`}
                />
              ))}
            </ScrollView>
            {photoUris.length > 1 ? (
              <>
                <View style={styles.count} pointerEvents="none">
                  <Text style={styles.countText}>{`${page + 1} / ${photoUris.length}`}</Text>
                </View>
                <View style={styles.dots} pointerEvents="none">
                  {photoUris.map((uri, i) => (
                    <View key={uri} style={[styles.dot, i === page ? styles.dotOn : null]} />
                  ))}
                </View>
              </>
            ) : null}
          </>
        ) : (
          // No photos yet: their logo on their colour, below the header buttons.
          <View style={styles.noPhoto}>{renderLogo(110)}</View>
        )}
      </View>

      <View style={styles.panel}>
        <View style={styles.brandRow}>
          {/* HeroLogo keeps 20pt under itself; the brand row shouldn't. */}
          <View style={styles.logoNoGap}>{renderLogo(26)}</View>
          <Text style={styles.brandLine} numberOfLines={1}>{brandLine}</Text>
        </View>
        <View style={styles.titleRow} accessible accessibilityRole="header" accessibilityLabel={name}>
          <Text style={styles.title} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
            {name}
          </Text>
          {tick}
        </View>
        <View style={styles.details}>{details}</View>
        {chips.length > 0 ? (
          <View style={styles.chips}>
            {chips.map(chip => (
              <View key={chip} style={styles.chip}>
                <Text style={styles.chipText} numberOfLines={1}>{chip.charAt(0) + chip.slice(1).toLowerCase()}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {onBookNow ? (
          <TouchableOpacity
            style={[styles.addToBasket, { backgroundColor: blend(accent, INK, 0.55) }]}
            onPress={onBookNow}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Add to basket. Go to services"
          >
            <Text style={styles.addToBasketText}>ADD TO BASKET</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "stretch", marginTop: -BLEED_UP, marginBottom: 24 },
  photos: { overflow: "hidden" },
  noPhoto: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: BLEED_UP / 2 },
  count: {
    position: "absolute", right: 14, bottom: 14,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.38)",
  },
  countText: { fontFamily: "Manrope-Bold", fontSize: 10, lineHeight: 14, color: "#FFFFFF" },
  dots: { position: "absolute", left: 0, right: 0, bottom: 18, flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.55)" },
  dotOn: { width: 18, backgroundColor: "#FFFFFF" },
  panel: { backgroundColor: PRODUCT_PANEL, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 22, gap: 10 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoNoGap: { marginBottom: -20 },
  brandLine: { fontFamily: "Manrope-Bold", fontSize: 9, lineHeight: 13, letterSpacing: 2.6, color: MUTED, flexShrink: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontFamily: "DMSerifDisplay-Regular", fontSize: 30, lineHeight: 36, color: INK, flexShrink: 1 },
  details: { alignItems: "flex-start" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  chip: { borderWidth: 1, borderColor: RULE, paddingVertical: 8, paddingHorizontal: 13 },
  chipText: { fontFamily: "Manrope-Bold", fontSize: 11, lineHeight: 15, color: INK },
  addToBasket: { height: 50, alignItems: "center", justifyContent: "center", marginTop: 6 },
  addToBasketText: { fontFamily: "Manrope-Bold", fontSize: 12, lineHeight: 16, letterSpacing: 2.4, color: "#FFFFFF" },
});
