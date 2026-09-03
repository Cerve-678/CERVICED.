import React, { useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import TabIcon from "../../components/TabIcon";
import type { WeeklyOpeningHoursDay } from "../../services/AvailabilityService";
import type { DbPortfolioItem } from "../../types/database";
import type { ProviderReviewItem } from "./useProviderProfileData";

const INLINE_PORTFOLIO_LIMIT = 20;
const COLUMN_GAP = 12;

interface SectionPalette {
  text: string;
  sub: string;
  border: string;
  separator: string;
  background: string;
  cardBackground: string;
  accent: string;
  blurTint: "dark" | "light";
  blurIntensity: number;
  highlightColors: [string, string];
}

export const ProviderSpecialtiesSection = React.memo(function ProviderSpecialtiesSection({
  specialties,
  textColor,
  accent,
}: {
  specialties: string[];
  textColor: string;
  accent: string;
}) {
  if (specialties.length === 0) return null;
  return (
    <View style={styles.plainSection}>
      <Text style={[styles.plainTitle, { color: textColor }]}>Specialties</Text>
      <View style={styles.chipRow}>
        {specialties.map(specialty => (
          <View
            key={specialty}
            style={[styles.chip, { borderColor: `${accent}55`, backgroundColor: `${accent}18` }]}
          >
            <Text style={[styles.chipText, { color: textColor }]}>{specialty}</Text>
          </View>
        ))}
      </View>
    </View>
  );
});

export const ProviderReviewPreviewSection = React.memo(function ProviderReviewPreviewSection({
  reviews,
  loading,
  palette,
  onSeeAll,
}: {
  reviews: ProviderReviewItem[];
  loading: boolean;
  palette: SectionPalette;
  onSeeAll: () => void;
}) {
  return (
    <BlurView
      intensity={palette.blurIntensity}
      tint={palette.blurTint}
      style={[styles.card, { backgroundColor: palette.cardBackground, borderColor: palette.border }]}
    >
      <LinearGradient colors={palette.highlightColors} style={styles.highlight} />
      <Text style={[styles.cardTitle, { color: palette.text }]}>Reviews</Text>
      {loading && reviews.length === 0 ? (
        <Text style={[styles.bodyText, { color: palette.sub }]}>Loading reviews…</Text>
      ) : null}
      {!loading && reviews.length === 0 ? (
        <Text style={[styles.bodyText, { color: palette.sub }]}>No reviews yet.</Text>
      ) : null}
      {reviews.slice(0, 5).map(review => (
        <View key={review.id} style={[styles.review, { borderBottomColor: palette.separator }]}>
          <View style={styles.reviewHeader}>
            <Text style={[styles.reviewer, { color: palette.text }]}>{review.name}</Text>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map(star => (
                <TabIcon
                  key={star}
                  name="star"
                  size={12}
                  color={star <= review.rating ? "#FFD700" : palette.border}
                />
              ))}
            </View>
            <Text style={[styles.reviewDate, { color: palette.sub }]}>{review.date}</Text>
          </View>
          {review.comment ? (
            <Text style={[styles.bodyText, { color: palette.sub }]}>{review.comment}</Text>
          ) : null}
        </View>
      ))}
      <TouchableOpacity style={styles.textButton} onPress={onSeeAll} activeOpacity={0.6}>
        <Text style={[styles.textButtonLabel, { color: palette.text }]}>See All Reviews</Text>
      </TouchableOpacity>
    </BlurView>
  );
});

export const ProviderOpeningHoursSection = React.memo(function ProviderOpeningHoursSection({
  openingHours,
  palette,
}: {
  openingHours: WeeklyOpeningHoursDay[] | null;
  palette: SectionPalette;
}) {
  if (!openingHours || openingHours.length === 0) return null;
  const today = new Date().getDay();
  return (
    <BlurView
      intensity={palette.blurIntensity}
      tint={palette.blurTint}
      style={[styles.card, { backgroundColor: palette.cardBackground, borderColor: palette.border }]}
    >
      <LinearGradient colors={palette.highlightColors} style={styles.highlight} />
      <Text style={[styles.cardTitle, { color: palette.text }]}>Opening Hours</Text>
      {openingHours.map((day, index) => (
        <View
          key={day.dayOfWeek}
          style={[
            styles.hoursRow,
            { borderBottomColor: palette.separator },
            index === openingHours.length - 1 && styles.lastRow,
          ]}
        >
          <Text style={[styles.hoursLabel, { color: day.dayOfWeek === today ? palette.accent : palette.sub }]}>
            {day.label}
          </Text>
          <Text style={[styles.hoursValue, { color: day.isOpen ? palette.text : palette.sub }]}>
            {day.isOpen ? day.hours : "Closed"}
          </Text>
        </View>
      ))}
    </BlurView>
  );
});

