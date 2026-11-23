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

import React, { useEffect, useMemo, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import ProfileHeroBackdrop from "../../components/ProfileHeroBackdrop";
import type { CustomPartKey } from "../../constants/customPageStyle";
import { getPageStyle, PAGE_SECTION_TITLES, policyPicturePlacement, type PageSectionKey } from "../../constants/pageStyles";
import CategoryTabPill from "../../components/CategoryTabPill";
import { ExpandableAboutText } from "./ExpandableAboutText";
import { PolicyPagesCompact, PolicyPagesInline, PolicyPagesShowcase, PolicyStoryRings, usePolicyEdgeColours } from "./PolicyPages";
import type { PolicyImageEdge } from "./policyImages";
import { resolveProviderFontFamily, resolveProviderFontScale, resolveProviderNameLineHeight } from "../../constants/providerFonts";
import { isDarkColor, parseThemeKey, resolveProviderTheme, withAlpha } from "../../constants/providerThemes";
import type { DbPortfolioItem, LogoFraming } from "../../types/database";
import { ProviderPortfolioSection } from "./ProviderProfileSections";
import type { PolicyDisplayRow } from "../../utils/policyDisplay";
import { formatDurationMinutes } from "../../utils/dateUtils";
import { formatAddOnExtraTime } from "../bookings/addOnTime";
import { VeilBackdrop, veilAccent, veilPageTheme } from "./heroes/SheerHero";
import { PagePattern, SectionDivider } from "./pageParts";
import { DETAILS_OWN_LINE, HERO_NAME_SIZE, HeroLogo, HeroPills, ProfileHeroLayout, detailsSitOnCard, heroIsDarkForStyle, heroNameFontStyle, pickedNameFont } from "./ProfileHero";
import {
  GlossShine,
  onAccentInk,
  PageSection,
  PageSectionHeading,
  AccentBandSection,
  RuledJumpBar,
  policiesBringOwnSurface,
  sectionInk,
  customTextStyle,
  sectionsSitOnPage,
  serviceCardSurface,
  sheetInk,
  StyledPolicyList,
  type PageStylePalette,
} from "./ProfilePageStyle";
import type { HeroPhotoFrames } from "./HeroPhoto";

const noop = () => {};

/** Two blank pages, so Branding shows how a Policy Pictures layout sits on
 *  the page before any policy picture has been uploaded. */
const PLACEHOLDER_POLICY_PAGES = [
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAoCAIAAABmcd1FAAAALElEQVR42u3MMQ0AAAgDsPm3yMeFDFRwkDTp3UzXkajVarVarVar1Wq1+n+9naJmJUz8VlkAAAAASUVORK5CYII=",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAoCAIAAABmcd1FAAAALElEQVR42u3MMQ0AAAgDsPm3xsuJGFRwkDTp3UzXkajVarVarVar1Wq1+n+9tdqhNg89zK8AAAAASUVORK5CYII=",
];
const NO_EDGES: Record<string, PolicyImageEdge> = {};

/** A see-through grey square: Branding draws the portfolio's shapes in it
 *  before any work photo has been uploaded, as it does the policy pages. */
const PLACEHOLDER_PHOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOor693AAAEvAG+rzf9wwAAAABJRU5ErkJggg==";
const PLACEHOLDER_PORTFOLIO: DbPortfolioItem[] = [0.8, 1.1, 1, 0.75, 1.2, 0.9].map((aspect_ratio, index) => ({
  id: `preview-photo-${index}`,
  provider_id: "",
  service_id: null,
  image_url: PLACEHOLDER_PHOTO,
  caption: null,
  category: null,
  tags: null,
  price: null,
  aspect_ratio,
  is_featured: false,
  hero_frame: null,
  created_at: "",
  vibe_tags: null,
  occasion_tags: null,
  trend_names: null,
  hair_type_shown: null,
  skin_tone_shown: null,
}));

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
  /** The photos the hero shows, as Branding → Your Photos has them right now
   *  (Editorial, Snapshot, Hush), or their newest (Bow). */
  photoUris?: readonly string[];
  /** How each of those photos is framed, by URL (Your Photos → Adjust). Memoized by the caller. */
  photoFrames?: HeroPhotoFrames;
  /** Their own About, menu categories and first services, so the preview
   *  reads like their page rather than grey bars (owner, 2026-11-17: "make
   *  preview more accurate"). Anything missing falls back to the bars. */
  content?: PreviewContent | undefined;
  /** Their policy pictures (booking_policies). Shown in the Policy Pictures
   *  layout the theme picks; with none, Branding shows blank pages so the
   *  layout can still be seen, and a full preview shows none, as the profile. */
  policyPages?: readonly string[] | undefined;
  policyEdges?: Record<string, PolicyImageEdge> | undefined;
  /** Their rating as the profile prints it ("4.8", "0"). */
  rating?: string | undefined;
  /** Info Reg's preview: every category and service and the whole About,
   *  rather than Branding's outline of the first few. */
  full?: boolean;
  /** Their work photos. When supplied, an empty list has the same meaning as
   *  on the public profile: there is no Portfolio section. Omit this prop to
   *  show sample photo shapes while browsing a style in isolation. */
  portfolio?: readonly DbPortfolioItem[] | undefined;
  /** More of the page after Reviews, before the portfolio (Info Reg adds Contact). */
  children?: React.ReactNode;
  /** After the portfolio (Info Reg adds Venue). */
  afterPortfolio?: React.ReactNode;
  /** How far above the screen's foot Riviera's pinned Book bar sits, so it
   *  clears whatever the screen puts along the bottom (Branding's styles row). */
  pinnedBarBottom?: number;
  /** Branding → Custom's Tap Your Page: each part of the page is outlined,
   *  and tapping one picks that part to change. */
  editParts?: { active: CustomPartKey; onPress: (part: CustomPartKey) => void; accent: string } | undefined;
}

