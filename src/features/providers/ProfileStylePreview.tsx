// src/features/providers/ProfileStylePreview.tsx
//
// Branding's full preview: the top of the provider's public profile as
// clients will see it with the choices on screen right now (saved or not),
// down to the first few sections, empty of content but with every heading in
// place. Built from the same pieces the profile draws — HeroLogo, HeroPills,
// PageSection, PageSectionHeading, StyledPolicyList, serviceCardSurface — so
// a page style can't look one way here and another on the profile. The
// layout numbers that aren't shared (hero spacing, the content sheet, the
// service card) copy ProviderProfileScreen's.

import React, { useMemo } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import ProfileHeroBackdrop from "../../components/ProfileHeroBackdrop";
import { getPageStyle, PAGE_SECTION_TITLES, type PageSectionKey } from "../../constants/pageStyles";
import { resolveProviderFontFamily, resolveProviderFontScale } from "../../constants/providerFonts";
import { isDarkColor, parseThemeKey, resolveProviderTheme, withAlpha } from "../../constants/providerThemes";
import type { LogoFraming } from "../../types/database";
import type { PolicyDisplayRow } from "../../utils/policyDisplay";
import { HERO_NAME_LINE_HEIGHT, HERO_NAME_SIZE, HeroLogo, HeroPills, ProfileHeroLayout } from "./ProfileHero";
import {
  GlossShine,
  onAccentInk,
  PageSection,
  PageSectionHeading,
  PolicyBandSection,
  policiesBringOwnSurface,
  sectionInk,
  serviceCardSurface,
  sheetInk,
  StyledPolicyList,
  type PageStylePalette,
} from "./ProfilePageStyle";

/** The policy headings an empty profile shows: the titles, no values. */
const PREVIEW_POLICY_ROWS: PolicyDisplayRow[] = [
  { icon: "card-outline", label: "Deposit", value: "" },
  { icon: "time-outline", label: "Cancellation", value: "" },
  { icon: "alarm-outline", label: "Late arrival", value: "" },
  { icon: "calendar-outline", label: "Reschedule", value: "" },
];

export interface ProfileStylePreviewProps {
  /** The full profile_theme value for the choices on screen. */
  themeKey: string;
  gradient: readonly string[];
  accent: string;
  backgroundImage: string | null;
  brandFont: string;
  name: string;
  logoUri: string | null;
  logoFraming: LogoFraming | null;
  /** What they do and where: the small-caps line under the name. */
  metaLabels: readonly string[];
  /** The same plus how they work, for Cover's pills. */
  pillLabels: readonly string[];
  /** What they do ("LASHES · BROWS"), for the layouts that print it on its own. */
  kicker: string;
  location: string;
}

