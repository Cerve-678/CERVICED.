import React, { useMemo, useState } from "react";
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import CategoryTabItem from "../../../components/CategoryTabPill";
import { MULTI_SERVICE_BOOKING_ENABLED } from "../../../constants/featureFlags";
import { menuNumber } from "../../../constants/pageStyles";
import { blend, isDarkColor, withAlpha } from "../../../constants/providerThemes";
import type { MyWaitlistPlace } from "../../../services/databaseService";
import { placeInLineLabel } from "../../bookings/waitlist";
import { GlossShine } from "../ProfilePageStyle";
import type { ProviderProfileData, ProviderProfileService } from "../profileTypes";
import type { ProviderPagePalette } from "./providerPagePalette";

type ServiceData = ProviderProfileService;

// Most dots the 60px pill ever shows, however many images the service has.
const MAX_PILL_DOTS = 3;

/** Posy's service tiles: the gap between the two and the padding inside each. */
const SERVICE_TILE_GAP = 10;
const SERVICE_TILE_PADDING = 8;
/** The padding inside a usual service card (styles.serviceItem). */
const SERVICE_CARD_PADDING = 15;
/** The list's own side padding (styles.categoryServicesContainer). The list's
 *  measured width includes it, so the cards get that width less this twice. */
const SERVICE_LIST_SIDE_PADDING = 20;
/** Room for a card's own border (at most 1.5pt a side) so the photo never
 *  runs under the card's rounded, clipped edge. */
const SERVICE_CARD_BORDER_ROOM = 4;
/** Storefront: the soft frame round each service's arched photo. */
const SERVICE_ARCH_FRAME = 7;

