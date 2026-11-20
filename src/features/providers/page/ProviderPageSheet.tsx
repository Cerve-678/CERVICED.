import React, { useState } from "react";
import {
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

import { PAGE_SECTION_TITLES, type PageSectionKey } from "../../../constants/pageStyles";
import { buildPolicyDisplayRows } from "../../../utils/policyDisplay";
import { ExpandableAboutText } from "../ExpandableAboutText";
import {
  PolicyPagesCompact,
  PolicyPagesInline,
  PolicyPagesShowcase,
  PolicyStoryRings,
} from "../PolicyPages";
import {
  AccentBandSection,
  PageSection,
  PageSectionHeading,
  RuledJumpBar,
  StyledPolicyList,
  onAccentInk,
  policiesBringOwnSurface,
  sectionInk,
} from "../ProfilePageStyle";
import {
  ProviderAdditionalInfoSection,
  ProviderContactSection,
  ProviderOpeningHoursSection,
  ProviderOwnSections,
  ProviderPortfolioSection,
  ProviderReviewPreviewSection,
  ProviderSpecialitiesSection,
} from "../ProviderProfileSections";
import { hasProviderPolicyInfo } from "../profilePresentation";
import { PagePattern, SectionDivider } from "../pageParts";
import { isDarkColor } from "../../../constants/providerThemes";
import type { ProviderProfileData } from "../profileTypes";
import type { ProviderPagePalette } from "./providerPagePalette";

/** Matches the hero's lip: the sheet's rounded top corners. */
const SHEET_LIP_RADIUS = 36;

type Props<C extends React.ComponentType<any>> = React.ComponentProps<C>;

export interface ProviderPageSheetProps {
  provider: ProviderProfileData;
  palette: ProviderPagePalette;
  isLinkOnly: boolean;
  takingBookings: boolean;
  closureReason: string | null;
  /** The sheet's least height, so a short page still covers the screen. */
  minHeight: number;
  /** The price list: category tabs and service cards. */
  renderServices: () => React.ReactNode;
  additionalInfo: {
    groups: Props<typeof ProviderAdditionalInfoSection>["groups"];
    goodToKnow: Props<typeof ProviderAdditionalInfoSection>["goodToKnow"];
    directions: Props<typeof ProviderAdditionalInfoSection>["howToGetThere"];
  };
  contactDetails: Props<typeof ProviderContactSection>["contact"];
  reviews: Props<typeof ProviderReviewPreviewSection>["reviews"];
  reviewsLoading: boolean;
  openingHours: Props<typeof ProviderOpeningHoursSection>["openingHours"];
  openingHoursLoading: boolean;
  workPortfolio: Props<typeof ProviderPortfolioSection>["items"];
  venuePortfolio: Props<typeof ProviderAdditionalInfoSection>["venueItems"];
  portfolioLoading: boolean;
  policyPages: string[];
  policyEdges: Props<typeof PolicyPagesShowcase>["edges"];
  /** Section shortcuts (Cover, Lounge) and where each one scrolls to. */
  jumpTargets: { key: PageSectionKey; ref: React.RefObject<ViewInstance | null> }[];
  aboutCardRef: React.RefObject<ViewInstance | null>;
  policiesSectionRef: React.RefObject<ViewInstance | null>;
  servicesSectionRef: React.RefObject<ViewInstance | null>;
  reviewsSectionRef: React.RefObject<ViewInstance | null>;
  policyPagesRef: React.RefObject<ViewInstance | null>;
  onScrollToSection: (target: ViewInstance | null) => void;
  onAboutCollapse: () => void;
  onOpenPolicyStory: (index: number) => void;
  onOpenPolicyImage: () => void;
  onOpenReviews: () => void;
  onContactLink: Props<typeof ProviderContactSection>["onOpenLink"];
  onPublicContactLink: Props<typeof ProviderContactSection>["onOpenPublicLink"];
  onGetInTouch: () => void;
  onOpenImage: Props<typeof ProviderPortfolioSection>["onOpenImage"];
}

/**
 * Everything under the hero on a provider's page, on the sheet that rises
 * over it: About and Policies, the price list, policy pictures, reviews,
 * contact, opening hours, portfolio, additional information and their own
 * sections, each drawn in their page style. Shared by the app's profile
 * screen and the website.
 */
export function ProviderPageSheet({
  provider,
  palette,
  isLinkOnly,
  takingBookings,
  closureReason,
  minHeight,
  renderServices,
  additionalInfo,
  contactDetails,
  reviews,
  reviewsLoading,
  openingHours,
  openingHoursLoading,
  workPortfolio,
  venuePortfolio,
  portfolioLoading,
  policyPages,
  policyEdges,
  jumpTargets,
  aboutCardRef,
  policiesSectionRef,
  servicesSectionRef,
  reviewsSectionRef,
  policyPagesRef,
  onScrollToSection,
  onAboutCollapse,
  onOpenPolicyStory,
  onOpenPolicyImage,
  onOpenReviews,
  onContactLink,
  onPublicContactLink,
  onGetInTouch,
  onOpenImage,
}: ProviderPageSheetProps) {
  const {
    OP,
    pageStyle,
    bodyFont,
    veilTheme,
    adaptiveAccentColor,
    cardBg,
    cardBlurIntensity,
    cardBlurTint,
    cardHighlightColors,
    sectionPalette,
    pageInk,
    sheetColour,
    squareCards,
    policyLook,
    policyPlacement,
  } = palette;
  // Classic's About | Policy switch.
  const [infoTab, setInfoTab] = useState<"about" | "policy">("about");

  const portfolio = (
    <ProviderPortfolioSection
      items={workPortfolio}
      loading={portfolioLoading}
      palette={sectionPalette}
      onOpenImage={onOpenImage}
    />
  );

  return (
    // The sheet rises over the hero with its own large top corners (see
    // contentSheet.borderTopLeftRadius/Right), like a floating card.
    <View
      style={[
        styles.contentSheet,
        { minHeight, backgroundColor: veilTheme ? veilTheme.sheetFill : OP.bg },
        // With a background image, inset the sheet so the photo shows
        // along its sides — the content reads as a card floating over
        // the image rather than covering it edge to edge. A veil page
        // always floats: its sheet is a see-through glass card.
        provider.backgroundImage || veilTheme ? styles.contentSheetFloating : null,
        veilTheme ? styles.contentSheetGlass : null,
        // Riviera's pinned Book bar sits over the foot: keep the last section clear of it.
        pageStyle.pinnedBookBar ? styles.contentSheetPinnedBar : null,
      ]}
    >
      {/* Posy's gingham and the other printed pages: under everything on the sheet. */}
      {pageStyle.pagePattern ? (
        <PagePattern pattern={pageStyle.pagePattern} accent={adaptiveAccentColor} onDark={isDarkColor(OP.bg)} style={styles.sheetPattern} />
      ) : null}
      {/* Cover: a bar of links to the main sections. Lounge: the
          same links between two fine rules. */}
      {pageStyle.jumpBar && pageStyle.jumpBarRuled ? (
        <RuledJumpBar
          sections={jumpTargets.map(({ key }) => key)}
          sheet={sheetColour}
          onJump={(section) => {
            Haptics.selectionAsync().catch(() => {});
            onScrollToSection(jumpTargets.find(({ key }) => key === section)?.ref.current ?? null);
          }}
        />
      ) : pageStyle.jumpBar ? (
        <View
          style={[
            styles.jumpBar,
            { backgroundColor: adaptiveAccentColor },
            squareCards && styles.squareCard,
          ]}
        >
          {jumpTargets.map(({ key, ref }) => (
            <TouchableOpacity
              key={key}
              style={styles.jumpBarItem}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onScrollToSection(ref.current);
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Go to ${PAGE_SECTION_TITLES[key]}`}
            >
              <Text
                style={[styles.jumpBarText, { color: onAccentInk(adaptiveAccentColor).text }]}
                numberOfLines={1}
                // Several titles share one pill-shaped row, so at a
                // larger text size they shrink to fit rather than
                // ending in "…".
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {PAGE_SECTION_TITLES[key].toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {/* Templates only, when Branding → Policy Pictures is Story:
          their policy pictures as one story circle; a tap opens them full
          screen, one page at a time. Classic keeps the round button on
          the About card. */}
      {pageStyle.key !== "classic" && policyPlacement === "top" && policyPages.length > 0 ? (
        <View ref={policyPagesRef} collapsable={false}>
          <PolicyStoryRings
            urls={policyPages}
            accent={adaptiveAccentColor}
            sheet={OP.bg}
            onOpen={() => onOpenPolicyStory(0)}
          />
        </View>
      ) : null}

      {!pageStyle.separateAboutAndPolicies ? (
        <>
        {/* About / Policy tabbed card */}
        <View ref={aboutCardRef} style={[styles.aboutCardShadowWrap, squareCards && styles.squareCard]}>
          <BlurView
            intensity={cardBlurIntensity}
            tint={cardBlurTint}
            style={[
              styles.aboutCard,
              { backgroundColor: cardBg, borderColor: OP.border },
              squareCards && styles.squareCard,
              // Room under the last line for the policy button, so it
              // never sits on top of the text.
              policyPages.length > 0 && styles.aboutCardWithPolicyFab,
            ]}
          >
            <LinearGradient
              colors={cardHighlightColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={[styles.cardHighlight, squareCards && styles.squareCard]}
            />
            {/* Tab switcher — only show if there are policy rows */}
            {(() => {
              if (!hasProviderPolicyInfo(provider)) return null;
              return (
                <View
                  style={[
                    styles.infoTabRow,
                    { borderBottomColor: OP.border },
                  ]}
                >
                  <TouchableOpacity
                    style={[
                      styles.infoTab,
                      infoTab === "about" && {
                        borderBottomColor: adaptiveAccentColor,
                        borderBottomWidth: 2,
                      },
                    ]}
                    onPress={() => setInfoTab("about")}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.infoTabText,
                        { color: infoTab === "about" ? OP.text : OP.sub },
                      ]}
                    >
                      About
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.infoTab,
                      infoTab === "policy" && {
                        borderBottomColor: adaptiveAccentColor,
                        borderBottomWidth: 2,
                      },
                    ]}
                    onPress={() => setInfoTab("policy")}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.infoTabText,
                        { color: infoTab === "policy" ? OP.text : OP.sub },
                      ]}
                    >
                      Policy
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })()}

            {infoTab === "about" ? (
              <>
                {!hasProviderPolicyInfo(provider) && (
                  <Text style={[styles.sectionTitle, { color: OP.text }]}>
                    Relevant Information
                  </Text>
                )}
                {/* Provider-WRITTEN bio: `translate` renders it via DynamicText so it
                    translates live to the active language when the paid
                    translation feature is enabled, and shows the original
                    English otherwise (the default in every current
                    build). Not legal/health copy, so routing it through
                    the dynamic path is safe. */}
                <ExpandableAboutText
                  text={provider.aboutText}
                  translate
                  textStyle={[styles.aboutText, { color: OP.sub }, bodyFont]}
                  linkStyle={styles.moreButton}
                  linkTextStyle={[styles.moreButtonText, { color: OP.text }]}
                  onCollapse={onAboutCollapse}
                />
              </>
            ) : (
              /* Policy tab content */
              (() => {
                const rows = buildPolicyDisplayRows(
                  provider.bookingPolicies,
                  provider.cancellationNoticeHours,
                  { linkOnly: isLinkOnly },
                );
                return (
                  <View style={{ paddingTop: 8 }}>
                    {rows.map((row, i) => (
                      <View
                        key={i}
                        style={[
                          styles.policyRow,
                          i < rows.length - 1 && {
                            borderBottomColor: OP.sep,
                            borderBottomWidth: StyleSheet.hairlineWidth,
                          },
                        ]}
                      >
                        <View style={styles.policyIcon}>
                          <Ionicons
                            name={row.icon}
                            size={18}
                            color={OP.sub}
                          />
                        </View>
                        <View style={styles.policyRowText}>
                          <View style={styles.policyLabelRow}>
                            <Text
                              style={[styles.policyLabel, { color: OP.sub }]}
                            >
                              {row.label}
                            </Text>
                            {!!row.tag && (
                              <View
                                style={[
                                  styles.policyTag,
                                  { backgroundColor: adaptiveAccentColor },
                                ]}
                              >
                                <Text style={styles.policyTagText}>
                                  {row.tag}
                                </Text>
                              </View>
                            )}
                          </View>
                          <Text
                            style={[styles.policyValue, { color: OP.text }, bodyFont]}
                          >
                            {row.value}
                          </Text>
                          {row.notes?.map((note) => (
                            <Text
                              key={note}
                              style={[styles.policyNote, { color: OP.sub }, bodyFont]}
                            >
                              {note}
                            </Text>
                          ))}
                        </View>
                      </View>
                    ))}
                    {/* Link-only: the booking happens on their own
                        site, so CERVICED applies none of this. */}
                    {isLinkOnly && rows.length > 0 && (
                      <Text style={[styles.policyHandledNote, { color: OP.sub }]}>
                        These policies are handled on their booking site.
                      </Text>
                    )}
                  </View>
                );
              })()
            )}

            {/* Floating policy-photo button — bottom-right of the card,
                on top of whichever tab (or lack of tabs) is showing. This
                is the only way in for a provider who uploaded this photo
                but filled in none of the structured fields above (which
                is why the tab switcher itself doesn't gate on it). */}
            {policyPages.length > 0 ? (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => onOpenPolicyImage()}
                style={[
                  styles.policyImageFab,
                  { backgroundColor: adaptiveAccentColor },
                ]}
                accessibilityLabel={policyPages.length > 1 ? `View full policy details, ${policyPages.length} pages` : 'View full policy details'}
                accessibilityRole="button"
              >
                <Ionicons
                  name="document-text-outline"
                  size={20}
                  color="#FFFFFF"
                />
              </TouchableOpacity>
            ) : null}
          </BlurView>
        </View>
        </>
      ) : (
        <>
          {/* Work first (Posy): the portfolio straight after the top of the page. */}
          {pageStyle.portfolioFirst ? portfolio : null}
          {/* Every style but Classic gives About and Policies a
              section each, in the style's own headings and layout. */}
          {!pageStyle.aboutInHero && pageStyle.aboutOnBand ? (
            // Editorial: their About on a full-width band of the accent.
            <View ref={aboutCardRef} collapsable={false}>
              <AccentBandSection section="about" palette={sectionPalette} waves={false}>
                <ExpandableAboutText
                  text={provider.aboutText}
                  translate
                  textStyle={[styles.aboutText, { color: onAccentInk(adaptiveAccentColor).sub }, bodyFont]}
                  linkStyle={styles.moreButton}
                  linkTextStyle={[styles.moreButtonText, { color: onAccentInk(adaptiveAccentColor).text }]}
                  onCollapse={onAboutCollapse}
                />
              </AccentBandSection>
            </View>
          ) : !pageStyle.aboutInHero ? (
            <View ref={aboutCardRef} collapsable={false}>
              <PageSection section="about" palette={sectionPalette}>
                <ExpandableAboutText
                  text={provider.aboutText}
                  translate
                  textStyle={[styles.aboutText, { color: sectionInk(sectionPalette).sub }, bodyFont]}
                  linkStyle={styles.moreButton}
                  linkTextStyle={[styles.moreButtonText, { color: sectionInk(sectionPalette).text }]}
                  onCollapse={onAboutCollapse}
                />
              </PageSection>
            </View>
          ) : null}
          {hasProviderPolicyInfo(provider) ? (
            <View ref={policiesSectionRef} collapsable={false}>
              {(() => {
                const rows = buildPolicyDisplayRows(
                  provider.bookingPolicies,
                  provider.cancellationNoticeHours,
                  { linkOnly: isLinkOnly },
                );
                const footer = (ink: { text: string; sub: string }) =>
                  isLinkOnly && rows.length > 0 ? (
                    <Text style={[styles.policyHandledNote, { color: ink.sub }]}>
                      These policies are handled on their booking site.
                    </Text>
                  ) : null;
                if (pageStyle.policies === "band") {
                  const ink = onAccentInk(adaptiveAccentColor);
                  return (
                    <AccentBandSection section="policies" palette={sectionPalette}>
                      <StyledPolicyList rows={rows} palette={sectionPalette} ink={ink} />
                      {footer(ink)}
                    </AccentBandSection>
                  );
                }
                const bare = policiesBringOwnSurface(pageStyle);
                const ink = bare ? pageInk : sectionInk(sectionPalette);
                return (
                  <PageSection section="policies" palette={sectionPalette} bare={bare}>
                    <StyledPolicyList rows={rows} palette={sectionPalette} ink={ink} />
                    {footer(ink)}
                  </PageSection>
                );
              })()}
            </View>
          ) : null}
        </>
      )}

      {isLinkOnly && (
        <ProviderSpecialitiesSection
          specialities={provider.specialties}
          textColor={OP.text}
          accent={adaptiveAccentColor}
        />
      )}

      {/* Services Section — the price list. A link-only provider's
          prices live on their own booking page. */}
      {!isLinkOnly && (
      <View
        style={styles.servicesSection}
        ref={servicesSectionRef}
        collapsable={false}
      >
        {pageStyle.heading === "plain" ? (
          <Text style={[styles.sectionTitleNoCard, { color: OP.text }]}>
            Services
          </Text>
        ) : (
          <>
          {pageStyle.divider ? <SectionDivider divider={pageStyle.divider} accent={adaptiveAccentColor} /> : null}
          <View
            style={[
              styles.styledServicesHeading,
              pageStyle.cards === "none" && [styles.styledServicesRule, { borderTopColor: pageInk.separator }],
              pageStyle.cards === "stripes" && styles.stripesServicesHeading,
            ]}
          >
            <PageSectionHeading section="services" palette={sectionPalette} />
          </View>
          </>
        )}

        {!takingBookings && closureReason ? (
          <Text style={{ color: OP.sub, fontSize: 13, marginBottom: 10 }}>
            Not taking bookings: {closureReason.toLowerCase()}
          </Text>
        ) : null}

        {renderServices()}
      </View>
      )}

      {/* Templates only: their policy pictures after the price list,
          in the design Branding → Policy Pictures picks. Story puts
          them at the top instead. Classic keeps them behind the round
          button. */}
      {pageStyle.key !== "classic" && policyPages.length > 0 && policyPlacement === "afterServices" ? (
        <View ref={policyPagesRef} collapsable={false}>
          {policyLook === "framed" || policyLook === "swipe" || policyLook === "fan" || policyLook === "peek" ? (
            <PolicyPagesShowcase
              urls={policyPages}
              edges={policyEdges}
              look={policyLook}
              palette={sectionPalette}
              onOpenPage={onOpenPolicyStory}
              onOpenAll={() => onOpenPolicyImage()}
            />
          ) : policyLook === "thumbs" || policyLook === "button" ? (
            <PolicyPagesCompact
              urls={policyPages}
              look={policyLook}
              palette={sectionPalette}
              onOpenPage={onOpenPolicyStory}
              onOpenAll={() => onOpenPolicyImage()}
            />
          ) : (
            <PolicyPagesInline
              urls={policyPages}
              edges={policyEdges}
              look={policyLook}
              palette={sectionPalette}
              onOpen={() => onOpenPolicyImage()}
            />
          )}
        </View>
      ) : null}

      {!isLinkOnly && (
      <View ref={reviewsSectionRef} collapsable={false}>
        <ProviderReviewPreviewSection
          reviews={reviews}
          loading={reviewsLoading}
          palette={sectionPalette}
          onSeeAll={onOpenReviews}
        />
      </View>
      )}

      <ProviderContactSection
        contact={contactDetails}
        palette={sectionPalette}
        onOpenLink={onContactLink}
        onOpenPublicLink={onPublicContactLink}
        onGetInTouch={onGetInTouch}
      />

      <ProviderOpeningHoursSection
        openingHours={openingHours}
        loading={openingHoursLoading}
        palette={sectionPalette}
      />

      {pageStyle.portfolioFirst && pageStyle.key !== "classic" ? null : portfolio}

      <ProviderAdditionalInfoSection
        groups={additionalInfo.groups}
        qualifications={provider.qualifications.trim()}
        goodToKnow={additionalInfo.goodToKnow}
        howToGetThere={additionalInfo.directions}
        venueItems={venuePortfolio}
        palette={sectionPalette}
        onOpenImage={onOpenImage}
      />

      <ProviderOwnSections sections={provider.ownSections} palette={sectionPalette} providerName={provider.displayName} />
    </View>
  );
}

const styles = StyleSheet.create({
  aboutCard: {
    padding: 22,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  // Shadow lives on this outer wrapper (not aboutCard) because overflow:hidden
  // on the same view as a shadow silently suppresses the shadow on iOS. The
  // wrapper stays overflow:visible so the shadow renders, while aboutCard
  // itself clips its BlurView/gradient/blur content to its rounded corners.
  aboutCardShadowWrap: {
    borderRadius: 26,
    marginBottom: 20,
    shadowColor: "#B87E92",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 3,
  },
  // The policy button's height plus its bottom offset (policyImageFab), so the
  // card's last line ends above the button instead of under it.
  aboutCardWithPolicyFab: {
    paddingBottom: 10 + 44,
  },
  aboutText: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "700",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  cardHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
  },
  contentSheet: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 130, // clears the bottom nav pill while keeping the pink backdrop continuous
    // Rounded directly on the sheet itself (not just via the adjacent lip
    // strip above) so the top corners are never square regardless of how
    // the lip renders.
    borderTopLeftRadius: SHEET_LIP_RADIUS,
    borderTopRightRadius: SHEET_LIP_RADIUS,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  // Applied only when the provider has a background image: pulls the sheet in
  // from both edges so the photo stays visible down its sides.
  // The printed pattern follows the sheet's round top corners.
  sheetPattern: {
    borderTopLeftRadius: SHEET_LIP_RADIUS,
    borderTopRightRadius: SHEET_LIP_RADIUS,
    overflow: "hidden",
  },
  contentSheetPinnedBar: {
    paddingBottom: 210,
  },
  contentSheetFloating: {
    marginHorizontal: 10,
  },
  // Sheer: the sheet is see-through glass over the veil, edged in a hairline.
  contentSheetGlass: {
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: "rgba(255,255,255,0.22)",
    shadowOpacity: 0,
    elevation: 0,
  },
  infoTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  infoTabRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    marginHorizontal: -4,
  },
  infoTabText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  jumpBar: {
    flexDirection: "row",
    borderRadius: 100,
    marginBottom: 22,
    paddingHorizontal: 6,
  },
  jumpBarItem: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  jumpBarText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 10,
    letterSpacing: 1.6,
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
  policyHandledNote: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 12,
    marginTop: 10,
  },
  policyIcon: {
    width: 28,
    alignItems: "center",
  },
  // Services Section
  // Floating circular button, bottom-right of the About/Policy card — opens
  // the provider's uploaded policy photo. Absolutely positioned so it stays
  // put regardless of which tab (About/Policy) is active, or whether the
  // tab switcher is even showing (a provider can have this image with no
  // structured policy fields at all, in which case it's the only way in).
  policyImageFab: {
    position: "absolute",
    bottom: 10,
    right: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  policyLabel: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  policyLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  // The section's own note (and the no-show grace period) under its value.
  policyNote: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  // Contact Section
  policyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 14,
  },
  policyRowText: {
    flex: 1,
  },
  policyTag: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginBottom: 2,
  },
  policyTagText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 9,
    letterSpacing: 0.5,
    color: "#fff",
  },
  policyValue: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 14,
    fontWeight: "700",
  },
  sectionTitle: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 18,
    marginBottom: 15,
  },
  sectionTitleNoCard: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 18,
    marginBottom: 15,
    paddingHorizontal: 20,
  },
  servicesSection: {
    marginBottom: 20,
  },
  // Every corner, not just borderRadius: the top highlight strips set their
  // own top-corner radii, which borderRadius: 0 alone doesn't override.
  squareCard: {
    borderRadius: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  styledServicesHeading: {
    alignSelf: "stretch",
  },
  styledServicesRule: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 22,
  },
  // Stripes: Services sits on the page between two strips, so its title
  // gets the room above it the strips give theirs (and Portfolio has),
  // instead of touching the foot of the Policies strip.
  stripesServicesHeading: {
    paddingTop: 18,
  },
});
