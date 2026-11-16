// src/features/providers/heroes/DemureHeroes.tsx
//
// The heroes of the demure page styles (2026-11-16, boards 28–32 on
// https://claude.ai/artifact/LPquiWNrboArq6NjcZi9ny), drawn by
// ProfileHero.ProfileHeroLayout for the profile and Branding's preview alike:
//
// - Lounge: their first portfolio photo with rounded top corners, the name in
//   tall League Gothic caps in the page's own colour across its foot, so the
//   letters look cut out of the page. The photo ends on a strip of the page
//   colour that the content sheet overlaps, so there's no seam.
// - Soft Focus: a card tinted with the accent, a wave in its corner, the round
//   logo beside the name in heavy Archivo caps and a pill of what they do.
// - Hush: everything quiet inside a hairline frame. What they do in tiny caps,
//   a ringed logo, the name in light italic, then a fan of their chosen photos.
// - Pearl: a card with the fan of their chosen photos, the logo in a ring of
//   pearls over its foot, the name in spaced Castoro caps.
// - Bow: their photo with a satin ribbon down it and a bow tied on top, the
//   logo on its foot, the name in Sorts Mill Goudy italic.
//
// Hush and Pearl's fan photos come from fanPhotos (Branding → Your fan).

import React from "react";
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";

import { blend, isDarkColor, withAlpha } from "../../../constants/providerThemes";
import { fanAngles } from "../fanPhotos";
import { cardInk } from "./BoutiqueHero";
import { BowGlyph, PearlRing, ribbonColours } from "./demureOrnaments";

/** How far the content sheet rides up over Lounge's page-coloured strip. */
const LOUNGE_SHEET_OVERLAP = 40;

/** Shared by every demure hero. */
interface DemureHeroProps {
  name: string;
  /** What they do as a phrase ("Lashes & brows"). */
  phrase: string;
  /** What they do in caps ("LASHES · BROWS"). */
  kicker: string;
  location: string;
  heroText: string;
  heroSub: string;
  /** A text shadow when the hero is dark (a photo or a dark backdrop). */
  shadow: object | null;
  renderLogo: (size: number) => React.ReactNode;
  details: React.ReactNode;
  tick: React.ReactNode;
}

// ── The fan ─────────────────────────────────────────────────────────────────

/**
 * Up to five photos fanned out from a point below them, like prints held in
 * one hand. Tapping one opens it full size. Hush's are prints with a border
 * of the page colour; Pearl's are round-cornered photos edged in pearl.
 */
export function HeroFan({
  uris,
  variant,
  paper,
  onOpen,
}: {
  uris: readonly string[];
  variant: "prints" | "pearls";
  /** Hush: the print border. Pearl: the card the fan sits on. */
  paper: string;
  onOpen?: ((index: number) => void) | undefined;
}) {
  if (uris.length === 0) return null;
  const angles = fanAngles(uris.length);
  const width = variant === "prints" ? 124 : 120;
  const height = variant === "prints" ? 166 : 168;
  // Turning about a point a photo's height below its centre, as
  // transform-origin 50% 150% did on the canvas.
  const pivot = height;
  const onDark = isDarkColor(paper);
  return (
    <View style={fan.stage}>
      {uris.map((uri, index) => {
        const deg = angles[index] ?? 0;
        // The whole photo turns (and its tap area with it), about a point a
        // photo's height below its centre, as transform-origin 50% 150% did
        // on the canvas.
        const placed = {
          width,
          height,
          marginLeft: -width / 2,
          transform: [
            { translateY: pivot },
            { rotate: `${deg}deg` },
            { translateY: -pivot },
            { translateY: Math.abs(deg) * 0.35 },
          ],
        };
        const look = variant === "prints"
          ? [fan.print, { backgroundColor: paper, borderColor: withAlpha(onDark ? "#FFFFFF" : "#2A2826", 0.16) }]
          : [fan.pearlCard, { borderColor: onDark ? "#E8E1D7" : "#FFFDF8", shadowColor: onDark ? "#000000" : "#2B2623" }];
        const photo = (
          <Image
            source={{ uri }}
            style={[StyleSheet.absoluteFill, variant === "prints" ? fan.printPhoto : fan.pearlPhoto]}
            contentFit="cover"
            transition={0}
            recyclingKey={uri}
          />
        );
        return onOpen ? (
          <TouchableOpacity
            key={`${index}-${uri}`}
            activeOpacity={0.9}
            onPress={() => onOpen(index)}
            style={[fan.slot, fan.card, look, placed]}
            accessibilityRole="imagebutton"
            accessibilityLabel={`Photo ${index + 1} of ${uris.length}. Tap to see it full size`}
          >
            {photo}
          </TouchableOpacity>
        ) : (
          <View key={`${index}-${uri}`} style={[fan.slot, fan.card, look, placed]} pointerEvents="none">
            {photo}
          </View>
        );
      })}
    </View>
  );
}

