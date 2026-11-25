// src/features/providers/heroes/DemureHeroes.tsx
//
// The heroes of the demure page styles (2026-11-16, boards 28–32 on
// https://claude.ai/artifact/LPquiWNrboArq6NjcZi9ny), drawn by
// ProfileHero.ProfileHeroLayout for the profile and Branding's preview alike:
//
// - Lounge: a rounded-top panel of their colour (no photo, owner 2026-11-17),
//   the name in tall League Gothic caps in the page's own colour near its
//   foot, so the letters look cut out of the page. The panel ends on a strip
//   of the page colour that the content sheet overlaps, so there's no seam.
// - Soft Focus: a card tinted with the accent, a wave in its corner, the round
//   logo beside the name in heavy Archivo caps and a pill of what they do.
// - Hush: everything quiet inside a hairline frame. What they do in tiny caps,
//   a ringed logo, the name in light italic, then three of their chosen photos,
//   each in its own box (owner, 2026-11-17: boxes, not a fan).
// - Stripes: a full-width strip of their colour between two fine rules, the
//   logo in a ring of pearls, the name in spaced Castoro caps. No photo
//   (replaced Pearl's fan, owner 2026-11-17).
// - Bow: their photo with a satin ribbon down it and a bow tied on top, the
//   logo on its foot, the name in Sorts Mill Goudy italic.
//
// Hush's boxes show the photos picked in Branding (heroPhotos).

