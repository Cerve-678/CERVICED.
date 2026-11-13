// src/features/providers/ProfileHero.tsx
//
// Pieces of the public profile's hero that the profile and Branding's preview
// both draw, so the preview can't drift from what clients actually see: the
// logo in its page-style frame, Cover's pills, and the business name's size.

import React, { useId } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Defs, Path, Text as SvgText, TextPath } from "react-native-svg";

import { LogoCircle } from "../../components/FramedLogo";
import type { PageStyle } from "../../constants/pageStyles";
import { blend, withAlpha } from "../../constants/providerThemes";
import type { LogoFraming } from "../../types/database";

/** The business name under the logo; a thin script is drawn larger than
 *  this (see resolveProviderFontScale), and Cover larger still (nameScale). */
export const HERO_NAME_SIZE = 30;
export const HERO_NAME_LINE_HEIGHT = 40;

/** Up to two initials, for a provider with no logo. */
export function logoInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map(word => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * The logo in the hero, in the page style's frame: Scrapbook mounts it as a
 * polaroid, Spa adds a fine outer ring, Glossy a shiny one, Arch and Framed
 * round only its top. Without a logo it shows the initials on the accent.
 */
export function HeroLogo({
  uri,
  framing,
  name,
  fallbackColor,
  accent,
  heroText,
  pageStyle,
  onPress,
  accessibilityLabel,
  size = 148,
}: {
  uri: string | null | undefined;
  framing?: LogoFraming | null;
  name: string;
  fallbackColor: string;
  accent: string;
  /** The hero's text colour; Spa's outer ring follows it. */
  heroText: string;
  pageStyle: PageStyle;
  /** Tap to see the logo in full. Left out in the preview. */
  onPress?: () => void;
  accessibilityLabel?: string;
  /** The logo's width and height; the hero layouts draw it smaller beside text. */
  size?: number;
}) {
  // Everything below is drawn for 148pt; other sizes scale it.
  const box = { width: size, height: size, borderRadius: size / 2 };
  const ringOut = (extra: number) => ({
    top: -extra, left: -extra, width: size + extra * 2, height: size + extra * 2, borderRadius: size / 2 + extra,
  });
  const frame =
    pageStyle.logo === "arch"
      ? [styles.arch, { borderTopLeftRadius: size / 2, borderTopRightRadius: size / 2 }]
      : pageStyle.logo === "polaroid"
        ? styles.polaroidPhoto
        : pageStyle.logo === "doubleRing" || pageStyle.logo === "glossRing"
          ? styles.thinRim
          : null;

  const logo = uri ? (
    <LogoCircle uri={uri} framing={framing} style={[styles.logo, box, frame]} />
  ) : (
    <View style={[styles.logo, box, frame, styles.initialsWrap, { backgroundColor: fallbackColor }]}>
      <Text style={[styles.initials, { fontSize: 28 * (size / 148) }]}>{logoInitials(name)}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={pageStyle.logo === "polaroid" ? styles.polaroid : undefined}>
        <View style={[styles.wrapper, { width: size, height: size }]}>
          {pageStyle.logo === "glossRing" ? (
            <LinearGradient
              colors={["#FFFFFF", blend(accent, "#FFFFFF", 0.45), "#FFFFFF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.glossRing, ringOut(8 * (size / 148))]}
              pointerEvents="none"
            />
          ) : null}
          {pageStyle.logo === "doubleRing" ? (
            <View style={[styles.doubleRing, ringOut(11 * (size / 148)), { borderColor: withAlpha(heroText, 0.7) }]} pointerEvents="none" />
          ) : null}
          {uri && onPress ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onPress}
              accessibilityRole="imagebutton"
              accessibilityLabel={accessibilityLabel}
            >
              {logo}
            </TouchableOpacity>
          ) : (
            logo
          )}
          {/* Sits on top of the logo, so it must let taps through. */}
          <LinearGradient
            colors={["rgba(255,255,255,0.3)", "transparent"]}
            style={[styles.gloss, box, frame]}
            pointerEvents="none"
          />
        </View>
      </View>
    </View>
  );
}

// ── Hero layouts ─────────────────────────────────────────────────────────────

export interface ProfileHeroLayoutProps {
  pageStyle: PageStyle;
  name: string;
  /** What they do ("LASHES · BROWS"): Arch's curved caption and Spa's top line. */
  kicker: string;
  location: string;
  heroText: string;
  heroSub: string;
  heroIsDark: boolean;
  /** The logo at a given size. */
  renderLogo: (size: number) => React.ReactNode;
  /** The name row (name + verified tick) at a multiple of the standard size. */
  renderName: (options: { scale: number; letterSpacing?: number }) => React.ReactNode;
  /** The small-caps line under the name, or Cover's pills. */
  meta: React.ReactNode;
  /** Stars, years of experience and the slots pill with its bell (or a
   *  link-only provider's Book block). Every layout shows these. */
  details: React.ReactNode;
  /** Their About, for the layouts that carry it in the hero (Arch, Framed). */
  about: React.ReactNode;
}

/**
 * The top of the profile, laid out by the page style (pageStyles.PageHero).
 * Classic and Glossy stack the logo over the name as the profile always has;
 * the others move the name, the logo and the words round them as their
 * template did on the 2026-11-13 canvas.
 */
export function ProfileHeroLayout({
  pageStyle,
  name,
  kicker,
  location,
  heroText,
  heroSub,
  heroIsDark,
  renderLogo,
  renderName,
  meta,
  details,
  about,
}: ProfileHeroLayoutProps) {
  const shadow = heroIsDark ? layout.shadow : null;

  switch (pageStyle.hero) {
    case "cover":
      // No logo: the name is the cover line, low over the photo.
      return (
        <View style={layout.coverTop}>
          <View style={layout.infoCenter}>
            {renderName({ scale: 1.6 })}
            {meta}
            {details}
          </View>
        </View>
      );

    case "masthead": {
      // Arch: the name as the page's heading, then the arched logo with
      // what they do curved over it, beside "Meet …" and their About.
      const firstName = name.split(" ")[0] ?? name;
      return (
        <>
          <View style={layout.mastHead}>
            <Text style={[layout.kicker, { color: heroSub }, shadow]}>WELCOME TO MY BOOKING PAGE</Text>
            {renderName({ scale: 1.45 })}
            {location ? (
              <Text style={[layout.located, { color: heroSub }, shadow]}>Located in {location}</Text>
            ) : null}
          </View>
          <View style={layout.mastRow}>
            <View style={layout.mastLogo}>
              {kicker ? <CurvedCaption text={kicker} color={heroText} width={158} /> : null}
              {renderLogo(124)}
            </View>
            <View style={layout.mastAbout}>
              <Text style={[layout.meet, { color: heroText }, shadow]}>Meet</Text>
              <Text style={[layout.meetName, { color: heroText }, shadow]} numberOfLines={2}>{firstName}</Text>
              {about}
            </View>
          </View>
          <View style={layout.infoCenter}>{details}</View>
        </>
      );
    }

    case "sideBySide":
      // Framed: the logo on the left, the welcome on the right.
      return (
        <>
          <View style={layout.sideRow}>
            {renderLogo(118)}
            <View style={layout.sideText}>
              <Text style={[layout.welcome, { color: heroSub }, shadow]}>WELCOME TO</Text>
              {renderName({ scale: 0.95 })}
              {about}
              {location ? (
                <View style={layout.locatedRow}>
                  <Ionicons name="location-outline" size={13} color={heroSub} />
                  <Text style={[layout.locatedScript, { color: heroSub }, shadow]}>located in</Text>
                  <Text style={[layout.locatedPlace, { color: heroText }, shadow]} numberOfLines={1}>{location}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <View style={layout.infoCenter}>{details}</View>
        </>
      );

    case "poster":
      // Scrapbook: a polaroid and a big name.
      return (
        <>
          {renderLogo(112)}
          <View style={layout.infoCenterTight}>
            {renderName({ scale: 1.4 })}
            {meta}
          </View>
          <View style={layout.infoCenter}>{details}</View>
        </>
      );

    case "spa":
      // Spa: a quiet line of what they do, the name spaced out, a ringed logo.
      return (
        <View style={layout.infoCenter}>
          {kicker ? <Text style={[layout.spaKicker, { color: heroSub }, shadow]}>{kicker}</Text> : null}
          {renderName({ scale: 1.15, letterSpacing: 4 })}
          <View style={layout.spaLogo}>{renderLogo(116)}</View>
          {details}
        </View>
      );

    default:
      return (
        <>
          {renderLogo(148)}
          <View style={layout.infoCenter}>
            {renderName({ scale: 1 })}
            {meta}
            {details}
          </View>
        </>
      );
  }
}

/** Words curved over the top of Arch's logo. */
function CurvedCaption({ text, color, width }: { text: string; color: string; width: number }) {
  const id = `arc${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const r = (width - 20) / 2;
  return (
    <Svg width={width} height={r * 0.62} viewBox={`0 0 ${width} ${r * 0.62}`} style={layout.caption} pointerEvents="none">
      <Defs>
        <Path id={id} d={`M10 ${r * 0.62 + r * 0.6} A${r} ${r} 0 0 1 ${width - 10} ${r * 0.62 + r * 0.6}`} fill="none" />
      </Defs>
      <SvgText fill={color} fontSize={9.5} letterSpacing={2.2} fontFamily="Jura-VariableFont_wght" fontWeight="700">
        <TextPath href={`#${id}`} startOffset="50%" textAnchor="middle">
          {text.toUpperCase()}
        </TextPath>
      </SvgText>
    </Svg>
  );
}

const layout = StyleSheet.create({
  shadow: { textShadowColor: "rgba(0,0,0,0.55)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  infoCenter: { alignItems: "center", marginBottom: 30, paddingHorizontal: 20 },
  infoCenterTight: { alignItems: "center", paddingHorizontal: 20 },
  coverTop: { paddingTop: 120 },
  kicker: { fontFamily: "Jura-VariableFont_wght", fontWeight: "800", fontSize: 10, letterSpacing: 2.4, marginBottom: 8 },
  mastHead: { alignItems: "center", paddingHorizontal: 20, marginBottom: 18 },
  located: { fontFamily: "Jura-VariableFont_wght", fontWeight: "700", fontSize: 12, letterSpacing: 0.6, marginTop: 4 },
  mastRow: { flexDirection: "row", alignItems: "flex-end", gap: 14, paddingHorizontal: 20, marginBottom: 10 },
  mastLogo: { alignItems: "center" },
  caption: { marginBottom: -6 },
  mastAbout: { flex: 1, paddingBottom: 20 },
  meet: { fontFamily: "PinyonScript_400Regular", fontSize: 34, lineHeight: 40 },
  meetName: { fontFamily: "PlayfairDisplay_700Bold", fontSize: 26, lineHeight: 30, marginBottom: 6 },
  sideRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, marginBottom: 6 },
  sideText: { flex: 1, alignItems: "center" },
  welcome: { fontFamily: "Jura-VariableFont_wght", fontWeight: "800", fontSize: 11, letterSpacing: 2 },
  locatedRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  locatedScript: { fontFamily: "Sacramento_400Regular", fontSize: 18 },
  locatedPlace: { fontFamily: "Jura-VariableFont_wght", fontWeight: "800", fontSize: 12, flexShrink: 1 },
  spaKicker: { fontFamily: "TenorSans_400Regular", fontSize: 10, letterSpacing: 4, marginBottom: 10, textAlign: "center" },
  spaLogo: { marginTop: 16 },
});

/** Cover's white pills under the name. */
export function HeroPills({ labels }: { labels: readonly string[] }) {
  return (
    <View style={styles.pillRow}>
      {labels.map(label => (
        <View key={label} style={styles.pill}>
          <Text style={styles.pillText} numberOfLines={1}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", marginBottom: 20, marginTop: 0 },
  wrapper: { position: "relative", width: 148, height: 148 },
  logo: {
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 4,
    borderColor: "rgba(255, 253, 251, 0.9)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 10,
  },
  gloss: { position: "absolute", top: 0, left: 0, width: 148, height: 148, borderRadius: 74 },
  initialsWrap: { alignItems: "center", justifyContent: "center" },
  initials: { color: "#fff", fontSize: 28, fontWeight: "800" },
  arch: { borderRadius: 10, borderTopLeftRadius: 74, borderTopRightRadius: 74 },
  polaroidPhoto: { borderRadius: 0, borderWidth: 0, shadowOpacity: 0, elevation: 0 },
  thinRim: { borderWidth: 2 },
  polaroid: {
    backgroundColor: "#FFFFFF",
    padding: 8,
    paddingBottom: 30,
    transform: [{ rotate: "-3deg" }],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 8,
  },
  glossRing: { position: "absolute", top: -8, left: -8, width: 164, height: 164, borderRadius: 82 },
  doubleRing: { position: "absolute", top: -11, left: -11, width: 170, height: 170, borderRadius: 85, borderWidth: 1.5 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, paddingHorizontal: 24, marginBottom: 12 },
  pill: { height: 28, paddingHorizontal: 12, borderRadius: 100, backgroundColor: "#FFFFFF", justifyContent: "center", maxWidth: 220 },
  pillText: { fontFamily: "BakbakOne-Regular", fontSize: 10, letterSpacing: 1, color: "#1F1A18" },
});