const fan = StyleSheet.create({
  stage: { alignSelf: "stretch", height: 250 },
  // Each photo is placed from the stage's middle; the last drawn is on top.
  slot: { position: "absolute", left: "50%", top: 34 },
  card: {
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 4,
  },
  print: { borderWidth: StyleSheet.hairlineWidth, shadowColor: "#2A2826" },
  printPhoto: { top: 7, left: 7, right: 7, bottom: 7 },
  pearlCard: { borderWidth: 4, borderRadius: 26 },
  pearlPhoto: { borderRadius: 22 },
});

// ── Lounge ──────────────────────────────────────────────────────────────────

export function LoungeHero({
  name,
  photoUri,
  accent,
  sheetColour,
  heroText,
  details,
  tick,
}: Pick<DemureHeroProps, "name" | "heroText" | "details" | "tick"> & {
  photoUri: string | undefined;
  accent: string;
  /** The content sheet's colour: the name and the strip under the photo. */
  sheetColour: string;
}) {
  const { width } = useWindowDimensions();
  const upper = name.toUpperCase();
  const first = (name.trim().split(/\s+/)[0] ?? "").toUpperCase();
  // League Gothic is narrow: a cap is about 0.38 of its size across. Fill the
  // photo's width, never past 112pt.
  const size = Math.round(Math.max(48, Math.min(112, (width - 44) / Math.max(upper.length * 0.38, 1))));
  const byInk = photoUri ? "#FFFFFF" : withAlpha(heroText, 0.92);
  return (
    <View style={lounge.wrap}>
      <View style={[lounge.photo, { backgroundColor: photoUri ? "#1A1817" : accent }]}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
        ) : null}
        {first ? (
          <View style={[lounge.byRow, { bottom: size * 0.72 }]}>
            <Text style={[lounge.by, { color: byInk }, photoUri ? lounge.byShadow : null]}>BY {first}</Text>
            {tick}
          </View>
        ) : null}
        <Text
          style={[lounge.name, { fontSize: size, lineHeight: Math.round(size * 1.3), bottom: -Math.round(size * 0.55), color: sheetColour }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
          accessibilityRole="header"
          accessibilityLabel={name}
        >
          {upper}
        </Text>
      </View>
      <View style={[lounge.strip, { backgroundColor: sheetColour }]}>{details}</View>
    </View>
  );
}

