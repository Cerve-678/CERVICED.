// src/features/providers/heroes/StudioHero.tsx
//
// The Studio page style's hero (pageStyles hero 'studio'): the top of a
// boutique studio's website. A bar in a deep shade of the accent carries
// their logo and their name as a lowercase serif wordmark with a full stop,
// pressed tone-on-tone into the bar like an embossed card. Under it, their
// best photo runs edge to edge with what they do written across its foot in
// huge chunky caps ("LASHES & BROWS."), the joining words in a light script.
// Their area sits small in the photo's top corner and a Book now pill jumps
// to Services.
//
// From the owner's 2026-11-16 references: a burgundy-and-blush studio site
// ("TURN UP the HEAT.") and an embossed lowercase wordmark ("imani.").

import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";

import { blend, isDarkColor } from "../../../constants/providerThemes";
import { EmbossedText } from "./EmbossedHero";

/** Words drawn in the script rather than the caps, wherever they fall. */
const JOINING_WORDS = new Set(["&", "and", "the", "by", "of", "with", "at", "for", "in", "x"]);

/** One run of the headline: caps, or a joining word in script. */
export interface StudioHeadlinePart {
  text: string;
  script: boolean;
}

/**
 * "LASHES · BROWS · NAILS" → LASHES, BROWS & NAILS — the caps parts and the
 * joining words (in script) as separate runs, ready to draw inline. Joining
 * words already inside a part ("Hair by Amara") are split out too.
 */
export function studioHeadline(kicker: string, fallback: string): StudioHeadlinePart[] {
  const items = kicker.split("·").map(part => part.trim()).filter(Boolean);
  const source = items.length === 0
    ? [fallback.trim()]
    : items.length === 1
      ? items
      : [items.slice(0, -1).join(", "), "&", items[items.length - 1]!];
  const parts: StudioHeadlinePart[] = [];
  const push = (text: string, script: boolean) => {
    const last = parts[parts.length - 1];
    if (last && last.script === script) last.text = `${last.text} ${text}`;
    else parts.push({ text, script });
  };
  for (const chunk of source) {
    for (const word of chunk.split(/\s+/).filter(Boolean)) {
      const bare = word.toLowerCase().replace(/[^a-z&]/g, "");
      if (JOINING_WORDS.has(bare)) push(word.toLowerCase(), true);
      else push(word.toUpperCase(), false);
    }
  }
  return parts;
}

/** Their name as a lowercase wordmark with a full stop: "Amara Beauty" → "amara beauty." */
export function studioWordmark(name: string): string {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function StudioHero({
  name,
  kicker,
  location,
  accent,
  photoUri,
  renderLogo,
  details,
  tick,
  onBookNow,
}: {
  name: string;
  /** What they do, "LASHES · BROWS": the headline across the photo. */
  kicker: string;
  location: string;
  accent: string;
  /** Their first portfolio photo, or undefined when they have none yet. */
  photoUri?: string | undefined;
  renderLogo: (size: number) => React.ReactNode;
  details: React.ReactNode;
  tick: React.ReactNode;
  /** Jumps to Services. Left out for a link-only provider (they book
   *  elsewhere), and then there's no button. */
  onBookNow?: (() => void) | undefined;
}) {
  // The bar is always a deep shade of the accent, so the pressed wordmark and
  // the pale headline have something dark to sit against.
  const bar = isDarkColor(accent) ? blend(accent, "#000000", 0.25) : blend(accent, "#000000", 0.5);
  const blush = blend(accent, "#FFFFFF", 0.72);
  const headline = studioHeadline(kicker, name);

  return (
    <View style={styles.wrap}>
      <View style={[styles.bar, { backgroundColor: bar }]}>
        {/* HeroLogo keeps 20pt under itself; the bar shouldn't. */}
        <View style={styles.logoNoGap}>{renderLogo(40)}</View>
        <View style={styles.wordmarkRow} accessible accessibilityRole="header" accessibilityLabel={name}>
          <EmbossedText
            paper={bar}
            face={blend(bar, "#000000", 0.18)}
            edges={{ high: "rgba(255,255,255,0.22)", shade: "rgba(0,0,0,0.55)", drop: "rgba(0,0,0,0.3)" }}
            style={styles.wordmark}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
          >
            {studioWordmark(name)}
          </EmbossedText>
          {tick}
        </View>
      </View>

      <View style={[styles.photo, { backgroundColor: blend(accent, "#FFFFFF", 0.3) }]}>
        {photoUri ? (
          <>
            <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
            <LinearGradient
              colors={["rgba(0,0,0,0.28)", "rgba(0,0,0,0)", "rgba(0,0,0,0)", "rgba(0,0,0,0.45)"]}
              locations={[0, 0.25, 0.55, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          </>
        ) : (
          <View style={styles.photoLogo}>{renderLogo(96)}</View>
        )}

        <View style={styles.photoTop}>
          {location ? (
            <Text style={styles.area} numberOfLines={2}>{location.toUpperCase()}</Text>
          ) : <View />}
          {onBookNow ? (
            <TouchableOpacity
              style={[styles.bookNow, { backgroundColor: bar }]}
              onPress={onBookNow}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Book now. Go to services"
            >
              <Text style={[styles.bookNowText, { color: blush }]}>BOOK NOW</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <Text
          style={[styles.headline, { color: blush }]}
          numberOfLines={3}
          adjustsFontSizeToFit
          minimumFontScale={0.45}
          accessibilityLabel={headline.map(part => part.text).join(" ")}
        >
          {headline.map((part, index) => (
            <Text key={`${index}-${part.text}`} style={part.script ? styles.script : null}>
              {index > 0 ? " " : ""}{part.text}
            </Text>
          ))}
          <Text>.</Text>
        </Text>
      </View>

      <View style={styles.details}>{details}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Opens on the bar, so it starts lower than a logo-first hero (as
  // TEXT_FIRST_DROP in ProfileHero) and clears the header buttons.
  wrap: { alignSelf: "stretch", alignItems: "center", marginTop: 48, marginBottom: 30 },
  bar: {
    alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  logoNoGap: { marginBottom: -20 },
  wordmarkRow: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  // Young Serif's ascenders need the line at 1.3× or the tops crop.
  wordmark: { fontFamily: "YoungSerif-Regular", fontSize: 30, lineHeight: 40, flexShrink: 1 },
  photo: { alignSelf: "stretch", aspectRatio: 0.82, overflow: "hidden", justifyContent: "flex-end" },
  photoLogo: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", paddingBottom: 80 },
  photoTop: {
    position: "absolute", top: 16, left: 18, right: 18,
    flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
  },
  area: {
    fontFamily: "Manrope-Bold", fontSize: 10, lineHeight: 14, letterSpacing: 2, color: "#FFFFFF", flexShrink: 1,
    textShadowColor: "rgba(0,0,0,0.35)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  bookNow: { borderRadius: 100, paddingVertical: 9, paddingHorizontal: 16 },
  bookNowText: { fontFamily: "Manrope-Bold", fontSize: 10, lineHeight: 14, letterSpacing: 2 },
  // Lilita One caps, with Ephesis for the joining words. The line is set for
  // the script (≥1.45× its size) so its loops aren't cropped.
  headline: {
    fontFamily: "LilitaOne-Regular", fontSize: 58, lineHeight: 74, letterSpacing: 0.5,
    paddingHorizontal: 14, marginBottom: 2,
  },
  script: { fontFamily: "Ephesis-Regular", fontSize: 50, letterSpacing: 0 },
  details: { alignItems: "center", marginTop: 16, paddingHorizontal: 20 },
});
