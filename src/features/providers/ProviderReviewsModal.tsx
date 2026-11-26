/**
 * A provider's reviews in full, opened from See All Reviews on their page.
 * Shared by the app's profile and the website, so both show the same list.
 */
import React, { useMemo } from "react";
import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SafeAreaView, WindowControlsInsetProvider } from "../../components/SafeArea";
import type { ProviderReviewItem } from "./reviewPresentation";
import { readableDialog } from '../../constants/readableWidth';
import { tr } from '../../i18n';
import { useTranslation } from '../../i18n';

interface ProviderReviewsModalProps {
  isVisible: boolean;
  onClose: () => void;
  reviews: ProviderReviewItem[];
  providerName: string;
  adaptiveAccentColor: string;
  providerGradient: [string, string, ...string[]];
  /** Branding → Card Shape. */
  squareCards: boolean;
  /** Signed-in app only (not the website): each review gets a Report link. */
  onReportReview?: (reviewId: string) => void;
}

export const ProviderReviewsModal: React.FC<ProviderReviewsModalProps> = React.memo(
  ({
    isVisible,
    onClose,
    reviews,
    providerName,
    adaptiveAccentColor,
    providerGradient,
    squareCards,
    onReportReview,
  }) => {
  // Re-render when the language changes (the text below uses tr()).
  useTranslation();
    const allReviews = reviews;

    const averageRating = useMemo(() => {
      if (allReviews.length === 0) return "0.0";
      const total = allReviews.reduce((sum, review) => sum + review.rating, 0);
      return (total / allReviews.length).toFixed(1);
    }, [allReviews]);

    return (
      <Modal
        visible={isVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
      >
        {/* Own provider: a Modal is its own native surface, so the app root's provider can't measure it and SafeAreaView in here would get zero insets. */}
        <SafeAreaProvider>
        <WindowControlsInsetProvider>
        <View style={styles.modalBackground}>
          <LinearGradient
            colors={providerGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[styles.modalGradient, { opacity: 0.85 }]}
          />

          <SafeAreaView style={styles.modalSafeArea}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderContent}>
                <View>
                  <Text style={styles.modalTitle}>{tr('discover.profile.allReviews')}</Text>
                  <Text style={styles.modalSubtitle}>
                    @{providerName} • {averageRating} ★ ({allReviews.length}{" "}
                    reviews)
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.modalCloseButton,
                    { backgroundColor: adaptiveAccentColor },
                  ]}
                  onPress={onClose}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Reviews List — virtualized so a heavily-reviewed provider doesn't
                mount every BlurView/LinearGradient card at once */}
            <FlatList
              data={allReviews}
              keyExtractor={(review) => String(review.id)}
              style={styles.modalContent}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              windowSize={7}
              renderItem={({ item: review }) => (
                <BlurView
                  intensity={20}
                  tint="light"
                  style={[styles.modalReviewCard, squareCards && styles.squareCard]}
                >
                  <LinearGradient
                    colors={["rgba(255,255,255,0.4)", "transparent"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={[styles.modalCardHighlight, squareCards && styles.squareCard]}
                  />
                  <View style={styles.modalReviewHeader}>
                    <Text style={styles.modalReviewerName}>{review.name}</Text>
                    <View style={styles.modalReviewRating}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Text
                          key={star}
                          style={[
                            styles.modalStar,
                            {
                              color:
                                star <= review.rating
                                  ? "#FFD700"
                                  : "rgba(0,0,0,0.2)",
                            },
                          ]}
                        >
                          ★
                        </Text>
                      ))}
                    </View>
                    <Text style={styles.modalReviewDate}>{review.date}</Text>
                  </View>
                  {review.comment ? (
                    <Text style={styles.modalReviewComment}>
                      {review.comment}
                    </Text>
                  ) : null}
                  {onReportReview ? (
                    <TouchableOpacity
                      onPress={() => onReportReview(String(review.id))}
                      activeOpacity={0.6}
                      style={styles.modalReportBtn}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel={tr('discover.page.reportReviewA11y', { name: review.name || tr('discover.page.aClient') })}
                    >
                      <Text style={styles.modalReportText}>{tr('discover.page.report')}</Text>
                    </TouchableOpacity>
                  ) : null}
                </BlurView>
              )}
            />
          </SafeAreaView>
        </View>
        </WindowControlsInsetProvider>
        </SafeAreaProvider>
      </Modal>
    );
  },
);

ProviderReviewsModal.displayName = "ProviderReviewsModal";

const styles = StyleSheet.create({
  modalBackground: {
    flex: 1,
  },
  modalGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalSafeArea: {
    flex: 1,
  },
  modalHeader: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  modalHeaderContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  modalTitle: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 22,
    color: "#000",
    marginBottom: 4,
  },
  modalSubtitle: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "700",
    fontSize: 14,
    color: "rgba(0,0,0,0.85)",
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  modalCloseText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  modalContent: { ...readableDialog,
    flex: 1,
    paddingHorizontal: 20,
  },
  modalScrollContent: {
    paddingVertical: 20,
    paddingBottom: 40,
  },
  // elevation: 0 (Android only) — doubly at risk: a translucent
  // backgroundColor lets Android's elevation shadow bleed straight through
  // as a dark ring, AND overflow:'hidden' + borderRadius clips whatever
  // shadow remains to the rounded outline instead of letting it fade
  // outward. iOS keeps its shadow via shadow* above.
  modalReviewCard: {
    padding: 18,
    borderRadius: 20,
    marginBottom: 15,
    backgroundColor: "rgba(255,255,255,0.15)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 0,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  squareCard: {
    borderRadius: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  modalCardHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 30,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalReviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  modalReviewerName: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 14,
    color: "#000",
  },
  modalReviewRating: {
    flexDirection: "row",
    gap: 2,
  },
  modalStar: {
    fontSize: 14,
  },
  modalReviewDate: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "700",
    fontSize: 12,
    color: "rgba(0, 0, 0, 0.75)",
    marginLeft: "auto",
  },
  modalReviewComment: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "700",
    fontSize: 14,
    color: "#000",
    lineHeight: 20,
    marginTop: 12,
  },
  modalReportBtn: { alignSelf: "flex-start", marginTop: 10 },
  modalReportText: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 12,
    color: "rgba(0,0,0,0.5)",
    textDecorationLine: "underline",
  },
});