const lounge = StyleSheet.create({
  // Opens on the photo, straight under the header buttons.
  wrap: { alignSelf: "stretch", marginTop: -20, marginBottom: -LOUNGE_SHEET_OVERLAP },
  photo: { height: 340, marginHorizontal: 10, borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: "hidden" },
  byRow: { position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 },
  by: { fontFamily: "HankenGrotesk-Medium", fontSize: 10, lineHeight: 14, letterSpacing: 5 },
  byShadow: { textShadowColor: "rgba(0,0,0,0.45)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  name: { position: "absolute", left: 6, right: 6, fontFamily: "LeagueGothic-Regular", textAlign: "center", letterSpacing: 0.5 },
  strip: { alignItems: "center", paddingTop: 16, paddingBottom: 18 + LOUNGE_SHEET_OVERLAP, paddingHorizontal: 20 },
});

// ── Soft Focus ──────────────────────────────────────────────────────────────

export function SoftFocusHero({
  name,
  phrase,
  location,
  accent,
  renderLogo,
  details,
  tick,
}: Pick<DemureHeroProps, "name" | "phrase" | "location" | "renderLogo" | "details" | "tick"> & { accent: string }) {
  // Always a pale tint of the accent, so the ink is always dark.
  const tint = blend(accent, "#FFFFFF", 0.72);
  const wave = blend(accent, "#FFFFFF", 0.5);
  const ink = "#16131A";
  return (
    <View style={soft.wrap}>
      <View style={[soft.card, { backgroundColor: tint }]}>
        <Svg style={soft.wave} width={230} height={150} viewBox="0 0 230 150" pointerEvents="none">
          <Path d="M0 150 C 70 140, 120 110, 150 60 S 210 0, 230 0 L230 150 Z" fill={wave} />
        </Svg>
        <View style={soft.logo}>{renderLogo(118)}</View>
        <View style={soft.text}>
          <View style={soft.nameRow} accessible accessibilityRole="header" accessibilityLabel={name}>
            <Text style={[soft.name, { color: ink }]} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.55}>
              {name.toUpperCase()}
            </Text>
            {tick}
          </View>
          {location ? <Text style={[soft.location, { color: withAlpha(ink, 0.7) }]} numberOfLines={2}>{location}</Text> : null}
          {phrase ? (
            <View style={soft.pill}>
              <Ionicons name="sparkles-outline" size={13} color={ink} />
              <Text style={[soft.pillText, { color: ink }]} numberOfLines={1}>{phrase}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={soft.details}>{details}</View>
    </View>
  );
}

const soft = StyleSheet.create({
  wrap: { alignSelf: "stretch", paddingHorizontal: 14, marginBottom: 26 },
  card: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 30, padding: 16, overflow: "hidden" },
  wave: { position: "absolute", right: -10, bottom: -6 },
  // HeroLogo keeps 20pt under itself; the card spaces it already.
  logo: { marginBottom: -20 },
  text: { flex: 1, gap: 6 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontFamily: "Archivo-ExtraBold", fontSize: 28, lineHeight: 36, letterSpacing: -0.3, flexShrink: 1 },
  location: { fontSize: 13, lineHeight: 18 },
  pill: {
    alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%",
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 100, backgroundColor: "rgba(255,255,255,0.72)",
  },
  pillText: { fontSize: 12, fontWeight: "600", flexShrink: 1 },
  details: { alignItems: "center", marginTop: 18 },
});

// ── Hush ────────────────────────────────────────────────────────────────────

export function HushHero({
  name,
  phrase,
  kicker,
  location,
  heroText,
  heroSub,
  shadow,
  renderLogo,
  details,
  tick,
  fanUris,
  paper,
  onOpenFanPhoto,
}: DemureHeroProps & {
  fanUris: readonly string[];
  /** The print border: the content sheet's colour. */
  paper: string;
  onOpenFanPhoto?: ((index: number) => void) | undefined;
}) {
  const top = [kicker, location.toUpperCase()].filter(Boolean).join(" · ");
  return (
    <View style={[hush.frame, { borderColor: withAlpha(heroText, 0.32) }]}>
      {top ? <Text style={[hush.top, { color: heroSub }, shadow]} numberOfLines={2}>{top}</Text> : null}
      <View style={hush.logo}>{renderLogo(66)}</View>
      <View style={hush.nameRow} accessible accessibilityRole="header" accessibilityLabel={name}>
        <Text style={[hush.name, { color: heroText }, shadow]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
          {name.toLowerCase()}
        </Text>
        {tick}
      </View>
      {phrase ? <Text style={[hush.phrase, { color: heroSub }, shadow]}>{phrase.toUpperCase()}</Text> : null}
      <View style={hush.details}>{details}</View>
      {fanUris.length > 0 ? (
        <>
          <HeroFan uris={fanUris} variant="prints" paper={paper} onOpen={onOpenFanPhoto} />
          <Text style={[hush.caption, { color: heroSub }, shadow]}>a few of my favourites · tap to look closer</Text>
        </>
      ) : null}
    </View>
  );
}

const hush = StyleSheet.create({
  frame: {
    alignSelf: "stretch", alignItems: "center", marginHorizontal: 14, marginTop: 8, marginBottom: 26,
    borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: 32, paddingTop: 30, paddingBottom: 22, paddingHorizontal: 18,
  },
  top: { fontFamily: "HankenGrotesk-Medium", fontSize: 9.5, lineHeight: 14, letterSpacing: 3.2, textAlign: "center" },
  // HeroLogo keeps 20pt under itself.
  logo: { marginTop: 22, marginBottom: -14 },
  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  // Newsreader's italic loops reach high and low: the line is 1.4×.
  name: { fontFamily: "Newsreader-LightItalic", fontSize: 44, lineHeight: 62, letterSpacing: -0.4, textAlign: "center", paddingHorizontal: 6, flexShrink: 1 },
  phrase: { fontFamily: "HankenGrotesk-Medium", fontSize: 9.5, lineHeight: 14, letterSpacing: 3.2, textAlign: "center" },
  details: { alignItems: "center", marginTop: 14 },
  caption: { fontFamily: "Newsreader-LightItalic", fontSize: 13, lineHeight: 19, textAlign: "center" },
});

// ── Pearl ───────────────────────────────────────────────────────────────────

export function PearlHero({
  name,
  phrase,
  cardColour,
  renderLogo,
  details,
  tick,
  fanUris,
  onOpenFanPhoto,
}: Pick<DemureHeroProps, "name" | "phrase" | "renderLogo" | "details" | "tick"> & {
  cardColour: string;
  fanUris: readonly string[];
  onOpenFanPhoto?: ((index: number) => void) | undefined;
}) {
  const ink = cardInk(cardColour);
  const onDark = isDarkColor(cardColour);
  return (
    <View style={[pearl.card, { backgroundColor: cardColour }]}>
      {fanUris.length > 0 ? <HeroFan uris={fanUris} variant="pearls" paper={cardColour} onOpen={onOpenFanPhoto} /> : null}
      <View style={[pearl.logoBox, fanUris.length > 0 && pearl.logoOverFan]}>
        <View style={pearl.logo}>{renderLogo(84)}</View>
        <PearlRing diameter={84} pearl={9} count={22} onDark={onDark} />
      </View>
      <View style={pearl.nameRow} accessible accessibilityRole="header" accessibilityLabel={name}>
        <Text style={[pearl.name, { color: ink.text }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
          {name.toUpperCase()}
        </Text>
        {tick}
      </View>
      {phrase ? <Text style={[pearl.phrase, { color: ink.sub }]}>{phrase.toLowerCase()}</Text> : null}
      <View style={pearl.details}>{details}</View>
    </View>
  );
}

const pearl = StyleSheet.create({
  card: {
    alignSelf: "stretch", alignItems: "center", marginHorizontal: 16, marginBottom: 26,
    borderRadius: 34, paddingTop: 22, paddingBottom: 24, paddingHorizontal: 18,
  },
  logoBox: { width: 84, height: 84, marginTop: 10 },
  logoOverFan: { marginTop: -30 },
  // HeroLogo keeps 20pt under itself; the box sizes it already.
  logo: { marginBottom: -20 },
  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 22 },
  // Castoro's caps need 1.3× or their tops crop.
  name: { fontFamily: "Castoro-Regular", fontSize: 28, lineHeight: 37, letterSpacing: 5, textAlign: "center", flexShrink: 1 },
  phrase: { fontFamily: "Castoro-Italic", fontSize: 16, lineHeight: 22, textAlign: "center", marginTop: 2 },
  details: { alignItems: "center", marginTop: 14, alignSelf: "stretch" },
});

// ── Bow ─────────────────────────────────────────────────────────────────────

export function BowHero({
  name,
  phrase,
  heroText,
  heroSub,
  shadow,
  accent,
  photoUri,
  renderLogo,
  details,
  tick,
}: Pick<DemureHeroProps, "name" | "phrase" | "heroText" | "heroSub" | "shadow" | "renderLogo" | "details" | "tick"> & {
  accent: string;
  photoUri: string | undefined;
}) {
  const ribbon = ribbonColours(accent);
  return (
    <View style={bow.wrap}>
      <View style={bow.photoWrap}>
        <View style={[bow.photo, { backgroundColor: blend(accent, "#FFFFFF", 0.6) }]}>
          {photoUri ? <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} /> : null}
          <View style={[bow.ribbon, { backgroundColor: ribbon.satin, borderColor: ribbon.edge }]} />
        </View>
        <View style={bow.knot} pointerEvents="none">
          <BowGlyph width={108} accent={accent} detailed />
        </View>
      </View>
      <View style={bow.logo}>{renderLogo(76)}</View>
      <View style={bow.nameRow} accessible accessibilityRole="header" accessibilityLabel={name}>
        <Text style={[bow.name, { color: heroText }, shadow]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
          {name}
        </Text>
        {tick}
      </View>
      {phrase ? <Text style={[bow.phrase, { color: heroSub }, shadow]}>{phrase.toUpperCase()}</Text> : null}
      <View style={bow.details}>{details}</View>
    </View>
  );
}

const bow = StyleSheet.create({
  // Room above the photo for the bow, which sits over its top edge.
  wrap: { alignSelf: "stretch", alignItems: "center", paddingHorizontal: 18, marginTop: 30, marginBottom: 26 },
  photoWrap: { alignSelf: "stretch" },
  photo: { height: 300, borderRadius: 28, overflow: "hidden" },
  ribbon: { position: "absolute", top: 0, bottom: 0, left: "30%", width: 14, borderLeftWidth: 1, borderRightWidth: 1 },
  // Centred on the ribbon: its middle is 30% in plus half its 14pt width;
  // the bow is 108 wide.
  knot: { position: "absolute", top: -34, left: "30%", marginLeft: 7 - 54 },
  // Over the photo's foot, then HeroLogo's own 20pt gap back under it.
  logo: { marginTop: -38, marginBottom: -10 },
  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  // Sorts Mill Goudy italic: tall loops, so the line is 1.4×.
  name: { fontFamily: "SortsMillGoudy-Italic", fontSize: 40, lineHeight: 56, textAlign: "center", paddingHorizontal: 6, flexShrink: 1 },
  phrase: { fontFamily: "Figtree-SemiBold", fontSize: 10, lineHeight: 14, letterSpacing: 2.8, textAlign: "center" },
  details: { alignItems: "center", marginTop: 14 },
});