export interface PreviewService {
  name: string;
  minutes: number;
  price: number;
  /** Its first photo, when it has one. */
  imageUri?: string | null;
  /** The add-ons ticked on it that clients can pick, for Info Reg's preview. */
  addOns?: readonly PreviewAddOn[];
}

export interface PreviewAddOn {
  key: string;
  name: string;
  price: number;
  extraMinutes: number;
}

/** What Branding / Info Reg have of the provider's page, for the preview. */
export interface PreviewContent {
  about: string;
  categories: readonly string[];
  /** The first category's first services (Branding's outline). */
  services: readonly PreviewService[];
  /** Every category's services, so tapping a pill shows that category. */
  servicesByCategory?: Readonly<Record<string, readonly PreviewService[]>>;
  categoryDescriptions?: Readonly<Record<string, string>>;
}

/** "£45", or "£45.50" when there are pence. */
function previewPrice(price: number): string {
  return `£${Number.isInteger(price) ? price : price.toFixed(2)}`;
}

export function ProfileStylePreview({
  themeKey,
  gradient,
  accent: rawAccent,
  backgroundImage,
  brandFont,
  name,
  logoUri,
  logoFraming,
  metaLabels,
  pillLabels,
  kicker,
  location,
  photoUris,
  photoFrames,
  content,
  policyPages,
  policyEdges,
  rating,
  full = false,
  portfolio,
  children,
  afterPortfolio,
  pinnedBarBottom = 40,
  editParts,
}: ProfileStylePreviewProps) {
  // Tap Your Page: a part of the page in a dashed outline with its name on
  // it; the one they're changing is drawn solid. Its content takes no
  // touches, so a tap anywhere on it picks the part.
  const zone = (part: CustomPartKey, label: string, node: React.ReactNode, onHero = false) => {
    if (!editParts) return node;
    const on = editParts.active === part;
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => editParts.onPress(part)}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`${label}. Tap to change`}
        style={[
          onHero ? styles.zoneHero : styles.zone,
          { borderColor: editParts.accent, borderStyle: on ? "solid" : "dashed", borderWidth: on ? 2.5 : 1.5 },
        ]}
      >
        <View pointerEvents="none">{node}</View>
        <View pointerEvents="none" style={[styles.zoneLabel, { backgroundColor: editParts.accent }]}>
          <Text style={[styles.zoneLabelText, { color: onAccentInk(editParts.accent).text }]}>{label}</Text>
        </View>
      </TouchableOpacity>
    );
  };
  const { finish, shape, pageStyle: styleKey, custom } = parseThemeKey(themeKey);
  const pageStyle = getPageStyle(styleKey, custom);
  const bodyFont = customTextStyle(pageStyle);
  const baseTheme = resolveProviderTheme(themeKey);
  // As on the profile: a veil page (Sheer) puts the content on dark glass.
  const veilTheme = pageStyle.veilPage ? veilPageTheme(baseTheme) : null;
  const OP = veilTheme ?? baseTheme;
  const accent = veilTheme ? veilAccent(rawAccent) : rawAccent;
  const squareCards = shape === "square";

  // As ProviderProfileScreen works them out.
  const heroIsDark = heroIsDarkForStyle(pageStyle) || !!backgroundImage || isDarkColor(gradient[0] ?? OP.hero);
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
  const arches = pageStyle.serviceLayout === "archTiles";
  const tiles = pageStyle.serviceLayout === "tiles" || arches;
  const photoCards = pageStyle.serviceLayout === "photoCards";
  const spotlight = pageStyle.serviceLayout === "spotlight";
  const pills = pageStyle.serviceLayout === "pillMenu";
  const menu = pageStyle.serviceLayout === "menu" || pills;
  const textLink = pageStyle.buttonShape === "textLink";
  const outlineBook = pageStyle.buttonShape === "outline" || pageStyle.buttonShape === "shopBox";
  const arrowBook = pageStyle.buttonShape === "arrowPill";
  const shopBook = pageStyle.buttonShape === "shopBox";
  const serviceInk = surface && sectionsSitOnPage(pageStyle) ? page : { text: OP.text, sub: OP.sub };
  const fontScale = resolveProviderFontScale(brandFont);

  const lines = (colour: string, widths: number[] = [100, 92, 64]) => (
    <View style={styles.lines}>
      {widths.map((w, i) => (
        <View key={i} style={[styles.line, { width: `${w}%`, backgroundColor: colour }]} />
      ))}
    </View>
  );

  const jumpKeys: PageSectionKey[] = ["about", "services", "policies", "reviews"];
  const about = content?.about.trim() ?? "";
  // Their About in the section's ink, or the bars when they haven't written one.
  const aboutBody = (ink: string, barColour: string, widths?: number[]) => (about
    ? full
      ? <ExpandableAboutText text={about} textStyle={[styles.aboutText, { color: ink }, bodyFont]} linkStyle={styles.aboutMoreRow} linkTextStyle={[styles.aboutMore, { color: ink }]} />
      : <Text style={[styles.aboutText, { color: ink }, bodyFont]} numberOfLines={4}>{about}</Text>
    : lines(barColour, widths));
  const categories = content?.categories ?? [];
  const [selectedCategory, setSelectedCategory] = useState(categories[0] ?? "");
  useEffect(() => {
    if (categories.length > 0 && !categories.includes(selectedCategory)) setSelectedCategory(categories[0] ?? "");
  }, [categories, selectedCategory]);
  const servicesForSelected = content?.servicesByCategory?.[selectedCategory]
    ?? (selectedCategory === categories[0] ? content?.services : undefined)
    ?? [];
  // Info Reg shows the lot. Branding keeps two outline cards and lists none of
  // their services: it's about the look, not the menu (owner, 2026-11-18).
  const services = full ? servicesForSelected : [];
  const categoryDescription = full ? content?.categoryDescriptions?.[selectedCategory]?.trim() : undefined;

  // Policy pictures, in the layout Branding → Policy Pictures picks. Classic
  // keeps them behind the About card's Policy tab, as on the profile.
  const { policyLook } = parseThemeKey(themeKey);
  const policyPlacement = policyPicturePlacement(policyLook);
  const realPages = policyPages ?? [];
  const pages = realPages.length > 0 ? realPages : full ? [] : PLACEHOLDER_POLICY_PAGES;
  const edges = usePolicyEdgeColours(realPages.length > 0 ? realPages : [], policyEdges ?? NO_EDGES);
  const showPolicyPages = pageStyle.key !== "classic" && pages.length > 0;

  // The portfolio, in the style's own photo layout and heading.
  const portfolioItems = portfolio !== undefined
    ? (portfolio as DbPortfolioItem[])
    : full ? [] : PLACEHOLDER_PORTFOLIO;
  const portfolioSection = (
    <ProviderPortfolioSection items={portfolioItems} palette={palette} onOpenImage={noop} interactiveImages={false} />
  );
  // Riviera's pinned Book bar: their cheapest service, as on the profile.
  const pinnedService = (content?.services ?? []).reduce<PreviewService | null>(
    (low, service) => (service.price > 0 && (low === null || service.price < low.price) ? service : low),
    null,
  );
  const squareButtons = pageStyle.buttonShape === "square";

  return (
    <View style={[styles.root, { backgroundColor: OP.bg }]}>
      {/* The backdrop fills the screen and stays put while the page scrolls,
          as on the profile: the photo (at the profile's 88%) or the colours
          behind the hero, down the sides of the inset sheet, and under a
          veil page's glass. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {backgroundImage ? (
          <>
            <Image source={{ uri: backgroundImage }} style={[StyleSheet.absoluteFill, styles.backgroundPhoto]} resizeMode="cover" fadeDuration={0} />
            <LinearGradient
              colors={["rgba(0,0,0,0.38)", "rgba(0,0,0,0.18)", "transparent"]}
              locations={[0, 0.35, 0.62]}
              style={StyleSheet.absoluteFill}
            />
          </>
        ) : (
          <ProfileHeroBackdrop colors={gradient} finish={finish} style={StyleSheet.absoluteFill} />
        )}
        {veilTheme ? <VeilBackdrop /> : null}
      </View>
    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
      <View>
        <View style={styles.heroInfo}>
          {zone("top", "Top", <ProfileHeroLayout
            pageStyle={pageStyle}
            pickedNameFont={pickedNameFont(pageStyle, brandFont)}
            name={name}
            kicker={kicker}
            location={location}
            heroText={heroText}
            heroSub={heroSub}
            heroIsDark={heroIsDark}
            accent={accent}
            heroColour={gradient[0] ?? OP.hero}
            cardColour={OP.card}
            sheetColour={veilTheme ? veilTheme.sheetFill : OP.bg}
            photoUris={photoUris ?? []}
            {...(photoFrames ? { photoFrames } : {})}
            rating={rating && Number(rating) > 0 ? rating : null}
            // The preview has no Services to jump to, but Studio's Book now
            // still shows, so the provider sees the hero as clients will.
            onBookNow={noop}
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
                  pageStyle.heroNameFont
                    ? { color: heroText, ...heroNameFontStyle(pageStyle.heroNameFont, HERO_NAME_SIZE * scale, pickedNameFont(pageStyle, brandFont)) }
                    : {
                        color: heroText,
                        fontFamily: resolveProviderFontFamily(brandFont),
                        fontSize: HERO_NAME_SIZE * fontScale * scale,
                        lineHeight: resolveProviderNameLineHeight(brandFont, HERO_NAME_SIZE * fontScale * scale),
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
                {/* On Duet's card they lead the line, as on the profile. */}
                <View style={[styles.ratingRow, detailsSitOnCard(pageStyle) && styles.ratingRowInline]}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <Ionicons key={star} name="star" size={12} color="#FFD700" />
                  ))}
                  {rating !== undefined ? (
                    <Text style={[
                      styles.ratingText,
                      { color: heroText },
                      heroIsDark && styles.textShadow,
                    ]}>{rating}</Text>
                  ) : null}
                </View>
                <View style={detailsSitOnCard(pageStyle) ? DETAILS_OWN_LINE : undefined}>
                  <BlurView intensity={blurIntensity} tint={blurTint} style={[styles.slots, { backgroundColor: cardBg, borderColor: OP.border }]}>
                    <Text style={[styles.slotsText, { color: OP.sub }]}>Stay updated</Text>
                    <Ionicons name="notifications-outline" size={16} color={OP.sub} />
                  </BlurView>
                </View>
              </>
            }
            about={pageStyle.aboutInHero ? lines(withAlpha(heroText, 0.45), [100, 94, 70]) : null}
          />, true)}
        </View>

        <View
          style={[
            styles.sheet,
            { backgroundColor: veilTheme ? veilTheme.sheetFill : OP.bg },
            // As on the profile: over a background photo the sheet is pulled
            // in so the photo shows down its sides.
            backgroundImage || veilTheme ? styles.sheetFloating : null,
            veilTheme && styles.sheetGlass,
            pageStyle.pinnedBookBar && styles.sheetPinnedBar,
          ]}
        >
          {pageStyle.pagePattern ? (
            <PagePattern pattern={pageStyle.pagePattern} accent={accent} onDark={isDarkColor(OP.bg)} style={styles.sheetPattern} />
          ) : null}
          {pageStyle.jumpBar && pageStyle.jumpBarRuled ? (
            <RuledJumpBar sections={jumpKeys} sheet={veilTheme ? veilTheme.sheetFill : OP.bg} />
          ) : pageStyle.jumpBar ? (
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

          {showPolicyPages && policyPlacement === "top" ? (
            <PolicyStoryRings urls={pages} accent={accent} sheet={veilTheme ? veilTheme.sheetFill : OP.bg} onOpen={noop} />
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
              {aboutBody(OP.text, OP.sep)}
            </BlurView>
          ) : (
            <>
              {/* Work first (Posy, Noir): the portfolio straight after the top. */}
              {pageStyle.portfolioFirst ? portfolioSection : null}
              {!pageStyle.aboutInHero && pageStyle.aboutOnBand ? (
                <AccentBandSection section="about" palette={palette} waves={false}>
                  {aboutBody(onAccentInk(accent).text, withAlpha(onAccentInk(accent).text, 0.35))}
                </AccentBandSection>
              ) : !pageStyle.aboutInHero ? (
                zone("surface", "Sections", (
                  <PageSection section="about" palette={palette}>
                    {aboutBody(cardInk.text, cardInk.separator)}
                  </PageSection>
                ))
              ) : null}
              {pageStyle.policies === "band" ? (
                <AccentBandSection section="policies" palette={palette}>
                  <StyledPolicyList rows={PREVIEW_POLICY_ROWS} palette={palette} ink={onAccentInk(accent)} />
                </AccentBandSection>
              ) : zone("policies", "Policies", (
                <PageSection section="policies" palette={palette} bare={policiesBringOwnSurface(pageStyle)}>
                  <StyledPolicyList
                    rows={PREVIEW_POLICY_ROWS}
                    palette={palette}
                    ink={policiesBringOwnSurface(pageStyle) ? page : cardInk}
                  />
                </PageSection>
              ))}
            </>
          )}

          {/* Services */}
          {pageStyle.heading === "plain" ? (
            <Text style={[styles.servicesTitle, { color: OP.text }]}>Services</Text>
          ) : zone("headingStyle", "Headings", (
            <View>
              {pageStyle.divider ? <SectionDivider divider={pageStyle.divider} accent={accent} /> : null}
              <View
                style={[
                  pageStyle.cards === "none" && [styles.servicesRule, { borderTopColor: page.separator }],
                  // Stripes: the title sits lower on its strip, as on the profile.
                  pageStyle.cards === "stripes" && styles.stripesServicesHeading,
                ]}
              >
                <PageSectionHeading section="services" palette={palette} />
              </View>
            </View>
          ))}
          {categories.length > 0 ? (
            // The profile's own pills: frosted, springing on press, and the
            // row scrolls rather than cutting names off.
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.pillScroll}
              contentContainerStyle={styles.pillScrollContent}
            >
              {categories.map(category => {
                const on = category === selectedCategory;
                return (
                  <CategoryTabPill
                    key={category}
                    category={category}
                    isSelected={on}
                    onPress={() => setSelectedCategory(category)}
                    cardBg={on ? accent : cardBg}
                    blurIntensity={blurIntensity}
                    blurTint={blurTint}
                    borderColor={on ? "transparent" : OP.border}
                    textColor={on ? "#FFFFFF" : OP.text}
                    square={squareCards}
                  />
                );
              })}
            </ScrollView>
          ) : (
            <View style={styles.pillRow}>
              {[0, 1].map(index => (
                <View
                  key={index}
                  style={[
                    styles.categoryPill,
                    index === 0 ? { backgroundColor: accent } : { backgroundColor: cardBg, borderColor: OP.border, borderWidth: StyleSheet.hairlineWidth },
                    squareCards && styles.square,
                  ]}
                >
                  <View style={[styles.pillBar, { backgroundColor: index === 0 ? withAlpha(onAccentInk(accent).text, 0.6) : OP.sep }]} />
                </View>
              ))}
            </View>
          )}
          {categoryDescription ? (
            <Text style={[styles.categoryDescription, { color: OP.sub }]}>{categoryDescription}</Text>
          ) : null}
          {zone("services", "Services", <View style={tiles ? styles.tilesGrid : undefined}>{(services.length > 0 ? services.map((_, index) => index) : [0, 1]).map(index => (
            <BlurView
              key={index}
              intensity={surface ? 0 : blurIntensity}
              tint={blurTint}
              style={[styles.serviceCard, { backgroundColor: cardBg, borderColor: OP.border }, surface, squareCards && styles.square, tiles && styles.tile]}
            >
              {surface ? null : <LinearGradient colors={highlight} style={StyleSheet.absoluteFill} />}
              {pageStyle.cards === "gloss" ? <GlossShine radius={squareCards ? 0 : 28} /> : null}
              <View style={[styles.serviceRow, tiles && styles.tileColumn, photoCards && styles.photoCardRow]}>
                {menu ? null : (
                <View style={[styles.serviceThumb, tiles && styles.tileThumb, photoCards && styles.photoCardThumb, spotlight && styles.spotlightThumb, arches && styles.archThumb, { backgroundColor: withAlpha(accent, arches ? 0.16 : 0.11) }]}>
                  {services[index]?.imageUri && !pageStyle.numberedServices ? (
                    <Image source={{ uri: services[index]!.imageUri! }} style={arches ? styles.archThumbImage : tiles || photoCards || spotlight ? StyleSheet.absoluteFill : styles.serviceThumbImage} fadeDuration={0} />
                  ) : (
                    <Text style={[styles.serviceThumbText, { color: accent }]}>
                      {pageStyle.numberedServices ? `${index + 1 < 10 ? "0" : ""}${index + 1}` : (services[index]?.name.trim().charAt(0).toUpperCase() || "S")}
                    </Text>
                  )}
                </View>
                )}
                {services[index] ? (
                  <View style={styles.serviceText}>
                    {pills ? (
                      <View style={styles.menuRow}>
                        <View style={[styles.pillName, { backgroundColor: accent }]}>
                          <Text style={[styles.pillNameText, { color: onAccentInk(accent).text }]} numberOfLines={1}>{services[index].name.toUpperCase()}</Text>
                        </View>
                        <Text style={[styles.serviceName, { color: serviceInk.text }, bodyFont]}>{previewPrice(services[index].price)}</Text>
                      </View>
                    ) : menu ? (
                      // Muse: the printed menu line, as on the profile.
                      <View style={styles.menuRow}>
                        <Text style={[styles.serviceName, styles.menuName, { color: serviceInk.text }, bodyFont]} numberOfLines={1}>{services[index].name}</Text>
                        <View style={[styles.menuLeader, { borderBottomColor: serviceInk.sub }]} />
                        <Text style={[styles.serviceName, { color: serviceInk.text }, bodyFont]}>{previewPrice(services[index].price)}</Text>
                      </View>
                    ) : (
                      <Text style={[styles.serviceName, { color: serviceInk.text }, bodyFont, spotlight && styles.spotlightName]} numberOfLines={1}>{spotlight ? services[index].name.toUpperCase() : services[index].name}</Text>
                    )}
                    <Text style={[styles.serviceMeta, { color: serviceInk.sub }, bodyFont]} numberOfLines={1}>
                      {menu
                        ? formatDurationMinutes(services[index].minutes)
                        : [formatDurationMinutes(services[index].minutes), previewPrice(services[index].price)].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.serviceText}>
                    <View style={[styles.line, { width: "70%", backgroundColor: withAlpha(serviceInk.text, 0.22) }]} />
                    <View style={[styles.line, { width: "40%", backgroundColor: withAlpha(serviceInk.text, 0.12) }]} />
                  </View>
                )}
                <View style={[styles.bookPill, pageStyle.buttonShape === "square" && styles.bookSquare, { backgroundColor: textLink || outlineBook ? "transparent" : accent }, outlineBook && [styles.bookOutline, { borderColor: serviceInk.text }], shopBook && styles.bookShopBox, arrowBook && styles.bookArrow]}>
                  <Text style={[styles.bookText, pageStyle.buttonShape === "square" && styles.bookSquareText, { color: textLink ? accent : outlineBook ? serviceInk.text : onAccentInk(accent).text }, textLink && styles.bookLinkText, shopBook && styles.bookShopText]}>{arrowBook || shopBook ? "Book now" : "Book"}</Text>
                  {arrowBook ? (
                    <View style={[styles.bookArrowCircle, { borderColor: onAccentInk(accent).text }]}>
                      <Ionicons name="chevron-forward" size={10} color={onAccentInk(accent).text} />
                    </View>
                  ) : null}
                </View>
              </View>
              {services[index]?.addOns?.length ? (
                <View style={[styles.addOns, { borderTopColor: OP.border }]}>
                  <Text style={[styles.addOnsLabel, { color: serviceInk.sub }, bodyFont]}>Add-ons available:</Text>
                  {services[index]!.addOns!.map(addOn => (
                    <View key={addOn.key} style={styles.addOnRow}>
                      <Text style={[styles.addOnName, { color: serviceInk.sub }, bodyFont]} numberOfLines={1}>
                        + {addOn.name}{addOn.extraMinutes > 0 ? ` (${formatAddOnExtraTime(addOn.extraMinutes)})` : ""}
                      </Text>
                      <Text style={[styles.addOnPrice, { color: accent }]}>+{previewPrice(addOn.price)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </BlurView>
          ))}</View>)}

          {showPolicyPages && policyPlacement === "afterServices" ? (
            policyLook === "framed" || policyLook === "swipe" || policyLook === "fan" || policyLook === "peek" ? (
              <PolicyPagesShowcase urls={pages} edges={edges} look={policyLook} palette={palette} onOpenPage={noop} onOpenAll={noop} />
            ) : policyLook === "thumbs" || policyLook === "button" ? (
              <PolicyPagesCompact urls={pages} look={policyLook} palette={palette} onOpenPage={noop} onOpenAll={noop} />
            ) : (
              <PolicyPagesInline urls={pages} edges={edges} look={policyLook} palette={palette} onOpen={noop} />
            )
          ) : null}

          <PageSection section="reviews" palette={palette} style={styles.reviews}>
            {lines(cardInk.separator, [100, 76])}
          </PageSection>
          {children}
          {/* Every other style keeps its portfolio further down the page. */}
          {pageStyle.portfolioFirst && pageStyle.separateAboutAndPolicies ? null : portfolioSection}
          {afterPortfolio}
        </View>
      </View>
    </ScrollView>
      {/* Riviera: the Book bar pinned over the foot of the page. */}
      {pageStyle.pinnedBookBar ? (
        <View pointerEvents="none" style={[styles.pinnedBar, squareButtons && styles.pinnedBarSquare, { bottom: pinnedBarBottom, backgroundColor: OP.card, borderColor: OP.border }]}>
          <View style={styles.pinnedText}>
            <Text style={[styles.pinnedName, { color: OP.text }, bodyFont]} numberOfLines={1}>{name}</Text>
            {pinnedService !== null ? (
              <Text style={[styles.pinnedPrice, { color: OP.sub }, bodyFont]} numberOfLines={1}>{pinnedService.name} · {previewPrice(pinnedService.price)}</Text>
            ) : (
              <View style={[styles.line, styles.pinnedPriceBar, { backgroundColor: withAlpha(OP.text, 0.14) }]} />
            )}
          </View>
          <View style={[styles.pinnedButton, squareButtons && styles.bookSquare, { backgroundColor: accent }]}>
            <Text style={[styles.pinnedButtonText, squareButtons && styles.bookSquareText]}>Book</Text>
          </View>
          <View style={styles.pinnedClose}>
            <Ionicons name="close" size={18} color={OP.sub} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { backgroundColor: "transparent" },
  // As ProviderProfileScreen's background photo.
  backgroundPhoto: { opacity: 0.88 },
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
  ratingRowInline: { marginBottom: 0 },
  ratingText: { fontSize: 13, fontWeight: "700", marginLeft: 4 },
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
    // The profile's sheet shadow (ProviderPageSheet contentSheet).
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  square: { borderRadius: 0 },
  // Over a background photo, or a veil page: inset so the photo shows down its sides.
  sheetFloating: { marginHorizontal: 10 },
  // Riviera: room at the foot for the pinned Book bar.
  sheetPinnedBar: { paddingBottom: 210 },
  // Sheer: see-through glass over the veil, edged in a hairline.
  sheetGlass: {
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: "rgba(255,255,255,0.22)",
    shadowOpacity: 0,
    elevation: 0,
  },
  stripesServicesHeading: { paddingTop: 18 },
  // Riviera's pinned bar, as ProviderProfileScreen's pinnedBookBar.
  pinnedBar: {
    position: "absolute",
    left: 16,
    right: 16,
    height: 62,
    borderRadius: 31,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 20,
    paddingRight: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
  },
  pinnedBarSquare: { borderRadius: 6 },
  pinnedText: { flex: 1, minWidth: 0 },
  pinnedClose: { width: 30, height: 30, marginLeft: -4, alignItems: "center", justifyContent: "center" },
  pinnedName: { fontFamily: "BakbakOne-Regular", fontSize: 14 },
  pinnedPrice: { fontSize: 12, marginTop: 2 },
  pinnedPriceBar: { width: 60, height: 7, marginTop: 6 },
  pinnedButton: { height: 46, paddingHorizontal: 24, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  pinnedButtonText: { fontFamily: "BakbakOne-Regular", fontSize: 14, color: "#FFFFFF" },
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
  // As the profile's category row: room above and below for the press spring.
  pillScroll: { marginBottom: 12, maxHeight: 60, marginHorizontal: -20 },
  pillScrollContent: { gap: 12, paddingVertical: 8, paddingHorizontal: 20 },
  categoryDescription: { fontFamily: "Jura-VariableFont_wght", fontSize: 13, lineHeight: 19, marginBottom: 12 },
  serviceThumbImage: { width: 64, height: 64, borderRadius: 14 },
  // Posy: two tiles across, the photo on top, as on the profile.
  tilesGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  tile: { width: "48.5%", padding: 8 },
  spotlightThumb: { borderRadius: 32, overflow: "hidden" },
  spotlightName: { fontFamily: "Oswald-Bold", fontSize: 15, lineHeight: 20 },
  archThumb: { width: "100%", height: undefined, aspectRatio: 0.82, padding: 6, borderTopLeftRadius: 999, borderTopRightRadius: 999, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, overflow: "hidden" },
  archThumbImage: { flex: 1, width: "100%", borderTopLeftRadius: 999, borderTopRightRadius: 999, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  pillName: { borderRadius: 30, paddingHorizontal: 12, paddingVertical: 6, flexShrink: 1 },
  pillNameText: { fontFamily: "Manrope-Bold", fontSize: 11, letterSpacing: 0.5 },
  bookArrow: { flexDirection: "row", alignItems: "center", gap: 7, paddingRight: 6 },
  bookArrowCircle: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.3, alignItems: "center", justifyContent: "center" },
  bookShopBox: { borderWidth: 1, borderRadius: 1 },
  bookShopText: { fontSize: 10, letterSpacing: 2, textTransform: "uppercase" },
  tileColumn: { flexDirection: "column", alignItems: "stretch", gap: 8 },
  tileThumb: { width: "100%", height: undefined, aspectRatio: 1.2, overflow: "hidden" },
  // Riviera: a wide photo on top, the details and Book wrapping under it.
  photoCardRow: { flexWrap: "wrap" },
  photoCardThumb: { width: "100%", height: undefined, aspectRatio: 2, overflow: "hidden" },
  sheetPattern: { borderTopLeftRadius: 36, borderTopRightRadius: 36, overflow: "hidden" },
  categoryPill: { height: 34, width: 96, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  pillBar: { height: 7, width: 48, borderRadius: 4 },
  serviceCard: { borderRadius: 26, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", marginBottom: 12, padding: 14 },
  serviceRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  serviceThumb: { width: 64, height: 64, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  serviceThumbText: { fontFamily: "BakbakOne-Regular", fontSize: 20 },
  serviceText: { flex: 1, gap: 8 },
  serviceName: { fontSize: 15, fontWeight: "600" },
  serviceMeta: { fontSize: 13, marginTop: -4 },
  addOns: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 8 },
  addOnsLabel: { fontSize: 11, fontWeight: "600", marginBottom: 4 },
  addOnRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingVertical: 3 },
  addOnName: { flex: 1, fontSize: 12, fontWeight: "600" },
  addOnPrice: { fontFamily: "BakbakOne-Regular", fontSize: 12 },
  aboutText: { fontSize: 14, lineHeight: 21 },
  aboutMore: { fontFamily: "BakbakOne-Regular", fontSize: 12 },
  aboutMoreRow: { marginTop: 8, alignSelf: "flex-start" },
  categoryPillText: { width: undefined, paddingHorizontal: 16, maxWidth: 170 },
  categoryText: { fontSize: 13, fontWeight: "600" },
  bookPill: { height: 32, paddingHorizontal: 14, borderRadius: 100, justifyContent: "center" },
  bookText: { fontFamily: "BakbakOne-Regular", fontSize: 12 },
  // Noir: square Book buttons, the word in spaced capitals.
  bookSquare: { borderRadius: 2 },
  bookLinkText: { textDecorationLine: "underline" },
  bookOutline: { borderWidth: 1.5 },
  // Muse's printed menu line.
  menuRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  menuName: { flexShrink: 1 },
  menuLeader: { flex: 1, minWidth: 12, borderBottomWidth: 1, borderStyle: "dotted", marginBottom: 4 },
  bookSquareText: { textTransform: "uppercase", letterSpacing: 1.4 },
  reviews: { marginTop: 12 },
  zone: { marginHorizontal: -8, paddingHorizontal: 6.5, paddingTop: 6, borderRadius: 20, marginBottom: 12 },
  zoneHero: { marginHorizontal: 8, paddingTop: 6, borderRadius: 24, marginBottom: 12 },
  zoneLabel: { position: "absolute", top: -11, left: 14, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 },
  zoneLabelText: { fontFamily: "BakbakOne-Regular", fontSize: 11 },
});