import React from "react";
import { StyleSheet, Text, TouchableOpacity, View, type TextStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";

import { blend, isDarkColor, withAlpha } from "../../../constants/providerThemes";
import { cardInk } from "./BoutiqueHero";
import { BowGlyph, PearlRing, ribbonColours, stripeColours } from "./demureOrnaments";
import { HeroPhoto } from "../HeroPhoto";
import { useContentWidth } from '../../../components/ReadableWidth';

/** How far Lounge's name line hangs below the panel's foot, as a share of its
 *  size. 0.55 at first, 0.42 (#578), 0.16 once the photo went (owner,
 *  2026-11-17: "lift the name higher"), then 0.21 ("bring it slightly down").
 *  BY … above it moves by the same amount so the gap stays. */
const LOUNGE_NAME_DROP = 0.21;
const LOUNGE_BY_LIFT = 1.06;

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

// ── Hush's boxes ───────────────────────────────────────────────────────────

/** Up to three photos side by side, each matted in its own fine-edged box. Tapping one opens it full size. */
export function HushBoxes({
  uris,
  paper,
  onOpen,
}: {
  uris: readonly string[];
  /** The mat round each photo: the content sheet's colour. */
  paper: string;
  onOpen?: ((index: number) => void) | undefined;
}) {
  if (uris.length === 0) return null;
  const edge = withAlpha(isDarkColor(paper) ? "#FFFFFF" : "#2A2826", 0.16);
  return (
    <View style={boxes.row}>
      {uris.slice(0, 3).map((uri, index) => {
        const photo = <View style={boxes.photo}><HeroPhoto uri={uri} /></View>;
        const look = [boxes.box, { backgroundColor: paper, borderColor: edge }];
        return onOpen ? (
          <TouchableOpacity
            key={`${index}-${uri}`}
            style={look}
            activeOpacity={0.9}
            onPress={() => onOpen(index)}
            accessibilityRole="imagebutton"
            accessibilityLabel={`Photo ${index + 1} of ${Math.min(uris.length, 3)}. Tap to see it full size`}
          >
            {photo}
          </TouchableOpacity>
        ) : (
          <View key={`${index}-${uri}`} style={look}>{photo}</View>
        );
      })}
    </View>
  );
}

const boxes = StyleSheet.create({
  // Smaller than the full width, centred (owner, 2026-11-19: "make images smaller in hush").
  row: { flexDirection: "row", justifyContent: "center", gap: 10, alignSelf: "stretch", marginTop: 22, marginBottom: 12 },
  box: {
    width: "24%", aspectRatio: 0.76, padding: 5, borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#2A2826", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 2,
  },
  photo: { flex: 1, overflow: "hidden" },
});

// ── Lounge ──────────────────────────────────────────────────────────────────

export function LoungeHero({
  name,
  accent,
  sheetColour,
  renderLogo,
  details,
  tick,
}: Pick<DemureHeroProps, "name" | "renderLogo" | "details" | "tick"> & {
  accent: string;
  /** The content sheet's colour: the name and the strip under the panel. */
  sheetColour: string;
}) {
  const { width } = useContentWidth();
  const upper = name.toUpperCase();
  const first = (name.trim().split(/\s+/)[0] ?? "").toUpperCase();
  // League Gothic is narrow: a cap is about 0.38 of its size across. Fill the
  // panel's width, never past 112pt.
  const size = Math.round(Math.max(48, Math.min(112, (width - 44) / Math.max(upper.length * 0.38, 1))));
  return (
    <View style={lounge.wrap}>
      <View style={[lounge.panel, { backgroundColor: accent }]}>
        <View style={lounge.logo}>{renderLogo(52)}</View>
        {first ? (
          <View style={[lounge.byRow, { bottom: size * LOUNGE_BY_LIFT }]}>
            <Text style={[lounge.by, { color: cardInk(accent).text }]}>BY {first}</Text>
            {tick}
          </View>
        ) : null}
        <Text
          style={[lounge.name, { fontSize: size, lineHeight: Math.round(size * 1.3), bottom: -Math.round(size * LOUNGE_NAME_DROP), color: sheetColour }]}
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
  // Starts below the profile header buttons. Shorter than the photo it
  // replaced (340), since there's no picture to show.
  wrap: { alignSelf: "stretch", marginTop: 22, marginBottom: -LOUNGE_SHEET_OVERLAP },
  panel: { height: 230, marginHorizontal: 10, borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: "hidden" },
  logo: { position: "absolute", top: 18, right: 20, height: 52 },
  byRow: { position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 },
  by: { fontFamily: "HankenGrotesk-Medium", fontSize: 10, lineHeight: 14, letterSpacing: 5 },
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
  // Sits a little below the header buttons rather than tucked up under them (owner, 2026-11-18).
  wrap: { alignSelf: "stretch", paddingHorizontal: 14, marginTop: 22, marginBottom: 26 },
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
  photoUris,
  paper,
  onOpenPhoto,
  nameStyle = null,
}: DemureHeroProps & {
  photoUris: readonly string[];
  /** The print border: the content sheet's colour. */
  paper: string;
  onOpenPhoto?: ((index: number) => void) | undefined;
  /** The Business Name Font they picked, in place of the light italic. */
  nameStyle?: TextStyle | null;
}) {
  const top = [kicker, location.toUpperCase()].filter(Boolean).join(" · ");
  return (
    <View style={[hush.frame, { borderColor: withAlpha(heroText, 0.32) }]}>
      {top ? <Text style={[hush.top, { color: heroSub }, shadow]} numberOfLines={2}>{top}</Text> : null}
      <View style={hush.logo}>{renderLogo(66)}</View>
      <View style={hush.nameRow} accessible accessibilityRole="header" accessibilityLabel={name}>
        <Text style={[hush.name, nameStyle, { color: heroText }, shadow]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
          {name.toLowerCase()}
        </Text>
        {tick}
      </View>
      {phrase ? <Text style={[hush.phrase, { color: heroSub }, shadow]}>{phrase.toUpperCase()}</Text> : null}
      <View style={hush.details}>{details}</View>
      {photoUris.length > 0 ? (
        <>
          <HushBoxes uris={photoUris} paper={paper} onOpen={onOpenPhoto} />
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

// ── Stripes ─────────────────────────────────────────────────────────────────

export function StripesHero({
  name,
  phrase,
  accent,
  renderLogo,
  details,
  tick,
}: Pick<DemureHeroProps, "name" | "phrase" | "renderLogo" | "details" | "tick"> & {
  accent: string;
}) {
  const { strong, line } = stripeColours(accent);
  const ink = cardInk(strong);
  return (
    <View style={[stripes.band, { backgroundColor: strong, borderColor: line }]}>
      <View style={stripes.logoBox}>
        <View style={stripes.logo}>{renderLogo(64)}</View>
        <PearlRing diameter={64} pearl={7} count={20} onDark={isDarkColor(strong)} />
      </View>
      <View style={stripes.nameRow} accessible accessibilityRole="header" accessibilityLabel={name}>
        <Text style={[stripes.name, { color: ink.text }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
          {name.toUpperCase()}
        </Text>
        {tick}
      </View>
      {phrase ? <Text style={[stripes.phrase, { color: ink.sub }]}>{phrase.toLowerCase()}</Text> : null}
      <View style={stripes.details}>{details}</View>
    </View>
  );
}

/** The colour of Stripes' hero strip: its details (stars, years) take this strip's ink. */
export function stripesHeroColour(accent: string): string {
  return stripeColours(accent).strong;
}

const stripes = StyleSheet.create({
  // Edge to edge, fine rules along its top and foot.
  band: {
    alignSelf: "stretch", alignItems: "center", marginBottom: 26,
    borderTopWidth: 1, borderBottomWidth: 1,
    paddingTop: 24, paddingBottom: 22, paddingHorizontal: 20,
  },
  logoBox: { width: 64, height: 64, marginTop: 6 },
  // HeroLogo keeps 20pt under itself; the box sizes it already.
  logo: { marginBottom: -20 },
  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 18 },
  // Castoro's caps need 1.3× or their tops crop.
  name: { fontFamily: "Castoro-Regular", fontSize: 27, lineHeight: 36, letterSpacing: 5, textAlign: "center", flexShrink: 1 },
  phrase: { fontFamily: "Castoro-Italic", fontSize: 16, lineHeight: 22, textAlign: "center" },
  details: { alignItems: "center", marginTop: 12, alignSelf: "stretch" },
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
          {photoUri ? <HeroPhoto uri={photoUri} /> : null}
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