export const ProviderContactSection = React.memo(function ProviderContactSection({
  contact,
  palette,
  onOpenLink,
  onOpenPublicLink,
  onGetInTouch,
}: {
  contact: {
    location: string;
    phone: string;
    whatsapp: string;
    email: string;
    instagram: string;
    website: string;
  };
  palette: SectionPalette;
  onOpenLink: (url: string) => void;
  onOpenPublicLink: (url: string) => void;
  onGetInTouch: () => void;
}) {
  const rows = [
    contact.location ? { label: "Location", value: contact.location, url: null, publicLink: false } : null,
    contact.phone ? { label: "Phone", value: "Message ›", url: `sms:${contact.phone.replace(/\s/g, "")}`, publicLink: false } : null,
    contact.whatsapp ? { label: "WhatsApp", value: "Open ›", url: `https://wa.me/${contact.whatsapp.replace(/[^0-9+]/g, "")}`, publicLink: false } : null,
    contact.email ? { label: "Email", value: "Send ›", url: `mailto:${contact.email}`, publicLink: false } : null,
    contact.instagram ? { label: "Instagram", value: `@${contact.instagram} ›`, url: `https://instagram.com/${contact.instagram}`, publicLink: true } : null,
    contact.website ? { label: "Website", value: "Visit ›", url: contact.website, publicLink: true } : null,
  ].filter((row): row is { label: string; value: string; url: string | null; publicLink: boolean } => row != null);

  return (
    <BlurView
      intensity={palette.blurIntensity}
      tint={palette.blurTint}
      style={[styles.card, { backgroundColor: palette.cardBackground, borderColor: palette.border }]}
    >
      <LinearGradient colors={palette.highlightColors} style={styles.highlight} />
      <Text style={[styles.cardTitle, { color: palette.text }]}>Contact</Text>
      {rows.map(row => {
        const content = (
          <>
            <Text style={[styles.hoursLabel, { color: palette.sub }]}>{row.label}</Text>
            <Text style={[styles.contactValue, { color: palette.text }]} numberOfLines={1}>{row.value}</Text>
          </>
        );
        return row.url ? (
          <TouchableOpacity
            key={row.label}
            style={[styles.contactRow, { borderBottomColor: palette.separator }]}
            onPress={() => (row.publicLink ? onOpenPublicLink(row.url!) : onOpenLink(row.url!))}
            activeOpacity={0.75}
          >
            {content}
          </TouchableOpacity>
        ) : (
          <View key={row.label} style={[styles.contactRow, { borderBottomColor: palette.separator }]}>
            {content}
          </View>
        );
      })}
      <TouchableOpacity
        style={[styles.contactButton, { backgroundColor: palette.accent }]}
        onPress={onGetInTouch}
        activeOpacity={0.8}
      >
        <Text style={styles.contactButtonText}>Get In Touch</Text>
      </TouchableOpacity>
    </BlurView>
  );
});