export function ProfileStylePreview({
  themeKey,
  gradient,
  accent,
  backgroundImage,
  brandFont,
  name,
  logoUri,
  logoFraming,
  metaLabels,
  pillLabels,
  kicker,
  location,
}: ProfileStylePreviewProps) {
  const { finish, shape, pageStyle: styleKey } = parseThemeKey(themeKey);
  const pageStyle = getPageStyle(styleKey);
  const OP = resolveProviderTheme(themeKey);
  const squareCards = shape === "square";

  // As ProviderProfileScreen works them out.
  const heroIsDark = !!backgroundImage || isDarkColor(gradient[0] ?? OP.hero);
  const heroText = heroIsDark ? "#FFFFFF" : "#26201E";
  const heroSub = heroIsDark ? "rgba(255,255,255,0.96)" : "rgba(38,32,30,0.78)";
  const cardBg = withAlpha(OP.card, OP.isDark ? 0.5 : 0.9);
  const blurTint = OP.isDark ? ("dark" as const) : ("light" as const);
  const blurIntensity = OP.isDark ? 35 : 25;
  const highlight = (OP.isDark
    ? ["rgba(255,255,255,0.08)", "transparent"]
    : ["rgba(255,255,255,0.3)", "transparent"]) as [string, string];

  const palette: PageStylePalette = useMemo(() => ({
    text: OP.text,
    sub: OP.sub,
    border: OP.border,
    separator: OP.sep,
    background: OP.bg,
    cardBackground: cardBg,
    accent,
    blurTint,
    blurIntensity,
    highlightColors: highlight,
    squareCards,
    pageStyle,
  }), [OP.text, OP.sub, OP.border, OP.sep, OP.bg, cardBg, accent, blurTint, blurIntensity, highlight[0], squareCards, pageStyle]); // eslint-disable-line react-hooks/exhaustive-deps

  const page = sheetInk(OP.bg);
  const cardInk = sectionInk(palette);
  const surface = serviceCardSurface(pageStyle, { card: OP.card, accent, sheet: OP.bg });
  const serviceInk = surface && (pageStyle.cards === "none" || pageStyle.cards === "outline") ? page : { text: OP.text, sub: OP.sub };
  const fontScale = resolveProviderFontScale(brandFont);

  const lines = (colour: string, widths: number[] = [100, 92, 64]) => (
    <View style={styles.lines}>
      {widths.map((w, i) => (
        <View key={i} style={[styles.line, { width: `${w}%`, backgroundColor: colour }]} />
      ))}
    </View>
  );

  const jumpKeys: PageSectionKey[] = ["about", "services", "policies", "reviews"];

  return (
    <ScrollView style={{ backgroundColor: OP.bg }} showsVerticalScrollIndicator={false}>
      <View>
        {/* The hero: the backdrop runs behind the logo and name, and the
            content sheet rises over its foot, as on the profile. */}
        <View style={styles.backdrop}>
          {backgroundImage ? (
            <>
              <Image source={{ uri: backgroundImage }} style={StyleSheet.absoluteFill} resizeMode="cover" fadeDuration={0} />
              <LinearGradient
                colors={["rgba(0,0,0,0.38)", "rgba(0,0,0,0.18)", "transparent"]}
                locations={[0, 0.35, 0.62]}
                style={StyleSheet.absoluteFill}
              />
            </>
          ) : (
            <ProfileHeroBackdrop colors={gradient} finish={finish} style={StyleSheet.absoluteFill} />
          )}
        </View>

        <View style={styles.heroInfo}>
          <ProfileHeroLayout
            pageStyle={pageStyle}
            name={name}
            kicker={kicker}
            location={location}
            heroText={heroText}
            heroSub={heroSub}
            heroIsDark={heroIsDark}
            chips={kicker.split(" · ").filter(Boolean).slice(0, 3)}
            chipCard={{ background: cardBg, text: OP.text }}
            renderLogo={size => (
              <HeroLogo
                size={size}
                uri={logoUri}
                framing={logoFraming}
                name={name}
                fallbackColor={accent}
                accent={accent}
                heroText={heroText}
                pageStyle={pageStyle}
              />
            )}
            renderName={({ scale, letterSpacing }) => (
              <Text
                style={[
                  styles.name,
                  {
                    color: heroText,
                    fontFamily: resolveProviderFontFamily(brandFont),
                    fontSize: HERO_NAME_SIZE * fontScale * scale,
                    lineHeight: HERO_NAME_LINE_HEIGHT * fontScale * scale,
                    ...(letterSpacing ? { letterSpacing } : null),
                  },
                  heroIsDark && styles.textShadow,
                ]}
              >
                {name}
              </Text>
            )}
            meta={
              pageStyle.heroPills ? (
                <HeroPills labels={pillLabels} />
              ) : (
                <Text style={[styles.meta, { color: heroSub }, heroIsDark && styles.textShadow]} numberOfLines={1}>
                  {metaLabels.join(" · ")}
                </Text>
              )
            }
            details={
              <>
                <View style={styles.ratingRow}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <Ionicons key={star} name="star" size={12} color="#FFD700" />
                  ))}
                </View>
                <BlurView intensity={blurIntensity} tint={blurTint} style={[styles.slots, { backgroundColor: cardBg, borderColor: OP.border }]}>
                  <Text style={[styles.slotsText, { color: OP.sub }]}>Stay updated</Text>
                  <Ionicons name="notifications-outline" size={16} color={OP.sub} />
                </BlurView>
              </>
            }
            about={pageStyle.aboutInHero ? lines(withAlpha(heroText, 0.45), [100, 94, 70]) : null}
          />
        </View>

        <View style={[styles.sheet, { backgroundColor: OP.bg }]}>
          {pageStyle.jumpBar ? (
            <View style={[styles.jumpBar, { backgroundColor: accent }, squareCards && styles.square]}>
              {jumpKeys.map(key => (
                <View key={key} style={styles.jumpItem}>
                  <Text style={[styles.jumpText, { color: onAccentInk(accent).text }]} numberOfLines={1}>
                    {PAGE_SECTION_TITLES[key].toUpperCase()}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {!pageStyle.separateAboutAndPolicies ? (
            // Classic's tabbed About / Policy card.
            <BlurView
              intensity={blurIntensity}
              tint={blurTint}
              style={[styles.aboutCard, { backgroundColor: cardBg, borderColor: OP.border }, squareCards && styles.square]}
            >
              <LinearGradient colors={highlight} style={StyleSheet.absoluteFill} />
              <View style={[styles.tabs, { borderBottomColor: OP.border }]}>
                <View style={[styles.tab, { borderBottomColor: accent, borderBottomWidth: 2 }]}>
                  <Text style={[styles.tabText, { color: OP.text }]}>About</Text>
                </View>
                <View style={styles.tab}>
                  <Text style={[styles.tabText, { color: OP.sub }]}>Policy</Text>
                </View>
              </View>
              {lines(OP.sep)}
            </BlurView>
          ) : (
            <>
              {!pageStyle.aboutInHero ? (
                <PageSection section="about" palette={palette}>
                  {lines(cardInk.separator)}
                </PageSection>
              ) : null}
              {pageStyle.policies === "band" ? (
                <PolicyBandSection palette={palette}>
                  <StyledPolicyList rows={PREVIEW_POLICY_ROWS} palette={palette} ink={onAccentInk(accent)} />
                </PolicyBandSection>
              ) : (
                <PageSection section="policies" palette={palette} bare={policiesBringOwnSurface(pageStyle)}>
                  <StyledPolicyList
                    rows={PREVIEW_POLICY_ROWS}
                    palette={palette}
                    ink={policiesBringOwnSurface(pageStyle) ? page : cardInk}
                  />
                </PageSection>
              )}
            </>
          )}

          {/* Services */}
          {pageStyle.heading === "plain" ? (
            <Text style={[styles.servicesTitle, { color: OP.text }]}>Services</Text>
          ) : (
            <View style={pageStyle.cards === "none" ? [styles.servicesRule, { borderTopColor: page.separator }] : undefined}>
              <PageSectionHeading section="services" palette={palette} />
            </View>
          )}
          <View style={styles.pillRow}>
            <View style={[styles.categoryPill, { backgroundColor: accent }, squareCards && styles.square]}>
              <View style={[styles.pillBar, { backgroundColor: withAlpha(onAccentInk(accent).text, 0.6) }]} />
            </View>
            <View style={[styles.categoryPill, { backgroundColor: cardBg, borderColor: OP.border, borderWidth: StyleSheet.hairlineWidth }, squareCards && styles.square]}>
              <View style={[styles.pillBar, { backgroundColor: OP.sep }]} />
            </View>
          </View>
          {[0, 1].map(index => (
            <BlurView
              key={index}
              intensity={surface ? 0 : blurIntensity}
              tint={blurTint}
              style={[styles.serviceCard, { backgroundColor: cardBg, borderColor: OP.border }, surface, squareCards && styles.square]}
            >
              {surface ? null : <LinearGradient colors={highlight} style={StyleSheet.absoluteFill} />}
              {pageStyle.cards === "gloss" ? <GlossShine radius={squareCards ? 0 : 28} /> : null}
              <View style={styles.serviceRow}>
                <View style={[styles.serviceThumb, { backgroundColor: withAlpha(accent, 0.11) }]}>
                  <Text style={[styles.serviceThumbText, { color: accent }]}>
                    {pageStyle.numberedServices ? `0${index + 1}` : "S"}
                  </Text>
                </View>
                <View style={styles.serviceText}>
                  <View style={[styles.line, { width: "70%", backgroundColor: withAlpha(serviceInk.text, 0.22) }]} />
                  <View style={[styles.line, { width: "40%", backgroundColor: withAlpha(serviceInk.text, 0.12) }]} />
                </View>
                <View style={[styles.bookPill, { backgroundColor: accent }]}>
                  <Text style={[styles.bookText, { color: onAccentInk(accent).text }]}>Book</Text>
                </View>
              </View>
            </BlurView>
          ))}

          <PageSection section="reviews" palette={palette} style={styles.reviews}>
            {lines(cardInk.separator, [100, 76])}
          </PageSection>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, height: 640 },
  heroInfo: { paddingTop: 100 },
  infoCenter: { alignItems: "center", marginBottom: 30, paddingHorizontal: 20 },
  name: { textAlign: "center", marginBottom: 4 },
  meta: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 1.2,
    textAlign: "center",
    marginBottom: 10,
  },
  textShadow: { textShadowColor: "rgba(0,0,0,0.55)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 8 },
  ratingRow: { flexDirection: "row", gap: 3, marginBottom: 8 },
  slots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  slotsText: { fontFamily: "BakbakOne-Regular", fontSize: 11 },
  sheet: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 140,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    minHeight: 900,
  },
  square: { borderRadius: 0 },
  jumpBar: { flexDirection: "row", borderRadius: 100, marginBottom: 22, paddingHorizontal: 6 },
  jumpItem: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center" },
  jumpText: { fontFamily: "BakbakOne-Regular", fontSize: 10, letterSpacing: 1.6 },
  aboutCard: { padding: 22, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", marginBottom: 20 },
  tabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 14 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10 },
  tabText: { fontFamily: "BakbakOne-Regular", fontSize: 14 },
  lines: { gap: 8 },
  line: { height: 9, borderRadius: 5 },
  servicesTitle: { fontFamily: "BakbakOne-Regular", fontSize: 18, marginBottom: 15, paddingHorizontal: 20 },
  servicesRule: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 22 },
  pillRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  categoryPill: { height: 34, width: 96, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  pillBar: { height: 7, width: 48, borderRadius: 4 },
  serviceCard: { borderRadius: 26, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", marginBottom: 12, padding: 14 },
  serviceRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  serviceThumb: { width: 64, height: 64, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  serviceThumbText: { fontFamily: "BakbakOne-Regular", fontSize: 20 },
  serviceText: { flex: 1, gap: 8 },
  bookPill: { height: 32, paddingHorizontal: 14, borderRadius: 100, justifyContent: "center" },
  bookText: { fontFamily: "BakbakOne-Regular", fontSize: 12 },
  reviews: { marginTop: 12 },
});
