import React from "react";
import {
  Alert,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { ViewInstance } from "react-native";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { BellIcon } from "../../../components/IconLibrary";
import { isDarkColor } from "../../../constants/providerThemes";
import {
  resolveProviderFontFamily,
  resolveProviderFontScale,
  resolveProviderNameLineHeight,
} from "../../../constants/providerFonts";
import type { ProviderStatKind } from "../../../types/database";
import { slotsPillText } from "../../../utils/slotsRowText";
import { RecommendBadge, type useProviderRecommend } from "../../social/ProviderRecommend";
import { ExpandableAboutText } from "../ExpandableAboutText";
import {
  DETAILS_OWN_LINE,
  HERO_NAME_LINE_HEIGHT,
  HERO_NAME_SIZE,
  HeroLogo,
  HeroPills,
  heroNameFontStyle,
  ProfileHeroLayout,
} from "../ProfileHero";
import { BUSINESS_TYPE_ICON, BUSINESS_TYPE_LABEL } from "../profilePresentation";
import type { ProviderProfileData } from "../profileTypes";
import type { ProviderPagePalette } from "./providerPagePalette";

const SERIF = "Prata-Regular";
const NAME_SIZE = HERO_NAME_SIZE;
const NAME_LINE_HEIGHT = HERO_NAME_LINE_HEIGHT;

const StarIcon = ({ size, color }: { size: number; color: string }) => (
  <Text style={{ fontSize: size, color }}>★</Text>
);

export interface ProviderPageHeroProps {
  provider: ProviderProfileData;
  palette: ProviderPagePalette;
  /** The photos the hero shows (Editorial, Snapshot, Hush, Bow). */
  heroPhotoUris: string[];
  isLinkOnly: boolean;
  /** Recommend's badge on the logo, when the viewer has one to show. */
  recommendHeart: ReturnType<typeof useProviderRecommend>["heart"];
  /** The bell beside the availability pill. */
  bell: { enabled: boolean; loading: boolean; canSave: boolean };
  /** Where Arch and Framed carry their About, for scroll-back on collapse. */
  aboutCardRef: React.RefObject<ViewInstance | null>;
  onOpenHeroPhoto: (index: number) => void;
  onOpenLogo: () => void;
  /** Cover's Book now: jumps to the price list. Not shown for link-only. */
  onBookNow: () => void;
  onToggleBell: () => void;
  onAboutCollapse: () => void;
  onGetInTouch: () => void;
  onOpenLinkOnlyBooking: () => void;
  onRecordStat: (kind: ProviderStatKind) => void;
}

/**
 * The top of a provider's page: logo, name, what they do and where, stars,
 * years, the availability pill with its bell and Instagram, or a link-only
 * provider's Book button and socials, all laid out by their page style.
 * Shared by the app's profile screen and the website.
 */
export function ProviderPageHero({
  provider,
  palette,
  heroPhotoUris,
  isLinkOnly,
  recommendHeart,
  bell,
  aboutCardRef,
  onOpenHeroPhoto,
  onOpenLogo,
  onBookNow,
  onToggleBell,
  onAboutCollapse,
  onGetInTouch,
  onOpenLinkOnlyBooking,
  onRecordStat,
}: ProviderPageHeroProps) {
  const {
    OP,
    pageStyle,
    bodyFont,
    adaptiveAccentColor,
    recommendBadgeTheme,
    cardBg,
    cardBlurIntensity,
    cardBlurTint,
    cardHighlightColors,
    heroBgColor,
    heroIsDark,
    heroText,
    heroSub,
    heroKicker,
    heroPillLabels,
    detailsOnCard,
    detailsShadow,
    detailsSub,
    detailsText,
    sheetColour,
  } = palette;

  return (
    <View style={styles.heroInfoWrap}>
      {/* The page style decides where the logo, the name and the
          words round them sit (ProfileHero.ProfileHeroLayout, shared
          with Branding's preview). Classic is the profile as it was. */}
      <ProfileHeroLayout
        pageStyle={pageStyle}
        name={provider.displayName}
        kicker={heroKicker}
        location={provider.location}
        heroText={heroText}
        heroSub={heroSub}
        heroIsDark={heroIsDark}
        accent={adaptiveAccentColor}
        heroColour={heroBgColor ?? OP.hero}
        cardColour={OP.card}
        photoUris={heroPhotoUris}
        sheetColour={sheetColour}
        onOpenHeroPhoto={onOpenHeroPhoto}
        rating={!isLinkOnly && Number(provider.rating) > 0 ? String(provider.rating) : null}
        isVerified={provider.isVerified}
        // Link-only providers have no Services section to jump to.
        onBookNow={isLinkOnly ? undefined : onBookNow}
        renderLogo={(size) => (
          <HeroLogo
            size={size}
            uri={provider.providerLogo?.uri}
            framing={provider.providerLogoFraming}
            name={provider.displayName}
            fallbackColor={provider.accentColor ?? "#AF9197"}
            accent={adaptiveAccentColor}
            heroText={heroText}
            pageStyle={pageStyle}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onOpenLogo();
            }}
            accessibilityLabel={`${provider.displayName} logo. Tap to zoom in`}
            badge={recommendHeart ? <RecommendBadge {...recommendHeart} theme={recommendBadgeTheme} /> : null}
          />
        )}
        renderName={({ scale, letterSpacing }) => (
          <>
              {/* Name + verified */}
              <View style={styles.providerNameRow}>
                <Text
                  style={[
                    styles.providerDisplayName,
                    pageStyle.heroNameFont
                      // A parts style letters the name in its own face (Noir's Gloock).
                      ? { color: heroText, ...heroNameFontStyle(pageStyle.heroNameFont, NAME_SIZE * scale) }
                      : {
                          color: heroText,
                          fontFamily: resolveProviderFontFamily(provider.brandFont),
                          // Thin scripts are drawn larger so they read at the same size.
                          // Each hero layout sets its own size (Cover's is 1.6×).
                          fontSize: NAME_SIZE * resolveProviderFontScale(provider.brandFont) * scale,
                          // Scripts loop high (f, k), so their line is taller.
                          lineHeight: resolveProviderNameLineHeight(
                            provider.brandFont,
                            NAME_SIZE * resolveProviderFontScale(provider.brandFont) * scale,
                          ),
                          ...(letterSpacing ? { letterSpacing } : null),
                        },
                    heroIsDark && styles.heroTextShadow,
                  ]}
                >
                  {provider.displayName}
                </Text>
                {provider.isVerified && (
                  <Ionicons
                    name="checkmark-circle"
                    size={18}
                    color={heroIsDark ? "#FFFFFF" : "#007AFF"}
                  />
                )}
              </View>

              {/* SERVICE TYPE · LOCATION · business-type glyph, in small
                  caps. The business type is the icon rather than its words
                  — "HOME STUDIO" is long next to a service and a city, and
                  BUSINESS_TYPE_ICON already carries the same meaning on
                  search cards, so the two surfaces now read the same way.
                  Laid out as a row rather than inline text so the glyph can
                  be optically centred against the caps (which sit high in
                  their line box) instead of riding the text baseline. */}
          </>
        )}
        meta={
          <>
              {pageStyle.heroPills ? (
                // Cover: what they do, where, and how they work, as white
                // pills under the name instead of one line of small caps.
                <HeroPills labels={heroPillLabels} />
              ) : (
                <View style={styles.providerMetaRow}>
                  <Text
                    style={[
                      styles.providerMeta,
                      { color: heroSub },
                      heroIsDark && styles.heroTextShadow,
                    ]}
                    numberOfLines={2}
                  >
                    {/* Every type they actually have services under, so a
                        lashes-and-brows business doesn't read as only one.
                        serviceTypes is already ordered by their declared set
                        and already excludes types with nothing in them. */}
                    {(provider.serviceTypes.length
                      ? provider.serviceTypes
                          .map((serviceType) =>
                            serviceType === "OTHER"
                              ? provider.customServiceType || "SERVICE"
                              : serviceType,
                          )
                          .join(" · ")
                      : provider.providerService === "OTHER"
                        ? provider.customServiceType || "SERVICE"
                        : provider.providerService
                    ).toUpperCase()}
                    {provider.location
                      ? ` · ${provider.location.toUpperCase()}`
                      : ""}
                    {provider.businessType ? " · " : ""}
                  </Text>
                  {provider.businessType ? (
                    <Ionicons
                      name={BUSINESS_TYPE_ICON[provider.businessType] as keyof typeof Ionicons.glyphMap}
                      size={13}
                      color={heroSub}
                      style={styles.providerMetaIcon}
                      accessibilityLabel={BUSINESS_TYPE_LABEL[provider.businessType]}
                    />
                  ) : null}
                </View>
              )}
          </>
        }
        details={
          <>
              {/* Rating inline — not for a link-only provider: their
                  bookings happen elsewhere, so there are no CERVICED
                  reviews to rate them from. */}
              {/* On Duet's card they lead the line, left of the years. */}
              {!isLinkOnly && (
              <View style={[styles.ratingRow, detailsOnCard && styles.detailsInline]}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <StarIcon key={star} size={12} color="#FFD700" />
                ))}
                <Text
                  style={[
                    styles.ratingInline,
                    { color: detailsText },
                    detailsShadow && styles.heroTextShadow,
                  ]}
                >
                  {provider.rating}
                </Text>
              </View>
              )}

              {/* Years experience (optional) */}
              {provider.yearsExperience ? (
                <Text
                  style={[
                    styles.yearsExp,
                    { color: detailsSub },
                    detailsShadow && styles.heroTextShadow,
                    detailsOnCard && styles.detailsInline,
                  ]}
                >
                  {provider.yearsExperience} {detailsOnCard ? "yrs" : "years"} experience
                </Text>
              ) : null}

              {/* Slots + bell. The pill says when this provider's diary
                  opens — "New slots drop on the 5th" — or, without a
                  release day, "Stay updated" beside the bell that delivers
                  their updates. See slotsPillText. On Duet's card it
                  takes a line of its own under the stars and years. */}
              <View style={detailsOnCard ? DETAILS_OWN_LINE : undefined}>
              {(() => {
                if (isLinkOnly) {
                  // In place of the availability pill: Book (their own
                  // page, opened inside CERVICED) with their socials and
                  // messaging beside it in the accent colour.
                  const onAccentHero = isDarkColor(adaptiveAccentColor) ? "#FFFFFF" : "#1B2740";
                  const socialButton = (
                    key: string,
                    icon: keyof typeof Ionicons.glyphMap,
                    label: string,
                    onPress: () => void,
                  ) => (
                    <TouchableOpacity
                      key={key}
                      style={[styles.linkOnlySocialButton, { backgroundColor: adaptiveAccentColor }]}
                      onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
                      activeOpacity={0.8}
                      accessibilityLabel={label}
                      accessibilityRole="button"
                    >
                      <Ionicons name={icon} size={20} color={onAccentHero} />
                    </TouchableOpacity>
                  );
                  return (
                    <View style={styles.linkOnlyBookBlock}>
                      <View style={styles.linkOnlyBookRow}>
                        <TouchableOpacity
                          style={[styles.linkOnlyBookButton, { backgroundColor: OP.card, borderColor: OP.border }]}
                          onPress={onOpenLinkOnlyBooking}
                          activeOpacity={0.85}
                          accessibilityRole="button"
                          accessibilityLabel={`Book with ${provider.displayName} on their booking page`}
                        >
                          <Text style={[styles.linkOnlyBookText, { color: OP.text }]}>BOOK</Text>
                          <Ionicons name="open-outline" size={15} color={OP.text} />
                        </TouchableOpacity>
                        {provider.instagram
                          ? socialButton("instagram", "logo-instagram", `Open @${provider.instagram} on Instagram`, () => {
                              onRecordStat("instagram_tap");
                              Linking.openURL(`https://instagram.com/${provider.instagram}`).catch(() => {
                                Alert.alert("Couldn't open Instagram", "Please try again in a moment.");
                              });
                            })
                          : null}
                        {provider.tiktok
                          ? socialButton("tiktok", "logo-tiktok", `Open @${provider.tiktok} on TikTok`, () => {
                              Linking.openURL(`https://www.tiktok.com/@${provider.tiktok.replace(/^@/, "")}`).catch(() => {
                                Alert.alert("Couldn't open TikTok", "Please try again in a moment.");
                              });
                            })
                          : null}
                        {socialButton("message", "chatbubble-outline", `Message ${provider.displayName}`, onGetInTouch)}
                      </View>
                      <Text
                        style={[styles.linkOnlyCaption, { color: detailsSub }, detailsShadow && styles.heroTextShadow]}
                      >
                        Books on their own page — opens inside CERVICED
                      </Text>
                    </View>
                  );
                }
                const pillText = slotsPillText(provider.scheduleReleaseDay, provider.scheduleReleaseTime);
                // The bell subscribes to this provider's release
                // notification, but it is also the general "tell me when
                // this provider opens up" control, so it renders for every
                // provider — not only the ones with a release day set. It
                // used to sit inside this block's early return and vanished
                // whenever there was no availability headline to print.
                const showInstagram = !!provider.instagram;
                return (
                // Instagram sits OUTSIDE the pill, as its own round button
                // beside it. Inside, it read as part of the availability
                // statement — a third element in a row that says "when you
                // can book" — when it's really a link off to another app.
                // The bell stays in: it acts on this provider's
                // availability, which is exactly what the pill is about.
                <View style={styles.slotsRowOuter}>
                  <BlurView
                    intensity={cardBlurIntensity}
                    tint={cardBlurTint}
                    style={[
                      styles.slotsRow,
                      { backgroundColor: cardBg, borderColor: OP.border },
                    ]}
                  >
                    <LinearGradient
                      colors={cardHighlightColors}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={styles.slotsCardHighlight}
                    />
                    <Text style={[styles.slotsText, { color: OP.sub }]}>
                      {pillText}
                    </Text>
                    <TouchableOpacity
                      style={styles.bellButtonInline}
                      onPress={onToggleBell}
                      disabled={!bell.canSave || bell.loading}
                      activeOpacity={0.8}
                      accessibilityLabel="Notifications"
                      accessibilityRole="button"
                      accessibilityState={{ selected: bell.enabled, disabled: !bell.canSave || bell.loading }}
                    >
                      <BellIcon
                        size={16}
                        color={bell.enabled ? "#4CAF50" : OP.sub}
                      />
                    </TouchableOpacity>
                  </BlurView>
                  {showInstagram ? (
                    <TouchableOpacity
                      style={styles.instagramButtonOutside}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        Linking.openURL(
                          `https://instagram.com/${provider.instagram}`,
                        ).catch(() => {
                          Alert.alert(
                            "Couldn't open Instagram",
                            "Please try again in a moment.",
                          );
                        });
                      }}
                      activeOpacity={0.8}
                      accessibilityLabel={`Open @${provider.instagram} on Instagram`}
                      accessibilityRole="button"
                    >
                      <BlurView
                        intensity={cardBlurIntensity}
                        tint={cardBlurTint}
                        style={[
                          styles.instagramButtonSurface,
                          { backgroundColor: cardBg, borderColor: OP.border },
                        ]}
                      >
                        <LinearGradient
                          colors={cardHighlightColors}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={styles.slotsCardHighlight}
                        />
                        <Ionicons
                          name="logo-instagram"
                          size={20}
                          color={OP.sub}
                        />
                      </BlurView>
                    </TouchableOpacity>
                  ) : null}
                </View>
                );
              })()}
              </View>
          </>
        }
        about={
          pageStyle.aboutInHero ? (
            // Arch and Framed carry their About up here, so the page
            // doesn't repeat it as a section.
            <View ref={aboutCardRef} collapsable={false}>
              <ExpandableAboutText
                text={provider.aboutText}
                translate
                textStyle={[styles.heroAboutText, { color: heroText }, heroIsDark && styles.heroTextShadow, bodyFont]}
                linkStyle={styles.moreButton}
                linkTextStyle={[styles.moreButtonText, { color: heroText }]}
                onCollapse={onAboutCollapse}
              />
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Inline Bell Button
  bellButtonInline: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },
  // The years beside the pills on Duet's card: no gap under them there.
  detailsInline: { marginBottom: 0 },
  heroAboutText: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "700",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 6,
  },
  heroInfoWrap: {
    paddingTop: 100, // clears the status bar / back button over the hero photo
  },
  heroTextShadow: {
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  instagramButtonOutside: {
    borderRadius: 20,
  },
  instagramButtonSurface: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  // The same container as the availability pill beside it — same blurred
  // surface, same border, same 20pt corners, same height (from the row's
  // "stretch") — not a round button sitting next to one.
  linkOnlyBookBlock: {
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  linkOnlyBookButton: {
    height: 46,
    // The primary action takes every spare point in the row; the fixed-size
    // contact/social controls still fit on every screen width.
    flex: 1,
    borderRadius: 23,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  linkOnlyBookRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  linkOnlyBookText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 15,
    letterSpacing: 1,
  },
  linkOnlyCaption: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 12,
    fontWeight: "600",
  },
  linkOnlySocialButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  moreButton: {
    alignSelf: "flex-start",
  },
  moreButtonText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 12,
    fontWeight: "bold",
    // Color will be set dynamically using adaptiveAccentColor
  },
  providerDisplayName: {
    fontFamily: SERIF,
    fontSize: NAME_SIZE,
    lineHeight: NAME_LINE_HEIGHT,
    textAlign: "center",
    // It shares a row with the verified tick, and a row doesn't wrap a child
    // that can't shrink: a long name at a larger text size ran off both edges.
    flexShrink: 1,
  },
  providerMeta: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 1.2,
    textAlign: "center",
    flexShrink: 1,
  },
  // Caps sit high in their line box, so centring the glyph on the row leaves
  // it looking a touch low against the letterforms — nudged up to match.
  providerMetaIcon: {
    marginTop: -1,
  },
  // Row wrapper so the business-type glyph sits beside the caps line rather
  // than inside it. marginBottom moves here from providerMeta — the row now
  // owns the spacing below the whole line.
  providerMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  providerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  ratingInline: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "800",
    fontSize: 13,
    marginLeft: 4,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    marginBottom: 8,
  },
  slotsCardHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
  },
  slotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexShrink: 1,
  },
  // Holds the availability pill and, beside it, the Instagram button.
  // marginBottom moves here from slotsRow so the pair share one gap below.
  // "stretch", not "center": it makes the Instagram button exactly as tall as
  // the pill whatever the pill happens to measure. The pill's height is
  // content-driven (bell icon + padding + border), so any fixed number on the
  // button is a guess that drifts the moment the pill's contents change.
  slotsRowOuter: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    marginBottom: 4,
  },
  slotsText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 11,
    textAlign: "center",
    zIndex: 2, // Above overlays
    // The pill clips its contents; without this a long line at a larger text
    // size pushed the bell out of the pill and cut the words off.
    flexShrink: 1,
  },
  yearsExp: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "800",
    fontSize: 12,
    textAlign: "center",
    marginBottom: 10,
    opacity: 0.9,
    letterSpacing: 0.4,
  },
});