export const ProviderAdditionalInfoSection = React.memo(function ProviderAdditionalInfoSection({
  groups,
  qualifications,
  goodToKnow,
  venueItems,
  palette,
  onOpenImage,
}: {
  groups: { label: string; chips: string[] }[];
  qualifications: string;
  goodToKnow: string;
  venueItems: DbPortfolioItem[];
  palette: SectionPalette;
  onOpenImage: (images: { uri: string }[], index: number) => void;
}) {
  const venueImages = useMemo(
    () => venueItems.map(item => ({ uri: item.image_url })),
    [venueItems],
  );
  if (groups.length === 0 && !qualifications && !goodToKnow && venueItems.length === 0) return null;
  return (
    <BlurView
      intensity={palette.blurIntensity}
      tint={palette.blurTint}
      style={[styles.card, { backgroundColor: palette.cardBackground, borderColor: palette.border }]}
    >
      <LinearGradient colors={palette.highlightColors} style={styles.highlight} />
      <Text style={[styles.cardTitle, { color: palette.text }]}>Additional Information</Text>
      {groups.map((group, index) => (
        <View key={group.label} style={[styles.infoBlock, index === 0 && styles.infoBlockFirst]}>
          <Text style={[styles.infoLabel, { color: palette.sub }]}>{group.label}</Text>
          <View style={styles.chipRow}>
            {group.chips.map(chip => (
              <View key={chip} style={[styles.chip, { borderColor: `${palette.accent}55`, backgroundColor: `${palette.accent}18` }]}>
                <Text style={[styles.chipText, { color: palette.text }]}>{chip}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
      {qualifications ? (
        <View style={styles.infoBlock}>
          <Text style={[styles.infoLabel, { color: palette.sub }]}>Qualifications</Text>
          <Text style={[styles.infoText, { color: palette.text }]}>{qualifications}</Text>
        </View>
      ) : null}
      {goodToKnow ? (
        <View style={styles.infoBlock}>
          <Text style={[styles.infoLabel, { color: palette.sub }]}>Good to know</Text>
          <Text style={[styles.infoText, { color: palette.text }]}>{goodToKnow}</Text>
        </View>
      ) : null}
      {venueItems.length > 0 ? (
        <View style={styles.infoBlock}>
          <Text style={[styles.infoLabel, { color: palette.sub }]}>Venue</Text>
          <FlatList
            data={venueItems}
            horizontal
            keyExtractor={item => item.id}
            showsHorizontalScrollIndicator={false}
            initialNumToRender={4}
            maxToRenderPerBatch={4}
            windowSize={5}
            contentContainerStyle={styles.venueStrip}
            renderItem={({ item, index }) => (
              <TouchableOpacity onPress={() => onOpenImage(venueImages, index)} style={styles.venueTile} activeOpacity={0.9}>
                <Image
                  source={{ uri: item.image_url }}
                  style={styles.venueImage}
                  contentFit="cover"
                  transition={0}
                  recyclingKey={item.id}
                />
              </TouchableOpacity>
            )}
          />
        </View>
      ) : null}
    </BlurView>
  );
});

type PortfolioTile = DbPortfolioItem & { tileHeight: number; globalIndex: number };

function tileHeight(item: DbPortfolioItem, width: number): number {
  const ratio = item.aspect_ratio && item.aspect_ratio > 0 ? item.aspect_ratio : 1;
  return Math.min(Math.max(width / ratio, 140), 300);
}

export const ProviderPortfolioSection = React.memo(function ProviderPortfolioSection({
  items,
  palette,
  onOpenImage,
  interactiveImages = true,
}: {
  items: DbPortfolioItem[];
  palette: SectionPalette;
  onOpenImage: (images: { uri: string }[], index: number) => void;
  interactiveImages?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  // Measured per render rather than captured at module load, so the two-column
  // maths stays right after a rotation or in split-screen.
  const { width: screenWidth } = useWindowDimensions();
  const inlineColumnWidth = (screenWidth - 40 - COLUMN_GAP) / 2;
  const modalColumnWidth = (screenWidth - 52) / 2;
  const images = useMemo(() => items.map(item => ({ uri: item.image_url })), [items]);
  const columns = useMemo(() => {
    const result: PortfolioTile[][] = [[], []];
    const heights = [0, 0];
    items.slice(0, INLINE_PORTFOLIO_LIMIT).forEach((item, globalIndex) => {
      const height = tileHeight(item, inlineColumnWidth);
      const column = heights[0]! <= heights[1]! ? 0 : 1;
      result[column]!.push({ ...item, tileHeight: height, globalIndex });
      heights[column]! += height + COLUMN_GAP;
    });
    return result;
  }, [items, inlineColumnWidth]);

  if (items.length === 0) return null;

  const openFromModal = (index: number) => {
    setShowAll(false);
    setTimeout(() => onOpenImage(images, index), 220);
  };

  return (
    <View style={styles.portfolioSection}>
      <View style={styles.portfolioHeading}>
        <Text style={[styles.plainTitle, { color: palette.text }]}>Portfolio</Text>
        <TouchableOpacity onPress={() => setShowAll(true)} hitSlop={10}>
          <Text style={[styles.portfolioSeeAll, { color: palette.accent }]}>See all {items.length}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.columns}>
        {columns.map((column, columnIndex) => (
          <View key={columnIndex} style={styles.column}>
            {column.map(item => (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.88}
                onPress={() => onOpenImage(images, item.globalIndex)}
                disabled={!interactiveImages}
                style={styles.portfolioTile}
              >
                <Image
                  source={{ uri: item.image_url }}
                  style={{ width: "100%", height: item.tileHeight }}
                  contentFit="cover"
                  transition={0}
                  recyclingKey={item.id}
                />
                {item.caption ? (
                  <View style={styles.captionWrap}>
                    <Text style={styles.caption} numberOfLines={1}>{item.caption}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>

      <Modal visible={showAll} animationType="slide" onRequestClose={() => setShowAll(false)}>
        <SafeAreaView style={[styles.modal, { backgroundColor: palette.background }]}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={[styles.modalTitle, { color: palette.text }]}>Portfolio</Text>
              <Text style={[styles.modalSubtitle, { color: palette.sub }]}>{items.length} photos</Text>
            </View>
            <TouchableOpacity
              style={[styles.closeButton, { backgroundColor: palette.cardBackground }]}
              onPress={() => setShowAll(false)}
              accessibilityLabel="Close portfolio"
            >
              <Ionicons name="close" size={22} color={palette.text} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={items}
            numColumns={2}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.modalGrid}
            columnWrapperStyle={styles.modalRow}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            updateCellsBatchingPeriod={40}
            windowSize={5}
            removeClippedSubviews={Platform.OS === "android"}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                style={[styles.modalTile, { width: modalColumnWidth }]}
                activeOpacity={0.88}
                onPress={() => openFromModal(index)}
                disabled={!interactiveImages}
              >
                <Image
                  source={{ uri: item.image_url }}
                  style={{ width: modalColumnWidth, height: tileHeight(item, modalColumnWidth) }}
                  contentFit="cover"
                  transition={0}
                  recyclingKey={item.id}
                />
                {item.caption ? (
                  <View style={styles.captionWrap}>
                    <Text style={styles.caption} numberOfLines={1}>{item.caption}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  plainSection: { marginTop: 20, marginBottom: 20 },
  plainTitle: { fontFamily: "BakbakOne-Regular", fontSize: 20, marginBottom: 15 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontFamily: "Jura-VariableFont_wght", fontWeight: "700", fontSize: 12 },
  card: {
    padding: 22,
    borderRadius: 26,
    marginBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  highlight: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  cardTitle: { fontFamily: "BakbakOne-Regular", fontSize: 20, marginBottom: 16 },
  bodyText: { fontFamily: "Jura-VariableFont_wght", fontSize: 12, lineHeight: 18, marginTop: 7 },
  review: { marginBottom: 15, paddingBottom: 15, borderBottomWidth: StyleSheet.hairlineWidth },
  reviewHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  reviewer: { fontFamily: "BakbakOne-Regular", fontSize: 12 },
  stars: { flexDirection: "row", gap: 1 },
  reviewDate: { fontFamily: "Jura-VariableFont_wght", fontWeight: "700", fontSize: 10, marginLeft: "auto" },
  textButton: { alignItems: "center", paddingTop: 4, paddingBottom: 2 },
  textButtonLabel: { fontFamily: "Jura-VariableFont_wght", fontWeight: "700", fontSize: 12 },
  hoursRow: {
    minHeight: 42,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  lastRow: { borderBottomWidth: 0 },
  hoursLabel: { fontFamily: "Jura-VariableFont_wght", fontWeight: "700", fontSize: 12 },
  hoursValue: { fontFamily: "Jura-VariableFont_wght", fontSize: 12 },
  contactRow: {
    minHeight: 46,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  contactValue: { flex: 1, textAlign: "right", fontFamily: "Jura-VariableFont_wght", fontWeight: "700", fontSize: 12 },
  contactButton: { minHeight: 46, borderRadius: 15, alignItems: "center", justifyContent: "center", marginTop: 18 },
  contactButtonText: { color: "#fff", fontFamily: "BakbakOne-Regular", fontSize: 13 },
  infoBlock: { marginTop: 16 },
  infoBlockFirst: { marginTop: 0 },
  infoLabel: { fontFamily: "Jura-VariableFont_wght", fontWeight: "800", fontSize: 11, marginBottom: 7, textTransform: "uppercase", letterSpacing: 0.5 },
  infoText: { fontFamily: "Jura-VariableFont_wght", fontSize: 13, lineHeight: 19 },
  venueStrip: { gap: 10, paddingRight: 8 },
  venueTile: { width: 150, height: 105, borderRadius: 14, overflow: "hidden" },
  venueImage: { width: "100%", height: "100%" },
  portfolioSection: { marginTop: 20, marginBottom: 20 },
  portfolioHeading: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  portfolioSeeAll: { fontFamily: "Jura-VariableFont_wght", fontWeight: "800", fontSize: 12 },
  columns: { flexDirection: "row", gap: COLUMN_GAP },
  column: { flex: 1, gap: COLUMN_GAP },
  portfolioTile: { borderRadius: 18, overflow: "hidden", backgroundColor: "rgba(127,127,127,0.08)" },
  captionWrap: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    paddingHorizontal: 10, paddingTop: 14, paddingBottom: 8,
    backgroundColor: "rgba(0,0,0,0.32)",
  },
  caption: { fontFamily: "Jura-VariableFont_wght", fontWeight: "700", fontSize: 11, color: "#fff" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20 },
  modalTitle: { fontFamily: "BakbakOne-Regular", fontSize: 24 },
  modalSubtitle: { fontFamily: "Jura-VariableFont_wght", fontSize: 12, marginTop: 2 },
  closeButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  modalGrid: { paddingHorizontal: 20, paddingBottom: 40 },
  modalRow: { gap: COLUMN_GAP, marginBottom: COLUMN_GAP },
  modalTile: { borderRadius: 16, overflow: "hidden", backgroundColor: "rgba(127,127,127,0.08)" },
});
