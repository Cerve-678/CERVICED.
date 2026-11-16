// src/features/providers/heroes/BoutiqueHero.tsx
//
// The Boutique page style's hero (pageStyles hero 'shop'): the top of an
// online boutique. A strip running along the top ("NOW BOOKING · HACKNEY ·
// LASHES · BROWS"), their name as a brand wordmark with the logo beside it,
// what they do as the shop's menu, then their best portfolio photo as the
// window display with a Book now button that jumps to Services. Their stars,
// years and slots sit under it.
//
// Picked by the owner on 2026-11-15 (canvas 6e85xnbB9f2DzbkHrqCLrC, board G)
// after a shopping bag, a woven basket and a handheld shop basket.

import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
  type TextStyle,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";

import { blend } from "../../../constants/providerThemes";

/** The strip and the button are printed on this, whatever the theme. */
const PAPER = "#FBF6EE";
/** At most this many of what they do fit the menu row. */
const MAX_MENU_ITEMS = 4;
/** How fast the strip runs, in points per second. */
const STRIP_SPEED = 28;

export function BoutiqueHero({
  name,
  location,
  kicker,
  caption,
  accent,
  heroText,
  heroSub,
  shadow,
  photoUri,
  renderLogo,
  details,
  tick,
  onBookNow,
}: {
  name: string;
  location: string;
  /** What they do, "LASHES · BROWS": the menu row and the strip. */
  kicker: string;
  /** What they do as a phrase, "Lashes & brows": the photo's caption. */
  caption: string;
  accent: string;
  heroText: string;
  heroSub: string;
  /** The hero's text shadow over a dark photo, or null. */
  shadow: TextStyle | null;
  /** Their first portfolio photo, or undefined when they have none yet. */
  photoUri?: string | undefined;
  renderLogo: (size: number) => React.ReactNode;
  details: React.ReactNode;
  tick: React.ReactNode;
  /** Jumps to Services. Left out where there's nothing to jump to (a
   *  link-only provider books elsewhere), and then there's no button. */
  onBookNow?: (() => void) | undefined;
}) {
  const stripInk = blend(accent, "#000000", 0.4);
  const buttonInk = blend(accent, "#000000", 0.55);
  const menu = kicker
    .split("·")
    .map(part => part.trim())
    .filter(Boolean)
    .slice(0, MAX_MENU_ITEMS);
  const stripText = ["NOW BOOKING", location.toUpperCase(), ...menu].filter(Boolean).join("  ·  ") + "  ·  ";

  return (
    <View style={styles.wrap}>
      <ShopStrip text={stripText} background={stripInk} />

      <View style={styles.brandRow}>
        {/* HeroLogo keeps 20pt under itself; the brand row shouldn't. */}
        <View style={styles.logoNoGap}>{renderLogo(40)}</View>
        <View style={styles.nameRow} accessible accessibilityRole="header" accessibilityLabel={name}>
          <Text
            style={[styles.wordmark, { color: heroText }, shadow]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
          >
            {name.toUpperCase()}
          </Text>
          {tick}
        </View>
      </View>
      {location ? (
        <Text style={[styles.location, { color: heroSub }, shadow]} numberOfLines={1}>
          {location.toUpperCase()}
        </Text>
      ) : null}

      {menu.length > 0 ? (
        <View style={[styles.menu, { borderColor: blend(heroSub, heroText, 0.2) }]}>
          {menu.map(item => (
            <Text key={item} style={[styles.menuItem, { color: heroSub }, shadow]} numberOfLines={1}>
              {item}
            </Text>
          ))}
        </View>
      ) : null}

      {/* The window display: their best photo, or their logo on their colour
          until they've added one. */}
      <View style={[styles.window, { backgroundColor: accent }]}>
        {photoUri ? (
          <>
            <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
            <LinearGradient
              colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.5)"]}
              start={{ x: 0, y: 0.45 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          </>
        ) : (
          <View style={styles.windowLogo}>{renderLogo(96)}</View>
        )}
        <View style={styles.windowFoot}>
          <Text style={styles.caption} numberOfLines={2}>
            {caption}
          </Text>
          {onBookNow ? (
            <TouchableOpacity
              style={styles.bookNow}
              onPress={onBookNow}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Book now. Go to services"
            >
              <Text style={[styles.bookNowText, { color: buttonInk }]}>BOOK NOW</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.details}>{details}</View>
    </View>
  );
}

/** The thin strip along the top, running right to left like a shop's banner.
 *  It stands still when the phone asks for less motion. */
function ShopStrip({ text, background }: { text: string; background: string }) {
  const [width, setWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const offset = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(on => { if (mounted) setReduceMotion(on); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", on => setReduceMotion(on));
    return () => { mounted = false; sub.remove(); };
  }, []);

  useEffect(() => {
    offset.setValue(0);
    if (reduceMotion || width === 0) return;
    // Two copies side by side; sliding one copy's width and starting again is seamless.
    const loop = Animated.loop(
      Animated.timing(offset, {
        toValue: -width,
        duration: (width / STRIP_SPEED) * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [offset, reduceMotion, width]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View style={[styles.strip, { backgroundColor: background }]} accessible accessibilityLabel={text.replace(/·/g, ",")}>
      <Animated.View style={[styles.stripRun, { transform: [{ translateX: offset }] }]}>
        <Text style={styles.stripText} onLayout={onLayout} numberOfLines={1}>{text}</Text>
        <Text style={styles.stripText} numberOfLines={1}>{text}</Text>
        <Text style={styles.stripText} numberOfLines={1}>{text}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Opens on the strip, a line of text, so it starts lower than a logo-first
  // hero (as TEXT_FIRST_DROP in ProfileHero).
  wrap: { alignSelf: "stretch", alignItems: "center", marginTop: 48, marginBottom: 30 },
  strip: { alignSelf: "stretch", height: 26, justifyContent: "center", overflow: "hidden" },
  stripRun: { flexDirection: "row", width: 4000 },
  stripText: { fontFamily: "Manrope-Bold", fontSize: 9, lineHeight: 13, letterSpacing: 2.6, color: PAPER, paddingLeft: 14 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 22, paddingHorizontal: 20, maxWidth: "100%" },
  logoNoGap: { marginBottom: -20 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  wordmark: { fontFamily: "DMSerifDisplay-Regular", fontSize: 34, lineHeight: 40, letterSpacing: 4, flexShrink: 1 },
  location: { fontFamily: "Manrope-Bold", fontSize: 9, lineHeight: 13, letterSpacing: 4, marginTop: 4, paddingHorizontal: 20 },
  menu: {
    alignSelf: "stretch", marginHorizontal: 20, marginTop: 18, paddingVertical: 10,
    flexDirection: "row", justifyContent: "space-evenly",
    borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuItem: { fontFamily: "Manrope-Bold", fontSize: 11, lineHeight: 15, letterSpacing: 1.2, flexShrink: 1 },
  window: { alignSelf: "stretch", marginHorizontal: 20, marginTop: 16, aspectRatio: 1.25, borderRadius: 4, overflow: "hidden" },
  windowLogo: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 40 },
  windowFoot: {
    position: "absolute", left: 16, right: 16, bottom: 16,
    flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12,
  },
  caption: {
    fontFamily: "DMSerifDisplay-Regular", fontSize: 22, lineHeight: 26, color: PAPER, flexShrink: 1,
    textShadowColor: "rgba(0,0,0,0.35)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  bookNow: { backgroundColor: PAPER, borderRadius: 2, paddingVertical: 11, paddingHorizontal: 16 },
  bookNowText: { fontFamily: "Manrope-Bold", fontSize: 10, lineHeight: 14, letterSpacing: 2 },
  details: { alignItems: "center", marginTop: 14 },
});