// 60px circle pill for multi-image services — tap opens modal, swipe pages through images
const MultiImagePill: React.FC<{
  images: any[];
  onPress: (images: any[], index: number) => void;
  imageStyle: any;
  containerStyle: any;
  /** Drops the gap the pill keeps on its right (a tile's photo sits on its own line). */
  noGap?: boolean;
}> = React.memo(({ images, onPress, imageStyle, containerStyle, noGap }) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const w = imageStyle.width ?? 60;

  // The pill is only 60px wide, so a dot per image turns into an unreadable
  // smear the moment a service has more than a handful of photos. Show a
  // three-dot window that slides with the active image instead — it still
  // says "there's more this way" without pretending to be a countable index.
  const dotWindow = useMemo(() => {
    const total = images.length;
    if (total <= MAX_PILL_DOTS) {
      return Array.from({ length: total }, (_, i) => i);
    }
    const start = Math.min(
      Math.max(activeIdx - 1, 0),
      total - MAX_PILL_DOTS,
    );
    return Array.from({ length: MAX_PILL_DOTS }, (_, i) => start + i);
  }, [images.length, activeIdx]);

  return (
    <View style={{ alignItems: "center", marginRight: noGap ? 0 : 15, marginBottom: noGap ? 10 : 0 }}>
      <View style={containerStyle}>
        <ScrollView
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          nestedScrollEnabled
          onMomentumScrollEnd={(e) => {
            setActiveIdx(Math.round(e.nativeEvent.contentOffset.x / w));
          }}
          style={{ width: w, height: imageStyle.height ?? 60 }}
        >
          {images.map((img, i) => (
            <TouchableOpacity
              key={i}
              activeOpacity={0.85}
              onPress={() => onPress(images, i)}
            >
              <Image source={img} style={imageStyle} contentFit="cover" transition={0} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      {images.length > 1 && (
        <View style={{ flexDirection: "row", gap: 3, marginTop: 5 }}>
          {dotWindow.map((i) => (
            <View
              key={i}
              style={{
                width: activeIdx === i ? 10 : 4,
                height: 4,
                borderRadius: 2,
                backgroundColor:
                  activeIdx === i ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.2)",
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
});

MultiImagePill.displayName = "MultiImagePill";

/** A service description clamped to two lines, with See more only when the
 *  clamp actually cuts something off. A character count can't tell: the card
 *  is narrow, and a line break ends a line however few letters are on it. */
function ServiceDescription({
  text,
  expanded,
  onToggle,
  textColor,
  linkColor,
  fontStyle,
}: {
  text: string;
  expanded: boolean;
  onToggle: () => void;
  textColor: string;
  linkColor: string;
  /** Branding → Custom's text font; null keeps the app's. */
  fontStyle?: { fontFamily: string; fontWeight: "400" } | null;
}) {
  const [overflows, setOverflows] = useState(false);
  return (
    <View>
      <Text
        style={[styles.serviceDescription, { color: textColor }, fontStyle]}
        numberOfLines={expanded ? undefined : 2}
      >
        {text}
      </Text>
      {/* Invisible, unclamped copy at the same width, only to count the
          lines the whole description takes. */}
      <Text
        style={[styles.serviceDescription, styles.serviceDescriptionMeasure, fontStyle]}
        onTextLayout={(e) => setOverflows(e.nativeEvent.lines.length > 2)}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        {text}
      </Text>
      {(overflows || expanded) && (
        <TouchableOpacity onPress={onToggle} activeOpacity={0.7}>
          <Text style={[styles.seeMoreText, { color: linkColor }]}>
            {expanded ? "See less" : "See more"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ⚠️ TEMP TESTING FLAG — forces every service into the "fully booked" state
// (disabled "Fully Booked" button + Waitlist button/chip) so both can be
// eyeballed without seeding real booking data. Re-requested by user for
// visual QA on 2026-08-02 — set back to false (or delete this block and its
// three call sites below) when they say testing is done. Search
// DEBUG_FORCE_FULLY_BOOKED to find every use.
const DEBUG_FORCE_FULLY_BOOKED = false;

export interface ProviderPageServicesProps {
  provider: ProviderProfileData;
  palette: ProviderPagePalette;
  /** The cards to draw: the capped list on the page, or the whole category
   *  in the All Services sheet. */
  services: ServiceData[];
  /** The "Show all N services" link under the list, or null for none. */
  showAll: { count: number; onPress: () => void } | null;
  /** Runs Book, Waitlist and add-on taps. Inside the All Services sheet it
   *  closes the sheet first and waits for it to slide away, because React
   *  Native can't reliably open one Modal over another. Photo taps don't go
   *  through it: the viewer is an overlay inside the sheet. */
  runAction?: ((action: () => void) => void) | undefined;
  selectedServiceType: string;
  serviceCountsByType: Record<string, number>;
  onSelectServiceType: (serviceType: string) => void;
  categoryNames: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  /** The list's measured width. Held by the screen so the All Services sheet
   *  opens with the page's measurement instead of re-measuring. */
  listWidth: number;
  onListWidth: (width: number) => void;
  expandedServiceIds: Set<string | number>;
  onToggleExpanded: (serviceId: string | number) => void;
  onOpenImages: (images: any[], index: number) => void;
  /** False on the provider's own page and while ownership loads: no booking controls at all. */
  canBook: boolean;
  /** The owner's logo preview: the Book and waitlist buttons show, but the
   *  page is only for looking at, so they don't respond (user, 2026-11-23). */
  bookDisplayOnly?: boolean;
  takingBookings: boolean;
  /** service.dbId → nothing bookable anywhere in the booking window. */
  serviceFullyBooked: Record<string, boolean>;
  /** service.dbId → has a bookable slot in the next 14 days. */
  serviceNearTermAvailability: Record<string, boolean>;
  onBook: (service: ServiceData) => void;
  selectMode: boolean;
  onToggleSelectMode: () => void;
  selectedServiceIds: Set<string>;
  addOnsBySelectedService: Record<string, { id: string | number; name: string; price: number }[]>;
  onToggleServiceSelected: (service: ServiceData) => void;
  onEditAddOns: (service: ServiceData) => void;
  /** service.dbId → the viewer's place on that service's waitlist. */
  waitlistPlaces: Record<string, MyWaitlistPlace>;
  /** A held waitlist slot is paid for from Bookings. */
  onOpenHeldPlace: () => void;
  onLeaveWaitlist: (place: MyWaitlistPlace) => void;
  onJoinWaitlist: (service: ServiceData) => void;
}

/**
 * A provider's price list: the service-type switch, category tabs, the
 * category's description and the service cards with Book and Waitlist, in
 * their page style. Shared by the profile page, its All Services sheet and
 * the website.
 */
export function ProviderPageServices({
  provider,
  palette,
  services,
  showAll,
  runAction = (action) => action(),
  selectedServiceType,
  serviceCountsByType,
  onSelectServiceType,
  categoryNames,
  selectedCategory,
  onSelectCategory,
  listWidth,
  onListWidth,
  expandedServiceIds,
  onToggleExpanded,
  onOpenImages,
  canBook,
  bookDisplayOnly = false,
  takingBookings,
  serviceFullyBooked,
  serviceNearTermAvailability,
  onBook,
  selectMode,
  onToggleSelectMode,
  selectedServiceIds,
  addOnsBySelectedService,
  onToggleServiceSelected,
  onEditAddOns,
  waitlistPlaces,
  onOpenHeldPlace,
  onLeaveWaitlist,
  onJoinWaitlist,
}: ProviderPageServicesProps) {
  const {
    pageStyle,
    bodyFont,
    OP,
    SV,
    adaptiveAccentColor,
    cardBg,
    cardBlurIntensity,
    cardBlurTint,
    cardHighlightColors,
    serviceSurfaceStyle,
    squareCards,
  } = palette;
  // Posy's services sit two across as tiles, the photo on top; Riviera's are
  // one across with a wide photo on top. MultiImagePill pages by a fixed
  // width, so the photo's size comes from the list's measured width rather
  // than a percentage.
  const serviceTiles = pageStyle.serviceLayout === "tiles";
  // Noir's Book buttons are barely rounded, the word in spaced capitals.
  const squareButtons = pageStyle.buttonShape === "square";
  // Muse: no button, just "Book" underlined in the accent.
  const textLinkButtons = pageStyle.buttonShape === "textLink";
  // Retreat: a round outline in the ink, no fill.
  const outlineButtons = pageStyle.buttonShape === "outline";
  // Muse's services read as a printed menu: no photos, the name, a dotted
  // leader and the price on one line, the length under it.
  const serviceMenu = pageStyle.serviceLayout === "menu";
  const servicePhotoCards = pageStyle.serviceLayout === "photoCards";
  // Poster: no photos, each name in a filled pill of the accent.
  const servicePills = pageStyle.serviceLayout === "pillMenu";
  // Hibiscus: one row each like the plain list (owner, 2026-11-20: "too big,
  // needs to fit in a row"), with the name in condensed caps and "Book now".
  const serviceSpotlight = pageStyle.serviceLayout === "spotlight";
  // Storefront: two across, each photo standing in a soft arched frame.
  const serviceArches = pageStyle.serviceLayout === "archTiles";
  const serviceTwoUp = serviceTiles || serviceArches;
  const serviceNoPhoto = serviceMenu || servicePills;
  const serviceStacked = serviceTwoUp || servicePhotoCards;
  // Hibiscus: "Book now" then a small arrow in a circle. Storefront: a small square outline in spaced caps.
  const arrowPillButtons = pageStyle.buttonShape === "arrowPill";
  const shopBoxButtons = pageStyle.buttonShape === "shopBox";
  // Neon: a round outline in the accent, spaced caps, glowing on a dark page.
  const glowPillButtons = pageStyle.buttonShape === "glowPill";
  const glowDark = isDarkColor(OP.bg);
  const glowLine = glowDark ? blend(adaptiveAccentColor, "#FFFFFF", 0.2) : adaptiveAccentColor;
  // Receipt: a rubber stamp, a tilted outline in the accent.
  const stampButtons = pageStyle.buttonShape === "stamp";
  const pillInk = isDarkColor(adaptiveAccentColor) ? "#FFFFFF" : "#1F1214";
  // The width the cards actually get: inside the list's side padding.
  const cardsWidth = listWidth > 0 ? listWidth - SERVICE_LIST_SIDE_PADDING * 2 : 0;
  const serviceTileWidth = cardsWidth > 0 ? Math.floor((cardsWidth - SERVICE_TILE_GAP) / 2) : 0;
  const serviceTileImageWidth = serviceTileWidth > 0 ? serviceTileWidth - SERVICE_TILE_PADDING * 2 - SERVICE_CARD_BORDER_ROOM : 132;
  const serviceWideImageWidth = cardsWidth > 0 ? Math.floor(cardsWidth) - SERVICE_CARD_PADDING * 2 - SERVICE_CARD_BORDER_ROOM : 280;
  // Storefront's arch sits inside its frame, which takes the tile photo's width.
  const serviceArchWidth = serviceTileImageWidth - SERVICE_ARCH_FRAME * 2;
  const serviceTopImage = serviceArches
    ? { width: serviceArchWidth, height: Math.round(serviceArchWidth * 1.25), borderTopLeftRadius: 999, borderTopRightRadius: 999, borderRadius: 4 }
    : serviceTiles
    ? { width: serviceTileImageWidth, height: Math.round(serviceTileImageWidth * 0.82), borderRadius: 14 }
    : { width: serviceWideImageWidth, height: Math.round(serviceWideImageWidth * 0.5), borderRadius: 16 };
  // Storefront's arch frame round each photo: a soft wash of the accent.
  const archFrame = serviceArches
    ? [
        styles.serviceArchFrame,
        {
          width: serviceTileImageWidth,
          height: Math.round(serviceArchWidth * 1.25) + SERVICE_ARCH_FRAME * 2,
          backgroundColor: withAlpha(adaptiveAccentColor, 0.16),
        },
      ]
    : null;

  return (
    <>
      {/* ── Service-type switch ───────────────────────────────────────────
          Only when the provider genuinely offers more than one macro type —
          a single-type provider's menu opens straight onto the category
          tabs, exactly as it did before this existed.

          Deliberately a plain underline row, NOT a filled pill: the category
          tabs immediately below are already filled pills, and two filled
          controls stacked read as one confused level instead of two. Same
          treatment (and same reasoning) as the History / To Do switch on
          ProviderBookingHistoryScreen. */}
      {provider.serviceTypes.length > 1 ? (
        <View style={[styles.serviceTypeSwitch, { borderBottomColor: SV.border }]}>
          {provider.serviceTypes.map((serviceType) => {
            const active = serviceType === selectedServiceType;
            const count = serviceCountsByType[serviceType] ?? 0;
            return (
              <TouchableOpacity
                key={serviceType}
                style={[
                  styles.serviceTypeTab,
                  active && { borderBottomColor: adaptiveAccentColor },
                ]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  onSelectServiceType(serviceType);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.serviceTypeTabText,
                    {
                      color: active ? SV.text : SV.sub,
                      fontWeight: active ? "700" : "600",
                    },
                  ]}
                >
                  {serviceType}
                  {count > 0 ? `  ${count}` : ""}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {/* Enhanced Category Tabs */}
      {categoryNames.length > 0 ? (
        <FlatList
          data={categoryNames}
          renderItem={({ item: category }) => (
            <CategoryTabItem
              category={category}
              isSelected={selectedCategory === category}
              onPress={() => onSelectCategory(category)}
              cardBg={
                selectedCategory === category ? adaptiveAccentColor : cardBg
              }
              blurIntensity={cardBlurIntensity}
              blurTint={cardBlurTint}
              borderColor={
                selectedCategory === category ? "transparent" : SV.border
              }
              textColor={selectedCategory === category ? "#FFFFFF" : SV.text}
              square={squareCards}
            />
          )}
          keyExtractor={(item) => `cat-${item}`}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryTabs}
          contentContainerStyle={styles.categoryTabsContent}
          nestedScrollEnabled={true}
        />
      ) : (
        <Text style={[styles.emptyServiceTypeText, { color: SV.sub }]}>
          Services for {selectedServiceType} are coming soon.
        </Text>
      )}

      {/* Selected category's description — what it includes, benefits, etc. */}
      {provider.categoryDescriptions[selectedCategory] ? (
        <Text style={[styles.categoryDescriptionText, { color: SV.sub }, bodyFont]}>
          {provider.categoryDescriptions[selectedCategory]}
        </Text>
      ) : null}

      {/* Small text link, not a pill/icon — sits below the category tabs,
          away from the "Services" title. Shared here (not per call site) so
          it appears identically in the inline list and the "All Services"
          sheet without a second control. */}
      {/* Multi-service select flow is gated off (MULTI_SERVICE_BOOKING_ENABLED)
          — with the "Select" entry point hidden, select mode can never be
          entered, so the floating bar and MultiBookingSheet below never show
          either. Single-service "Book" is unaffected. See FUTURE_LOGIC.md. */}
      {canBook && MULTI_SERVICE_BOOKING_ENABLED && !provider.isLinkOnly && (
        <TouchableOpacity
          onPress={onToggleSelectMode}
          activeOpacity={0.6}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          style={styles.selectModeLinkRow}
        >
          <Text style={[styles.selectModeLinkText, { color: adaptiveAccentColor }]}>
            {selectMode ? "Cancel" : "Select"}
          </Text>
        </TouchableOpacity>
      )}

      {/* Services List */}
      <View
        style={[styles.categoryServicesContainer, serviceTwoUp && styles.serviceTilesGrid]}
        onLayout={serviceStacked ? (e) => onListWidth(e.nativeEvent.layout.width) : undefined}
      >
        {services.map((service, serviceIndex) => (
          <BlurView
            key={service.id}
            // A page style other than Classic draws its own surface (see
            // serviceCardSurface), so the frosted blur and its highlight go.
            intensity={serviceSurfaceStyle ? 0 : cardBlurIntensity}
            tint={cardBlurTint}
            style={[
              styles.serviceItemCard,
              { backgroundColor: cardBg, borderColor: SV.border },
              serviceSurfaceStyle,
              squareCards && styles.squareCard,
              serviceTwoUp && (serviceTileWidth > 0 ? { width: serviceTileWidth } : styles.serviceTile),
            ]}
          >
            {serviceSurfaceStyle ? null : (
              <LinearGradient
                colors={cardHighlightColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={[styles.cardHighlight, squareCards && styles.squareCard]}
              />
            )}
            {pageStyle.cards === "gloss" ? <GlossShine radius={squareCards ? 0 : 28} /> : null}
            <View style={styles.serviceCardBlur}>
              <View style={[styles.serviceItem, serviceTwoUp && styles.serviceItemTile, servicePhotoCards && styles.serviceItemPhotoCard]}>
                {serviceNoPhoto ? null : (() => {
                  const isMulti = (service.images?.length ?? 0) > 1;
                  const hasSingle = (service.images?.length ?? 0) === 1;
                  const hasLocal = !!service.image;

                  if (isMulti) {
                    return (
                      <MultiImagePill
                        images={service.images!}
                        onPress={(imgs, idx) => onOpenImages(imgs, idx)}
                        imageStyle={serviceStacked ? serviceTopImage : styles.serviceImage}
                        noGap={serviceStacked}
                        containerStyle={[
                          styles.serviceImageContainer,
                          { marginRight: 0 },
                          serviceStacked && serviceTopImage,
                          archFrame,
                        ]}
                      />
                    );
                  }

                  if (!hasSingle && !hasLocal) {
                    // No photo — placeholder keeps every card's text starting
                    // at the same x position as cards that do have images.
                    return (
                      <View
                        style={[
                          styles.serviceImageContainer,
                          serviceStacked && [serviceTopImage, styles.serviceImageTileGap, styles.serviceImageCentred],
                          styles.serviceImagePlaceholder,
                          archFrame,
                          {
                            backgroundColor: adaptiveAccentColor + "1C",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.serviceImagePlaceholderText,
                            { color: adaptiveAccentColor },
                          ]}
                        >
                          {/* Spa numbers its menu (01, 02…) */}
                          {pageStyle.numberedServices
                            ? menuNumber(serviceIndex)
                            : service.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    );
                  }
                  const imgSrc = hasSingle ? service.images![0] : service.image;
                  return (
                    <TouchableOpacity
                      // A tile stretches what's in it, so a stacked photo is
                      // centred rather than sitting against the left edge.
                      style={serviceStacked ? styles.serviceImageCentred : undefined}
                      activeOpacity={0.85}
                      onPress={() => {
                        if (imgSrc) {
                          const imgs = service.images?.length
                            ? service.images
                            : [imgSrc];
                          onOpenImages(imgs, 0);
                        }
                      }}
                    >
                      <View style={[styles.serviceImageContainer, serviceStacked && [serviceTopImage, styles.serviceImageTileGap], archFrame]}>
                        <Image
                          source={imgSrc}
                          style={serviceStacked ? serviceTopImage : styles.serviceImage}
                          contentFit="cover"
                          transition={0}
                        />
                      </View>
                    </TouchableOpacity>
                  );
                })()}

                <View style={[styles.serviceInfo, serviceTwoUp && styles.serviceInfoTile]}>
                  {servicePills ? (
                    <View style={[styles.servicePill, { backgroundColor: adaptiveAccentColor }]}>
                      <Text style={[styles.servicePillText, { color: pillInk }]}>{service.name.toUpperCase()}</Text>
                    </View>
                  ) : serviceMenu ? (
                    <View style={styles.menuNameRow}>
                      <Text style={[styles.serviceName, styles.menuName, { color: SV.text }, bodyFont]}>{service.name}</Text>
                      <View style={[styles.menuLeader, { borderBottomColor: SV.sub }]} />
                      <Text style={[styles.servicePrice, styles.menuPrice, { color: SV.text }, bodyFont]}>£{service.price}</Text>
                    </View>
                  ) : (
                  <Text style={[styles.serviceName, { color: SV.text }, bodyFont, serviceSpotlight && styles.serviceNameSpotlight]}>
                    {serviceSpotlight ? service.name.toUpperCase() : service.name}
                  </Text>
                  )}
                  {service.serviceType === "consultation" &&
                    provider.onlineConsultationsAvailable && (
                      <Text
                        style={[
                          styles.serviceVirtualBadge,
                          { color: adaptiveAccentColor },
                        ]}
                      >
                        Available virtually
                      </Text>
                    )}
                  <ServiceDescription
                    fontStyle={bodyFont}
                    text={service.description ?? ""}
                    expanded={expandedServiceIds.has(service.id)}
                    onToggle={() => onToggleExpanded(service.id)}
                    textColor={SV.sub}
                    linkColor={SV.text}
                  />

                  {/* Treatment Safety — plain text, no box/border — only shown
                    when the provider actually filled this in (real
                    treatments), directly under the description so clients
                    see it before booking. */}
                  {(service.patchTestRequired ||
                    !!service.minAge ||
                    (service.contraindications?.length ?? 0) > 0) && (
                    <View style={styles.serviceSafetyInline}>
                      <Text
                        style={[styles.serviceSafetyTitle, { color: SV.text }]}
                      >
                        Treatment Safety
                      </Text>
                      {service.patchTestRequired && (
                        <Text
                          style={[styles.serviceSafetyLine, { color: SV.sub }]}
                        >
                          • Patch test required before this treatment
                        </Text>
                      )}
                      {!service.isPregnancySafe && (
                        <Text
                          style={[styles.serviceSafetyLine, { color: SV.sub }]}
                        >
                          • Not recommended during pregnancy
                        </Text>
                      )}
                      {!!service.minAge && (
                        <Text
                          style={[styles.serviceSafetyLine, { color: SV.sub }]}
                        >
                          • Minimum age {service.minAge}
                        </Text>
                      )}
                      {(service.contraindications?.length ?? 0) > 0 && (
                        <Text
                          style={[styles.serviceSafetyLine, { color: SV.sub }]}
                        >
                          • Not suitable if:{" "}
                          {service.contraindications!.join(", ")}
                        </Text>
                      )}
                    </View>
                  )}
                  <View style={styles.serviceDetails}>
                    <Text style={[styles.serviceDuration, { color: SV.sub }, bodyFont]}>
                      {service.duration}
                    </Text>
                    {serviceMenu ? null : (
                    <Text style={[styles.servicePrice, { color: SV.text }, bodyFont]}>
                      £{service.price}
                    </Text>
                    )}
                  </View>
                </View>

                {/* Booking controls are absent, rather than merely disabled,
                    on the provider's own profile and while ownership loads. */}
                {canBook && (
                <View style={[styles.serviceActionColumn, serviceTwoUp && styles.serviceActionTile]}>
                  {(() => {
                    const fullyBooked = DEBUG_FORCE_FULLY_BOOKED || !takingBookings || serviceFullyBooked[service.dbId] === true;

                    if (selectMode) {
                      const isSelected = selectedServiceIds.has(service.dbId);
                      const hasAddOns = (service.addOns?.length ?? 0) > 0;
                      const pickedAddOns = addOnsBySelectedService[service.dbId] ?? [];
                      return (
                        <>
                          <TouchableOpacity
                            disabled={fullyBooked}
                            // Checking a service that HAS add-ons opens the
                            // add-on popup — another Modal — so runAction has
                            // to close the "All Services"
                            // sheet when this row is rendered inside it, same
                            // as Book/Waitlist below. Unchecking, and checking
                            // a service with no add-ons, opens nothing, so the
                            // sheet stays open for those.
                            onPress={() => {
                              const isSelecting = !selectedServiceIds.has(service.dbId);
                              if (isSelecting && hasAddOns) {
                                runAction(() => onToggleServiceSelected(service));
                              } else {
                                onToggleServiceSelected(service);
                              }
                            }}
                            style={[
                              styles.selectCheckbox,
                              { borderColor: fullyBooked ? SV.border : adaptiveAccentColor },
                              isSelected && {
                                backgroundColor: adaptiveAccentColor,
                                borderColor: adaptiveAccentColor,
                              },
                              fullyBooked && { opacity: 0.4 },
                            ]}
                            activeOpacity={0.8}
                          >
                            {isSelected && (
                              <Ionicons name="checkmark" size={16} color="#fff" />
                            )}
                          </TouchableOpacity>
                          {isSelected && hasAddOns && (
                            <TouchableOpacity
                              onPress={() => {
                                runAction(() => {
                                  Haptics.selectionAsync().catch(() => {});
                                  onEditAddOns(service);
                                });
                              }}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                              <Text style={[styles.editAddOnsLink, { color: adaptiveAccentColor }]}>
                                {pickedAddOns.length > 0 ? 'Edit' : 'Add extras'}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </>
                      );
                    }

                    return (
                      <TouchableOpacity
                        disabled={fullyBooked || bookDisplayOnly}
                        style={[
                          styles.bookButton,
                          squareButtons && styles.squareButton,
                          {
                            backgroundColor:
                              fullyBooked
                                ? withAlpha(SV.sub, 0.18)
                                : adaptiveAccentColor,
                          },
                          textLinkButtons && styles.textLinkButton,
                          outlineButtons && [styles.outlineButton, { borderColor: fullyBooked ? SV.border : SV.text }],
                          arrowPillButtons && styles.arrowPillButton,
                          shopBoxButtons && [styles.shopBoxButton, { borderColor: fullyBooked ? SV.border : SV.text }],
                          glowPillButtons && [
                            styles.glowPillButton,
                            { borderColor: fullyBooked ? SV.border : glowLine, shadowColor: adaptiveAccentColor, shadowOpacity: glowDark && !fullyBooked ? 0.8 : 0 },
                          ],
                          stampButtons && [styles.stampButton, { borderColor: fullyBooked ? SV.border : adaptiveAccentColor }],
                        ]}
                        onPress={() => {
                          runAction(() => onBook(service));
                        }}
                        activeOpacity={0.8}
                        accessibilityState={{ disabled: fullyBooked }}
                      >
                        <Text
                          style={[
                            styles.bookButtonText,
                            squareButtons && styles.squareButtonText,
                            fullyBooked
                              ? { color: SV.sub, fontSize: 10 }
                              : { color: "#fff" },
                            // After the colour above: a text link is the accent, or grey when full.
                            textLinkButtons && [styles.textLinkButtonText, { color: fullyBooked ? SV.sub : adaptiveAccentColor }],
                            outlineButtons && !fullyBooked && { color: SV.text },
                            arrowPillButtons && !fullyBooked && { color: pillInk },
                            shopBoxButtons && [styles.shopBoxButtonText, { color: fullyBooked ? SV.sub : SV.text }],
                            glowPillButtons && [styles.glowPillButtonText, { color: fullyBooked ? SV.sub : SV.text }],
                            stampButtons && [styles.stampButtonText, { color: fullyBooked ? SV.sub : adaptiveAccentColor }],
                          ]}
                        >
                          {!takingBookings
                              ? "Not taking bookings"
                              : fullyBooked
                              ? "Fully Booked"
                              // Boutique says "Add to basket"; it still opens the booking sheet.
                              : arrowPillButtons || shopBoxButtons
                              ? "Book now"
                              : pageStyle.bookLabel ?? "Book"}
                        </Text>
                        {arrowPillButtons && takingBookings && !fullyBooked ? (
                          <View style={[styles.arrowPillCircle, { borderColor: pillInk }]}>
                            <Ionicons name="chevron-forward" size={11} color={pillInk} />
                          </View>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })()}

                  {(() => {
                    const wEntry = waitlistPlaces[service.dbId];
                    // Held: the slot is theirs for WAITLIST_HOLD_MINUTES; it's paid for
                    // from Bookings, so the chip goes there. No ✕ while held:
                    // they pass on it from Bookings instead.
                    if (wEntry?.status === "notified") {
                      return (
                        <TouchableOpacity
                          style={[styles.waitlistChip, { borderColor: adaptiveAccentColor, backgroundColor: adaptiveAccentColor }]}
                          onPress={() => {
                            runAction(onOpenHeldPlace);
                          }}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityLabel="A slot is held for you. Open Bookings to confirm and pay."
                        >
                          <Text style={[styles.waitlistChipText, { color: "#fff" }]}>Held for you</Text>
                          <Ionicons name="chevron-forward" size={11} color="#fff" />
                        </TouchableOpacity>
                      );
                    }
                    if (wEntry) {
                      return (
                        <View
                          style={[
                            styles.waitlistChip,
                            { borderColor: adaptiveAccentColor + "70", backgroundColor: adaptiveAccentColor + "0D" },
                          ]}
                        >
                          <Text style={[styles.waitlistChipText, { color: adaptiveAccentColor }]}>
                            {placeInLineLabel(wEntry.placeInLine)}
                          </Text>
                          <TouchableOpacity
                            onPress={() => {
                              runAction(() => onLeaveWaitlist(wEntry));
                            }}
                            activeOpacity={0.6}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            accessibilityRole="button"
                            accessibilityLabel={`Leave the ${service.name} waitlist`}
                          >
                            <Text style={[styles.waitlistChipX, { color: adaptiveAccentColor }]}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    }
                    // undefined means "still checking" and true means
                    // "still has openings" — both stay quiet here. A closed
                    // schedule reads as "has openings" (the free-slot check
                    // skips closed providers), but its waitlist still takes
                    // people: a slot freed while full goes to them.
                    if (!DEBUG_FORCE_FULLY_BOOKED && takingBookings && serviceNearTermAvailability[service.dbId] !== false)
                      return null;
                    // Provider turned waitlists off in Automations — still
                    // surface the scarcity so the client isn't only told
                    // "nothing this fortnight" after tapping Book and paging
                    // through empty weeks in the calendar. Skipped when
                    // the Book button above already reads "Fully Booked" —
                    // this note would just repeat the same claim.
                    if (!DEBUG_FORCE_FULLY_BOOKED && !provider.waitlistEnabled) {
                      if (!takingBookings || serviceFullyBooked[service.dbId] === true) return null;
                      return (
                        <Text
                          style={[
                            styles.fullyBookedNote,
                            { color: SV.sub },
                          ]}
                        >
                          No openings next 2 wks
                        </Text>
                      );
                    }
                    return (
                      <TouchableOpacity
                        style={[
                          styles.waitlistJoinBtn,
                          squareButtons && styles.squareButton,
                          {
                            borderColor: adaptiveAccentColor + "70",
                            backgroundColor: adaptiveAccentColor + "0D",
                          },
                        ]}
                        onPress={() => {
                          runAction(() => onJoinWaitlist(service));
                        }}
                        disabled={bookDisplayOnly}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.waitlistJoinText,
                            { color: adaptiveAccentColor },
                          ]}
                        >
                          Waitlist
                        </Text>
                      </TouchableOpacity>
                    );
                  })()}
                </View>
                )}
              </View>
            </View>
          </BlurView>
        ))}
        {showAll && (
          <TouchableOpacity
            style={styles.showAllServicesBtn}
            activeOpacity={0.7}
            onPress={showAll.onPress}
          >
            <Text
              style={[styles.showAllServicesText, { color: adaptiveAccentColor }]}
            >
              {`Show all ${showAll.count} services`}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={adaptiveAccentColor} />
          </TouchableOpacity>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  bookButton: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#B87E92",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  bookButtonText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 12,
    fontWeight: "bold",
    letterSpacing: 0.4,
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
  categoryDescriptionText: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 20,
    marginTop: -12, // categoryTabs already carries a 20px marginBottom
    marginBottom: 14,
  },
  categoryServicesContainer: {
    gap: 15,
    paddingHorizontal: SERVICE_LIST_SIDE_PADDING,
  },
  categoryTabs: {
    marginBottom: 20,
    maxHeight: 60, // Increased to accommodate animation
    paddingHorizontal: 20,
  },
  categoryTabsContent: {
    paddingRight: 20,
    gap: 12,
    paddingVertical: 8, // Add vertical padding to prevent cutoff
  },
  editAddOnsLink: {
    fontSize: 11,
    fontWeight: "700",
  },
  emptyServiceTypeText: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  fullyBookedNote: {
    fontSize: 10,
    fontWeight: "600",
    textAlign: "right",
    maxWidth: 90,
  },
  menuLeader: { flex: 1, minWidth: 16, borderBottomWidth: 1, borderStyle: "dotted", marginBottom: 4 },
  menuName: { flexShrink: 1, marginBottom: 0, fontSize: 15 },
  // Muse's printed menu line.
  menuNameRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  menuPrice: { fontSize: 14 },
  outlineButton: { backgroundColor: "transparent", borderWidth: 1.5, shadowOpacity: 0, elevation: 0 },
  seeMoreText: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 11,
    fontWeight: "800",
    textDecorationLine: "underline",
    marginBottom: 6,
  },
  selectCheckbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  // Plain small text link, right-aligned under the category tabs — not a
  // pill or icon, and deliberately away from the "Services" title.
  selectModeLinkRow: {
    alignItems: "flex-end",
    paddingHorizontal: 20,
    marginTop: -8,
    marginBottom: 10,
  },
  selectModeLinkText: {
    fontSize: 13,
    fontWeight: "600",
  },
  // Waitlist — service card
  serviceActionColumn: { alignItems: "center", gap: 6 },
  serviceActionTile: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", marginTop: 10 },
  serviceCardBlur: {
    flex: 1,
  },
  serviceDescription: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "700",
    fontSize: 12,
    marginBottom: 4,
  },
  serviceDescriptionMeasure: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    opacity: 0,
  },
  serviceDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    // At a larger text size the length and price can be wider than the card's
    // middle column; the price drops under the length instead of being cut off.
    flexWrap: "wrap",
    columnGap: 8,
  },
  serviceDuration: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "700",
    fontSize: 11,
    flexShrink: 1,
  },
  serviceImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  serviceImageContainer: {
    position: "relative",
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: "hidden",
    marginRight: 15,
  },
  serviceImagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  serviceImagePlaceholderText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 22,
  },
  serviceImageTileGap: { marginRight: 0, marginBottom: 10 },
  serviceImageCentred: { alignSelf: "center" },
  serviceInfo: {
    flex: 1,
    marginRight: 15,
  },
  serviceInfoTile: { marginRight: 0 },
  serviceItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
  },
  serviceItemCard: {
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    shadowColor: "#B87E92",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    // elevation: 0 (Android only) — overflow:'hidden' + borderRadius + a
    // non-zero elevation clips Android's shadow to the rounded outline
    // instead of letting it fade outward, showing as a dark ring. iOS keeps
    // its shadow via shadow* above.
    elevation: 0,
    marginBottom: 12,
  },
  // Riviera: the wide photo takes the first line; the details and Book wrap under it.
  serviceItemPhotoCard: { flexWrap: "wrap" },
  serviceItemTile: { flexDirection: "column", alignItems: "stretch", padding: SERVICE_TILE_PADDING },
  serviceName: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 14,
    marginBottom: 5,
  },
  servicePrice: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 14,
    fontWeight: "bold",
    // Color will be set dynamically using adaptiveAccentColor
  },
  serviceSafetyInline: {
    marginBottom: 6,
    gap: 2,
  },
  serviceSafetyLine: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 11,
    lineHeight: 15,
  },
  serviceSafetyTitle: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  // Before the list is measured; then each tile gets its width in points.
  serviceTile: { width: "48%" },
  serviceArchFrame: { padding: SERVICE_ARCH_FRAME, borderTopLeftRadius: 999, borderTopRightRadius: 999, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, overflow: "hidden" },
  serviceNameSpotlight: { fontFamily: "Oswald-Bold", fontSize: 16, lineHeight: 21, letterSpacing: 0.4 },
  servicePill: { alignSelf: "flex-start", borderRadius: 30, paddingHorizontal: 14, paddingVertical: 7, marginBottom: 4 },
  servicePillText: { fontFamily: "Manrope-Bold", fontSize: 12, letterSpacing: 0.6 },
  arrowPillButton: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 16, paddingRight: 6 },
  arrowPillCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.4, alignItems: "center", justifyContent: "center" },
  shopBoxButton: { backgroundColor: "transparent", borderWidth: 1, borderRadius: 1, shadowOpacity: 0, elevation: 0, paddingHorizontal: 12 },
  shopBoxButtonText: { fontSize: 10, letterSpacing: 2, textTransform: "uppercase" },
  glowPillButton: { backgroundColor: "transparent", borderWidth: 1.5, borderRadius: 999, shadowOffset: { width: 0, height: 0 }, shadowRadius: 8, elevation: 0 },
  glowPillButtonText: { fontSize: 11, letterSpacing: 2.5, textTransform: "uppercase" },
  stampButton: { backgroundColor: "transparent", borderWidth: 2, borderRadius: 4, shadowOpacity: 0, elevation: 0, transform: [{ rotate: "-4deg" }] },
  stampButtonText: { fontFamily: "Jura-VariableFont_wght", fontWeight: "700", fontSize: 11, letterSpacing: 2.5, textTransform: "uppercase" },
  // Posy: two tiles across, each a column of photo, details and Book.
  // columnGap too: the list's `gap: 15` would otherwise set a 15pt gap between
  // the two, wider than the room left beside them, and wrap them one a row.
  serviceTilesGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: SERVICE_TILE_GAP, columnGap: 0 },
  // Service-type switch — plain underline indicator, mirroring the
  // History / To Do row on ProviderBookingHistoryScreen: enough to show
  // selection without a second filled control competing with the category
  // pills directly beneath it.
  serviceTypeSwitch: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  serviceTypeTab: {
    paddingTop: 4,
    // More space below the label than above, so the 2px indicator doesn't sit
    // tight against the text — same spacing as the booking-history switch.
    paddingBottom: 12,
    marginRight: 24,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  serviceTypeTabText: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 15,
    letterSpacing: -0.1,
  },
  serviceVirtualBadge: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "700",
    fontSize: 10,
    marginBottom: 5,
  },
  showAllServicesBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
  },
  showAllServicesText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  squareButton: { borderRadius: 2 },
  squareButtonText: { textTransform: "uppercase", letterSpacing: 1.4 },
  // Every corner, not just borderRadius: the top highlight strips set their
  // own top-corner radii, which borderRadius: 0 alone doesn't override.
  squareCard: {
    borderRadius: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  // Muse: the Book button is just the word, underlined.
  textLinkButton: { backgroundColor: "transparent", paddingHorizontal: 4, shadowOpacity: 0, elevation: 0 },
  textLinkButtonText: { textDecorationLine: "underline", fontSize: 13 },
  waitlistChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  waitlistChipText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 11,
    letterSpacing: 0.3,
  },
  waitlistChipX: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 11,
    opacity: 0.7,
  },
  waitlistJoinBtn: {
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  waitlistJoinText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 12,
    fontWeight: "bold",
  },
});
