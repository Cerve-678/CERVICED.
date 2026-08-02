import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";
import { useBookmarkStore } from "../stores/useBookmarkStore";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  StatusBar,
  FlatList,
  Dimensions,
  Alert,
  Animated,
  Share,
  Linking,
  Modal,
  TextInput,
  Platform,
  findNodeHandle,
  UIManager,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Vibration } from "react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { StackScreenProps } from "@react-navigation/stack";

// Correct icon imports - using your IconLibrary.tsx
import { Ionicons } from "@expo/vector-icons";
import Icon, {
  BookmarkIcon,
  ShareIcon,
  BellIcon,
} from "../components/IconLibrary";
import TabIcon from "../components/TabIcon";
import { useCart } from "../contexts/CartContext";

// Import storage from utils
import { storage, STORAGE_KEYS } from "../utils/storage";

// Navigation types
import { HomeStackParamList } from "../navigation/types";

// Theme imports
import { useTheme } from "../contexts/ThemeContext";
import { ThemedBackground } from "../components/ThemedBackground";
import CategoryTabItem from "../components/CategoryTabPill";
import {
  getProviderBySlug,
  getProviderReviews,
  addBookmark as dbAddBookmark,
  removeBookmark as dbRemoveBookmark,
  trackUserInteraction,
  getProviderActivePromotions,
  getProviderPortfolio,
  getUserDisplayName,
  getProviderDepositPoliciesByDisplayNames,
  getUserWaitlistEntries,
  joinWaitlist,
  leaveWaitlist,
  type WaitlistEntry,
  getProviderConsultationService,
  getProviderIdsWithBookingHistory,
  type ProviderConsultationService,
} from "../services/databaseService";
import userLearningService from "../services/userLearningService";
import { supabase } from "../lib/supabase";
import { AvailabilityService } from "../services/AvailabilityService";
import { BookingSheet, type BookingSheetResult } from "../components/BookingSheet";
import type {
  ProviderWithServices,
  DbPromotion,
  DbPortfolioItem,
} from "../types/database";
import {
  resolveProviderTheme,
  withAlpha,
  isDarkColor,
  type ProviderThemeTokens,
} from "../constants/providerThemes";
import { logger } from "../utils/logger";

type ProviderProfileScreenProps = StackScreenProps<
  HomeStackParamList,
  "ProviderProfile"
>;

// Static/demo services carry numeric ids — only a real UUID resolves to a
// services row and is safe to pass on for per-service buffer/duration lookups.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
const SIDE_PANEL_W = screenWidth * 0.85;

// Hero → content transition: the logo/name/rating/slots float directly over the photo;
// the content sheet starts right after them, rising over the photo with a rounded lip.
const SHEET_LIP_RADIUS = 36;

// Fallback icons using text symbols
const HeartIcon = ({ size, color }: { size: number; color: string }) => (
  <Text style={{ fontSize: size, color }}>♥</Text>
);

const StarIcon = ({ size, color }: { size: number; color: string }) => (
  <Text style={{ fontSize: size, color }}>★</Text>
);

// Provider interface
interface ProviderData {
  id: string;
  displayName: string;
  providerName: string;
  providerService: string;
  providerLogo: any;
  location: string;
  rating: number;
  slotsText: string;
  aboutText: string;
  categories: Record<string, ServiceData[]>;
  /** Shown under the category tab once selected — keyed the same as
   *  `categories`, missing/empty for categories without one. */
  categoryDescriptions: Record<string, string>;
  gradient: [string, string, ...string[]];
  hasCustomGradient: boolean;
  accentColor: string | null;
  backgroundImage: string | null;
  profileTheme: string; // preset key from providerThemes.ts — 'app' follows viewer's theme
  phone: string;
  email: string;
  instagram: string;
  website: string;
  /** When set, "Book" sends the client here instead of Cerviced's in-app
   *  booking flow (Fresha, Treatwell, Acuity, etc.). */
  externalBookingUrl: string | null;
  yearsExperience: string;
  specialties: string[];
  customServiceType: string;
  whatsapp: string;
  isVerified: boolean;
  preferredContactMethods: string[];
  onlineConsultationsAvailable: boolean;
  consultationRequiredNewClients: boolean;
  bookingPolicies: {
    cancelNotice?: string;
    cancelPenalty?: string;
    cancelNote?: string;
    rescheduleNotice?: string;
    maxReschedules?: string;
    depositRequired?: boolean;
    /** Client must pay the deposit — no "pay in full" choice at booking. */
    depositOnly?: boolean;
    depositType?: string;
    depositAmount?: string;
    noShowAction?: string;
    /** Optional photo of a fuller policy document — a house-rules sheet, a
     *  consent form, etc. — shown via the "View policy details" pop-up. */
    policyImageUrl?: string;
  } | null;
  /** Enforced at cancellation (providers.cancellation_notice_hours) — takes
   *  precedence over the descriptive bookingPolicies.cancelNotice text. */
  cancellationNoticeHours: number;
  /** Provider's Automations toggle — hides the join-waitlist button when off. */
  waitlistEnabled: boolean;
}

interface AddOnData {
  id: string | number;
  name: string;
  price: number;
  description: string;
}

interface ServiceData {
  id: number;
  dbId: string;
  name: string;
  price: number;
  duration: string;
  description: string;
  image: any;
  images?: any[]; // Optional array for carousel
  addOns?: AddOnData[]; // Optional per-service add-ons
  // Treatment safety — captured by the provider, shown to the client right
  // under the description so they see it before booking.
  isPregnancySafe?: boolean;
  patchTestRequired?: boolean;
  minAge?: number | null;
  contraindications?: string[];
  aftercareNotes?: string;
  serviceType?: string | null;
}

// ─── Duration formatter ────────────────────────────────────────────────────
function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h} hour${h > 1 ? "s" : ""}`;
}

// ─── Policy helpers ─────────────────────────────────────────────────────────
/** True when the provider has anything worth showing on the Policy tab —
 *  either descriptive booking_policies or the enforced cancellation window. */
function hasPolicyInfo(provider: ProviderData): boolean {
  const bp = provider.bookingPolicies;
  return (
    provider.cancellationNoticeHours > 0 ||
    (!!bp &&
      ((!!bp.depositRequired && !!bp.depositAmount) ||
        (!!bp.cancelNotice && bp.cancelNotice !== "none") ||
        !!(bp.rescheduleNotice || bp.maxReschedules) ||
        (!!bp.noShowAction && bp.noShowAction !== "none")))
  );
}

// ─── Map Supabase ProviderWithServices → local ProviderData ─────────────────
function mapDbProviderToProviderData(p: ProviderWithServices): ProviderData {
  const categories: Record<string, ServiceData[]> = {};
  const categoryDescriptions: Record<string, string> = {};
  p.services.forEach((s, idx) => {
    const key = s.category_name;
    if (!categories[key]) categories[key] = [];
    if (s.category_description && !categoryDescriptions[key]) {
      categoryDescriptions[key] = s.category_description;
    }
    categories[key].push({
      id: idx,
      dbId: s.id,
      name: s.name,
      price: Number(s.price),
      duration: formatDuration(s.duration_minutes),
      description: s.description ?? "",
      image: null,
      images: s.images
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((img) => ({ uri: img.url })),
      addOns: s.add_ons
        .filter((a) => a.is_active)
        .map((a) => ({
          id: a.id,
          name: a.name,
          price: Number(a.price),
          description: a.description ?? "",
        })),
      isPregnancySafe: s.is_pregnancy_safe,
      patchTestRequired: s.patch_test_required,
      minAge: s.min_age,
      contraindications: s.contraindications ?? [],
      aftercareNotes: s.aftercare_notes ?? "",
      serviceType: s.service_type ?? null,
    });
  });

  return {
    id: p.slug,
    displayName: p.display_name,
    providerName: p.display_name.toUpperCase(),
    providerService: p.service_category,
    providerLogo: p.logo_url ? { uri: p.logo_url } : null,
    location: p.location_text ?? "",
    rating: Number(p.rating),
    slotsText: p.slots_text ?? "",
    aboutText: p.about_text ?? "",
    gradient: (p.gradient && p.gradient.length >= 2
      ? p.gradient
      : ["#AF9197", "#C4A8AD"]) as [string, string, ...string[]],
    hasCustomGradient: !!(p.gradient && p.gradient.length >= 2),
    accentColor: p.accent_color ?? null,
    backgroundImage: p.background_image_url ?? null,
    profileTheme: p.profile_theme ?? "app",
    categories,
    categoryDescriptions,
    phone: p.phone ?? "",
    email: p.email ?? "",
    instagram: p.instagram ?? "",
    website: p.website ?? "",
    externalBookingUrl: p.external_booking_url ?? null,
    yearsExperience: p.years_experience ? String(p.years_experience) : "",
    specialties: p.specialties?.map((s) => s.specialty) ?? [],
    customServiceType: p.custom_service_type ?? "",
    whatsapp: p.whatsapp_number ?? "",
    isVerified: p.is_verified ?? false,
    preferredContactMethods: p.preferred_contact_methods ?? [],
    onlineConsultationsAvailable: p.online_consultations_available ?? false,
    consultationRequiredNewClients: p.consultation_required_new_clients ?? false,
    bookingPolicies: p.booking_policies ?? null,
    cancellationNoticeHours: p.cancellation_notice_hours ?? 0,
    // Absent setting = waitlist stays available (pre-toggle behaviour)
    waitlistEnabled: p.automation_settings?.waitlistEnabled !== false,
  };
}

// Get adaptive accent color based on gradient - Enhanced for better contrast - Memoized
const getAdaptiveAccentColor = (
  gradient: [string, string, ...string[]],
): string => {
  // Extract the dominant color from gradient and ensure visibility
  const primaryColor = gradient[0];

  // Enhanced visibility mapping for different gradients with better contrast
  const colorMap: Record<string, string> = {
    "#FF6B6B": "#C2185B", // Deeper pink for red gradients
    "#FF4500": "#7B1FA2", // Purple for orange gradients
    "#FF69B4": "#6A1B9A", // Deep purple for pink gradients
    "#E6E6FA": "#4A148C", // Deep purple for lavender gradients
    "#708090": "#3F51B5", // Indigo for gray gradients
    "#99FFCC": "#00838F", // Dark cyan for mint gradients
    "#1B4332": "#E91E63", // Pink for Kiki's dark green (better contrast)
    "#FFE4B5": "#E65100", // Dark orange for beige gradients
    "#D4A574": "#8D4E85", // Deep mauve for Her Brows brown-pink gradients
  };

  return colorMap[primaryColor] || "#7B1FA2"; // Default deep purple
};

// Service Image Carousel Component
interface ServiceImageCarouselProps {
  images: any[];
  size?: number;
}

const ServiceImageCarousel: React.FC<ServiceImageCarouselProps> = React.memo(
  ({ images, size = 60 }) => {
    const [activeIndex, setActiveIndex] = useState(0);

    const handleScroll = useCallback(
      (event: any) => {
        const offsetX = event.nativeEvent.contentOffset.x;
        const index = Math.round(offsetX / size);
        setActiveIndex(index);
      },
      [size],
    );

    if (images.length <= 1) {
      // Single image, render normally
      return (
        <Image
          source={images[0]}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
        />
      );
    }

    return (
      <View style={{ width: size, alignItems: "center" }}>
        <FlatList
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          keyExtractor={(_item, index) => `img-${index}`}
          renderItem={({ item }) => (
            <Image
              source={item}
              style={{ width: size, height: size, borderRadius: size / 2 }}
              resizeMode="cover"
            />
          )}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            overflow: "hidden",
          }}
          nestedScrollEnabled={true}
        />
        {images.length > 1 && (
          <View style={{ flexDirection: "row", gap: 3, marginTop: 4 }}>
            {images.map((_: any, index: number) => (
              <View
                key={index}
                style={{
                  width: activeIndex === index ? 8 : 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor:
                    activeIndex === index
                      ? "rgba(0,0,0,0.7)"
                      : "rgba(0,0,0,0.25)",
                }}
              />
            ))}
          </View>
        )}
      </View>
    );
  },
);

// 60px circle pill for multi-image services — tap opens modal, swipe pages through images
const MultiImagePill: React.FC<{
  images: any[];
  onPress: (images: any[], index: number) => void;
  imageStyle: any;
  containerStyle: any;
}> = React.memo(({ images, onPress, imageStyle, containerStyle }) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const w = imageStyle.width ?? 60;

  return (
    <View style={{ alignItems: "center", marginRight: 15 }}>
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
              <Image source={img} style={imageStyle} resizeMode="cover" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      {images.length > 1 && (
        <View style={{ flexDirection: "row", gap: 3, marginTop: 5 }}>
          {images.map((_, i) => (
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

// Full-width image carousel for services with multiple images
const MultiImageCarousel: React.FC<{ images: any[] }> = React.memo(
  ({ images }) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const [cardWidth, setCardWidth] = useState(screenWidth - 80);

    return (
      <View
        onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)}
        style={{
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          overflow: "hidden",
        }}
      >
        <FlatList
          data={images}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onMomentumScrollEnd={(e) => {
            if (cardWidth > 0) {
              setActiveIndex(
                Math.round(e.nativeEvent.contentOffset.x / cardWidth),
              );
            }
          }}
          keyExtractor={(_, i) => `mc-${i}`}
          renderItem={({ item }) => (
            <Image
              source={item}
              style={{ width: cardWidth, height: 180 }}
              resizeMode="cover"
            />
          )}
          style={{ height: 180 }}
          nestedScrollEnabled
        />
        {images.length > 1 && (
          <View
            style={{
              position: "absolute",
              bottom: 10,
              left: 0,
              right: 0,
              flexDirection: "row",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {images.map((_, i) => (
              <View
                key={i}
                style={{
                  width: activeIndex === i ? 18 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor:
                    activeIndex === i
                      ? "rgba(255,255,255,0.95)"
                      : "rgba(255,255,255,0.5)",
                }}
              />
            ))}
          </View>
        )}
      </View>
    );
  },
);

// Enhanced Action Button Component - Properly Typed
interface ActionButtonProps {
  onPress: () => void;
  style: any;
  textStyle: any;
  children: React.ReactNode;
  intensity?: number;
  isHighlighted?: boolean;
}

const ActionButton: React.FC<ActionButtonProps> = React.memo(
  ({
    onPress,
    style,
    textStyle,
    children,
    intensity = 10,
    isHighlighted = false,
  }) => {
    const pressAnimatedValue = useRef<Animated.Value>(
      new Animated.Value(1),
    ).current;
    const glowAnimatedValue = useRef<Animated.Value>(
      new Animated.Value(0),
    ).current;

    const handlePressIn = useCallback(() => {
      Animated.parallel([
        Animated.spring(pressAnimatedValue, {
          toValue: 0.92,
          useNativeDriver: true,
          tension: 300,
          friction: 10,
        }),
        Animated.timing(glowAnimatedValue, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }, [pressAnimatedValue, glowAnimatedValue]);

    const handlePressOut = useCallback(() => {
      Animated.parallel([
        Animated.spring(pressAnimatedValue, {
          toValue: 1,
          useNativeDriver: true,
          tension: 300,
          friction: 10,
        }),
        Animated.timing(glowAnimatedValue, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
      onPress();
    }, [pressAnimatedValue, glowAnimatedValue, onPress]);

    const glowStyle = useMemo(
      () => ({
        opacity: glowAnimatedValue,
        transform: [
          {
            scale: glowAnimatedValue.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1.05],
            }),
          },
        ],
      }),
      [glowAnimatedValue],
    );

    return (
      <TouchableOpacity
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        style={style}
      >
        <Animated.View style={{ transform: [{ scale: pressAnimatedValue }] }}>
          {/* Glow effect layer */}
          <Animated.View style={[StyleSheet.absoluteFill, glowStyle]}>
            <LinearGradient
              colors={[
                "rgba(255,255,255,0.6)",
                "rgba(255,255,255,0.2)",
                "transparent",
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[StyleSheet.absoluteFill, { borderRadius: 18 }]}
            />
          </Animated.View>

          <BlurView
            intensity={intensity}
            tint="light"
            style={styles.actionButtonBlur}
          >
            {/* Reflective highlight */}
            <LinearGradient
              colors={[
                "rgba(255,255,255,0.4)",
                "rgba(255,255,255,0.1)",
                "transparent",
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.buttonReflection}
            />
            <Text style={textStyle}>{children}</Text>
          </BlurView>
        </Animated.View>
      </TouchableOpacity>
    );
  },
);

// Success Message Component
interface SuccessMessageProps {
  isVisible: boolean;
  title: string;
  message: string;
  type: "cart" | "checkout";
  onClose: () => void;
  onViewCart?: (() => void) | undefined;
  animation: Animated.Value;
  adaptiveAccentColor: string;
}
const SuccessMessage: React.FC<SuccessMessageProps> = React.memo(
  ({
    isVisible,
    title,
    message,
    type,
    onClose,
    onViewCart,
    animation,
    adaptiveAccentColor,
  }) => {
    if (!isVisible) return null;

    const scaleStyle = useMemo(
      () => ({
        transform: [
          {
            scale: animation.interpolate({
              inputRange: [0, 1],
              outputRange: [0.8, 1],
            }),
          },
        ],
        opacity: animation,
      }),
      [animation],
    );

    return (
      <View style={styles.successOverlay}>
        <Animated.View style={[styles.successContainer, scaleStyle]}>
          <BlurView intensity={40} tint="light" style={styles.successBlur}>
            <LinearGradient
              colors={["rgba(255,255,255,0.9)", "rgba(255,255,255,0.7)"]}
              style={styles.successGradient}
            />

            {/* Success Icon */}
            <View
              style={[
                styles.successIcon,
                { backgroundColor: adaptiveAccentColor },
              ]}
            >
              <Text style={styles.successIconText}>✓</Text>
            </View>

            {/* Success Content */}
            <Text style={styles.successTitle}>{title}</Text>
            <Text style={styles.successMessage}>{message}</Text>

            {/* Action Buttons */}
            <View style={styles.successButtons}>
              <TouchableOpacity
                style={styles.successCloseButton}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Text style={styles.successCloseText}>Continue Shopping</Text>
              </TouchableOpacity>

              {type === "cart" && onViewCart && (
                <TouchableOpacity
                  style={[
                    styles.successViewCartButton,
                    { backgroundColor: adaptiveAccentColor },
                  ]}
                  onPress={onViewCart}
                  activeOpacity={0.8}
                >
                  <Text style={styles.successViewCartText}>View Cart</Text>
                </TouchableOpacity>
              )}
            </View>
          </BlurView>
        </Animated.View>
      </View>
    );
  },
);
// Reviews Modal Component
interface ReviewsModalProps {
  isVisible: boolean;
  onClose: () => void;
  reviews: Array<{
    id: number | string;
    name: string;
    rating: number;
    comment: string;
    date: string;
  }>;
  providerName: string;
  adaptiveAccentColor: string;
  providerGradient: [string, string, ...string[]];
}

const ReviewsModal: React.FC<ReviewsModalProps> = React.memo(
  ({
    isVisible,
    onClose,
    reviews,
    providerName,
    adaptiveAccentColor,
    providerGradient,
  }) => {
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
                  <Text style={styles.modalTitle}>All Reviews</Text>
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

            {/* Reviews List */}
            <ScrollView
              style={styles.modalContent}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
            >
              {allReviews.map((review) => (
                <BlurView
                  key={review.id}
                  intensity={20}
                  tint="light"
                  style={styles.modalReviewCard}
                >
                  <LinearGradient
                    colors={["rgba(255,255,255,0.4)", "transparent"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={styles.modalCardHighlight}
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
                </BlurView>
              ))}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    );
  },
);

// Notification Alert Component
interface NotificationAlertProps {
  isVisible: boolean;
  message: string;
  onHide: () => void;
  slideAnimation: Animated.Value;
  isNotificationsEnabled: boolean; // Add this prop
}

const NotificationAlert: React.FC<NotificationAlertProps> = React.memo(
  ({ isVisible, message, onHide, slideAnimation, isNotificationsEnabled }) => {
    if (!isVisible) return null;

    const slideStyle = useMemo(
      () => ({
        transform: [
          {
            translateX: slideAnimation.interpolate({
              inputRange: [0, 100],
              outputRange: [0, screenWidth],
            }),
          },
        ],
      }),
      [slideAnimation],
    );

    // Dynamic colors based on notification state
    const notificationColors = useMemo(() => {
      if (isNotificationsEnabled) {
        return {
          gradient: ["rgba(76, 175, 80, 0.9)", "rgba(76, 175, 80, 0.7)"], // Green when enabled
          iconColor: "#fff",
          textColor: "#fff",
        };
      } else {
        return {
          gradient: ["rgba(128, 128, 128, 0.9)", "rgba(100, 100, 100, 0.7)"], // Gray when disabled
          iconColor: "#fff",
          textColor: "#fff",
        };
      }
    }, [isNotificationsEnabled]);

    return (
      <Animated.View style={[styles.notificationAlert, slideStyle]}>
        <BlurView intensity={20} tint="light" style={styles.notificationBlur}>
          <LinearGradient
            colors={notificationColors.gradient as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.notificationGradient}
          />
          <View style={styles.notificationContent}>
            <BellIcon size={16} color={notificationColors.iconColor} />
            <Text
              style={[
                styles.notificationText,
                { color: notificationColors.textColor },
              ]}
            >
              {message}
            </Text>
          </View>
        </BlurView>
      </Animated.View>
    );
  },
);

// Elegant serif for display names & section headings (matches the reference look)
const SERIF = "Prata-Regular";

// ── Offers Modal ─────────────────────────────────────────────────────────────
interface OffersSidePanelProps {
  isVisible: boolean;
  onClose: () => void;
  slideAnim: Animated.Value;
  promotions: DbPromotion[];
  providerName: string;
  adaptiveAccentColor: string;
  themeTokens: ProviderThemeTokens;
  onBookOffer: (promo: DbPromotion) => void;
}

const OffersSidePanel: React.FC<OffersSidePanelProps> = React.memo(
  ({
    isVisible,
    onClose,
    slideAnim,
    promotions,
    providerName,
    adaptiveAccentColor,
    themeTokens,
    onBookOffer,
  }) => {
    const OP = themeTokens;

    const [copiedCode, setCopiedCode] = useState<string | null>(null);

    const handleCopyCode = useCallback(async (code: string) => {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    }, []);

    const formatDate = (iso: string) =>
      new Date(iso).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });

    if (!isVisible) return null;

    return (
      <>
        {/* Scrim behind the panel */}
        <TouchableOpacity
          style={styles.sidePanelBackdrop}
          onPress={onClose}
          activeOpacity={1}
        />

        {/* Sliding panel from the right */}
        <Animated.View
          style={[
            styles.sidePanelContainer,
            { backgroundColor: OP.bg, transform: [{ translateX: slideAnim }] },
          ]}
        >
          <SafeAreaView style={{ flex: 1 }}>
            {/* Header */}
            <View
              style={[
                offersStyles.header,
                {
                  borderBottomColor: OP.sep,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                },
              ]}
            >
              <View>
                <Text style={[offersStyles.headerTitle, { color: OP.text }]}>
                  OFFERS
                </Text>
                <Text style={[offersStyles.headerSub, { color: OP.sub }]}>
                  {providerName} — {promotions.length} active{" "}
                  {promotions.length === 1 ? "offer" : "offers"}
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  offersStyles.closeButton,
                  {
                    backgroundColor: OP.surface,
                    borderColor: OP.border,
                    borderWidth: StyleSheet.hairlineWidth,
                  },
                ]}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={[offersStyles.closeText, { color: OP.sub }]}>
                  ✕
                </Text>
              </TouchableOpacity>
            </View>

            {/* List */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={offersStyles.listContent}
            >
              {promotions.length === 0 ? (
                <View
                  style={[
                    offersStyles.emptyCard,
                    {
                      backgroundColor: OP.card,
                      borderColor: OP.border,
                      borderWidth: StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  <Text style={[offersStyles.emptyText, { color: OP.sub }]}>
                    No active offers right now
                  </Text>
                </View>
              ) : (
                promotions.map((promo) => (
                  <View
                    key={promo.id}
                    style={[
                      offersStyles.offerCard,
                      {
                        backgroundColor: OP.card,
                        borderColor: OP.border,
                        borderWidth: StyleSheet.hairlineWidth,
                      },
                    ]}
                  >
                    {(promo.discount_text ||
                      promo.discount_percent ||
                      promo.discount_amount) && (
                      <View
                        style={[
                          offersStyles.discountBadge,
                          { backgroundColor: adaptiveAccentColor },
                        ]}
                      >
                        <Text style={offersStyles.discountText}>
                          {promo.discount_text ||
                            (promo.discount_percent
                              ? `${promo.discount_percent}% OFF`
                              : `£${promo.discount_amount} OFF`)}
                        </Text>
                      </View>
                    )}

                    <Text style={[offersStyles.offerTitle, { color: OP.text }]}>
                      {promo.title}
                    </Text>

                    {promo.description ? (
                      <Text
                        style={[
                          offersStyles.offerDescription,
                          { color: OP.sub },
                        ]}
                      >
                        {promo.description}
                      </Text>
                    ) : null}

                    {promo.service_category ? (
                      <View
                        style={[
                          offersStyles.categoryChip,
                          {
                            backgroundColor: OP.surface,
                            borderColor: OP.border,
                            borderWidth: StyleSheet.hairlineWidth,
                          },
                        ]}
                      >
                        <Text
                          style={[offersStyles.categoryText, { color: OP.sub }]}
                        >
                          {promo.service_category}
                        </Text>
                      </View>
                    ) : null}

                    <Text style={[offersStyles.validity, { color: OP.sub }]}>
                      Valid {formatDate(promo.valid_from)} –{" "}
                      {formatDate(promo.valid_until)}
                    </Text>

                    {promo.promo_code ? (
                      <TouchableOpacity
                        style={[
                          offersStyles.promoRow,
                          {
                            backgroundColor: OP.surface,
                            borderColor: OP.border,
                            borderWidth: StyleSheet.hairlineWidth,
                          },
                        ]}
                        onPress={() => handleCopyCode(promo.promo_code!)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[offersStyles.promoLabel, { color: OP.sub }]}
                        >
                          CODE
                        </Text>
                        <Text
                          style={[offersStyles.promoCode, { color: OP.text }]}
                        >
                          {promo.promo_code}
                        </Text>
                        <Text
                          style={[
                            offersStyles.promoCopy,
                            {
                              color:
                                copiedCode === promo.promo_code
                                  ? adaptiveAccentColor
                                  : OP.sub,
                            },
                          ]}
                        >
                          {copiedCode === promo.promo_code ? "COPIED" : "COPY"}
                        </Text>
                      </TouchableOpacity>
                    ) : null}

                    <TouchableOpacity
                      style={[
                        offersStyles.bookBtn,
                        { backgroundColor: adaptiveAccentColor },
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(
                          Haptics.ImpactFeedbackStyle.Medium,
                        ).catch(() => {});
                        onBookOffer(promo);
                      }}
                      activeOpacity={0.85}
                    >
                      <Text style={offersStyles.bookBtnText}>Book Now</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
      </>
    );
  },
);

const offersStyles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  headerTitle: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 2,
  },
  headerSub: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "600",
    fontSize: 12,
    opacity: 0.7,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    fontSize: 14,
    fontWeight: "600",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 10,
  },
  emptyCard: {
    borderRadius: 14,
    padding: 28,
    alignItems: "center",
  },
  emptyText: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "600",
    fontSize: 14,
    opacity: 0.6,
  },
  offerCard: {
    borderRadius: 14,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 4,
  },
  discountBadge: {
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  discountText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 11,
    color: "#fff",
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  offerTitle: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6,
  },
  offerDescription: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "600",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
    opacity: 0.7,
  },
  categoryChip: {
    alignSelf: "flex-start",
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  categoryText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 9,
    letterSpacing: 0.3,
    opacity: 0.7,
  },
  validity: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "600",
    fontSize: 11,
    marginBottom: 12,
    opacity: 0.5,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  promoRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  promoLabel: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    opacity: 0.5,
  },
  promoCode: {
    flex: 1,
    fontFamily: "BakbakOne-Regular",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 2,
  },
  promoCopy: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  bookBtn: {
    marginTop: 12,
    borderRadius: 22,
    paddingVertical: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  bookBtnText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 13,
    color: "#fff",
    letterSpacing: 0.5,
  },
});

// ── Provider Profile Skeleton ────────────────────────────────────────────────
function ProviderProfileSkeleton() {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);
  // Provider theme isn't known yet while loading — use the 'app' preset.
  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.65],
  });
  const skeletonTheme = resolveProviderTheme("app");
  const base = "#DDD5CC";
  const bg = skeletonTheme.bg;

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      {/* Header / logo area */}
      <Animated.View style={{ height: 220, backgroundColor: base, opacity }} />
      {/* Avatar circle overlapping header */}
      <View style={{ alignItems: "center", marginTop: -40 }}>
        <Animated.View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: base,
            opacity,
          }}
        />
      </View>
      {/* Name + service lines */}
      <View
        style={{
          alignItems: "center",
          marginTop: 14,
          gap: 10,
          paddingHorizontal: 40,
        }}
      >
        <Animated.View
          style={{
            width: "55%",
            height: 18,
            borderRadius: 9,
            backgroundColor: base,
            opacity,
          }}
        />
        <Animated.View
          style={{
            width: "35%",
            height: 13,
            borderRadius: 6,
            backgroundColor: base,
            opacity,
          }}
        />
      </View>
      {/* Stats row */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          gap: 24,
          marginTop: 20,
          paddingHorizontal: 24,
        }}
      >
        {[80, 80, 80].map((w, i) => (
          <Animated.View
            key={i}
            style={{
              width: w,
              height: 36,
              borderRadius: 10,
              backgroundColor: base,
              opacity,
            }}
          />
        ))}
      </View>
      {/* Tab row */}
      <View
        style={{
          flexDirection: "row",
          gap: 12,
          marginTop: 24,
          paddingHorizontal: 20,
        }}
      >
        {[80, 70, 90, 60].map((w, i) => (
          <Animated.View
            key={i}
            style={{
              width: w,
              height: 32,
              borderRadius: 16,
              backgroundColor: base,
              opacity,
            }}
          />
        ))}
      </View>
      {/* Service item rows */}
      <View style={{ paddingHorizontal: 20, marginTop: 20, gap: 14 }}>
        {[1, 2, 3].map((i) => (
          <View
            key={i}
            style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
          >
            <Animated.View
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: base,
                opacity,
              }}
            />
            <View style={{ flex: 1, gap: 8 }}>
              <Animated.View
                style={{
                  width: "60%",
                  height: 14,
                  borderRadius: 7,
                  backgroundColor: base,
                  opacity,
                }}
              />
              <Animated.View
                style={{
                  width: "40%",
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: base,
                  opacity,
                }}
              />
            </View>
            <Animated.View
              style={{
                width: 60,
                height: 28,
                borderRadius: 14,
                backgroundColor: base,
                opacity,
              }}
            />
          </View>
        ))}
      </View>
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

// Main Component
const ProviderProfileScreen: React.FC<ProviderProfileScreenProps> = ({
  navigation,
  route,
}) => {
  const { theme } = useTheme();

  const providerId = route.params?.providerId ?? "";
  // Provider state — seeded with local hardcoded data, overridden by Supabase if available
  const [provider, setProvider] = useState<ProviderData | null>(null);
  const [loading, setLoading] = useState(true);
  // Only populated when this provider requires a consultation for new
  // clients and the current client has no booking history with them —
  // passed into BookingSheet so it can schedule the consultation alongside
  // whatever real service the client is booking, in the same sheet.
  const [requiredConsultationService, setRequiredConsultationService] = useState<ProviderConsultationService | null>(null);
  const [providerDbId, setProviderDbId] = useState<string | null>(null);

  // Palette follows the provider's chosen profile theme (preset key or custom set).
  // Until the provider loads this resolves to the 'app' preset.
  const OP = resolveProviderTheme(provider?.profileTheme);

  const [reviews, setReviews] = useState<
    {
      id: number | string;
      name: string;
      rating: number;
      comment: string;
      date: string;
    }[]
  >([]);

  // Fetch live data from Supabase
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getProviderBySlug(providerId)
      .then(async (data) => {
        if (cancelled || !data) return;
        setProvider(mapDbProviderToProviderData(data));
        setProviderDbId(data.id);

        // Track profile view for personalization + analytics
        userLearningService.trackInteraction({
          type: "view",
          providerId: data.id,
          providerName: data.display_name,
          serviceCategory: data.service_category,
          timestamp: new Date().toISOString(),
        });
        trackUserInteraction({
          type: "view",
          providerId: data.id,
          serviceCategory: data.service_category,
        });

        // Reviews, promotions, and portfolio don't depend on each other —
        // fetch them in parallel instead of one after another so the
        // screen's loading state clears after the slowest single request
        // rather than the sum of all three.
        const [reviewsResult, promosResult, portfolioResult] = await Promise.allSettled([
          getProviderReviews(data.id),
          getProviderActivePromotions(data.id),
          getProviderPortfolio(data.id),
        ]);

        if (!cancelled && reviewsResult.status === "fulfilled") {
          setReviews(
            reviewsResult.value.map((r) => ({
              id: r.id,
              name: r.user?.name ?? "Anonymous",
              rating: r.rating,
              comment: r.comment ?? "",
              date: new Date(r.created_at).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              }),
            })),
          );
        }

        if (!cancelled && promosResult.status === "fulfilled") {
          setPromotions(promosResult.value);
        }

        if (!cancelled && portfolioResult.status === "fulfilled") {
          setPortfolio(portfolioResult.value);
        }
      })
      .catch(() => {
        /* provider not found — loading=false, provider remains null */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [providerId]);

  // ===== CRITICAL: CART CONTEXT INTEGRATION =====
  const { addToCart, totalItems } = useCart();

  const [selectedCategory, setSelectedCategory] = useState(() =>
    provider ? Object.keys(provider.categories)[0] || "" : "",
  );

  // Long service lists (20+ in one category) used to just keep un-collapsing
  // in place, making the whole profile page one continuous scroll. "Show all"
  // now opens a dedicated fullscreen sheet instead — the inline list always
  // stays capped.
  const SERVICES_COLLAPSED_LIMIT = 6;
  const [showAllServicesModal, setShowAllServicesModal] = useState(false);

  // When Supabase data loads and updates provider, reset to first available category
  useEffect(() => {
    if (!provider) return;
    const firstCat = Object.keys(provider.categories)[0] || "";
    setSelectedCategory((prev) =>
      prev && provider.categories[prev] ? prev : firstCat,
    );
  }, [provider]);
  // Ref, not state — scrolling must NOT re-render this large screen (that full
  // re-render on the first scroll hung the UI thread). The header reacts to it
  // imperatively via setOptions in handleScroll.
  const isScrolledRef = useRef(false);
  const [showFullAbout, setShowFullAbout] = useState(false);
  const [infoTab, setInfoTab] = useState<"about" | "policy">("about");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string>("");
  const [userWaitlistMap, setUserWaitlistMap] = useState<
    Record<string, WaitlistEntry>
  >({});
  // service.dbId -> "has a bookable slot in the next 14 days". The Waitlist
  // button only makes sense once we've confirmed there's genuinely nothing
  // to book soon — absent from this map means "still checking", not "full".
  const [serviceNearTermAvailability, setServiceNearTermAvailability] =
    useState<Record<string, boolean>>({});
  // service.dbId -> "has a bookable slot anywhere in the provider's whole
  // booking window" (not just the next 14 days). This is the only check
  // strict enough to disable Book itself — a service with nothing in the
  // next 14 days can still have real openings further out, which the 14-day
  // map above deliberately doesn't distinguish (it only gates the Waitlist
  // affordance, where "nothing soon" is the right question to ask).
  const [serviceFullyBooked, setServiceFullyBooked] =
    useState<Record<string, boolean>>({});
  const [waitlistModal, setWaitlistModal] = useState<{
    visible: boolean;
    service: ServiceData | null;
  }>({ visible: false, service: null });
  const [waitlistNotes, setWaitlistNotes] = useState("");
  const [waitlistJoining, setWaitlistJoining] = useState(false);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);
  const [leaveConfirmEntry, setLeaveConfirmEntry] =
    useState<WaitlistEntry | null>(null);
  const [waitlistDateMode, setWaitlistDateMode] = useState<"anytime" | "range">(
    "anytime",
  );
  const [waitlistDateFrom, setWaitlistDateFrom] = useState<Date | null>(null);
  const [waitlistDateTo, setWaitlistDateTo] = useState<Date | null>(null);
  const [showDatePickerFrom, setShowDatePickerFrom] = useState(false);
  const [showDatePickerTo, setShowDatePickerTo] = useState(false);
  const [isNotificationsEnabled, setIsNotificationsEnabled] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [showReviewsModal, setShowReviewsModal] = useState(false);
  const [showBookingSheet, setShowBookingSheet] = useState(false);
  const [showOffersModal, setShowOffersModal] = useState(false);
  const [promotions, setPromotions] = useState<DbPromotion[]>([]);
  const [portfolio, setPortfolio] = useState<DbPortfolioItem[]>([]);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [successMessageData, setSuccessMessageData] = useState<{
    title: string;
    message: string;
    type: "cart" | "checkout";
  } | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceData | null>(
    null,
  );
  const [notificationMessageType, setNotificationMessageType] = useState<
    "bell" | "bookmark"
  >("bell");

  // Scroll plumbing for the offers "Book Now" jump-to-services behaviour
  const scrollRef = useRef<ScrollView>(null);
  const servicesSectionRef = useRef<View>(null);

  // Animation references - properly typed and persistent
  const slideRightAnimation = useRef<Animated.Value>(
    new Animated.Value(100),
  ).current;
  const successAnimation = useRef<Animated.Value>(
    new Animated.Value(0),
  ).current;
  const offersTabSlide = useRef<Animated.Value>(new Animated.Value(80)).current;
  const offersPanelSlide = useRef<Animated.Value>(
    new Animated.Value(SIDE_PANEL_W),
  ).current;

  // Prefer DB-stored accent_color, fall back to gradient-derived, then app default
  const adaptiveAccentColor = useMemo(
    () =>
      provider?.accentColor ??
      (provider?.hasCustomGradient
        ? getAdaptiveAccentColor(provider.gradient)
        : OP.accent),
    [
      provider?.accentColor,
      provider?.gradient,
      provider?.hasCustomGradient,
      OP.accent,
    ],
  );

  // Card overlay tint sits on top of a BlurView for a frosted-glass look instead of a flat
  // opaque fill — derived from the provider theme's card colour so every preset matches.
  const cardBg = withAlpha(OP.card, OP.isDark ? 0.5 : 0.9);
  const cardBlurTint = OP.isDark ? ("dark" as const) : ("light" as const);
  const cardBlurIntensity = OP.isDark ? 35 : 25;
  const cardHighlightColors = (
    OP.isDark
      ? ["rgba(255,255,255,0.08)", "transparent"]
      : ["rgba(255,255,255,0.3)", "transparent"]
  ) as [string, string];

  // ── Pinterest-style two-column portfolio ────────────────────────────────────
  // Items are dealt into whichever column is currently shorter, with tile height
  // from the item's aspect ratio, giving the staggered masonry look.
  const PORTFOLIO_COL_W = (screenWidth - 40 - 12) / 2;
  const portfolioColumns = useMemo(() => {
    const cols: Array<
      Array<DbPortfolioItem & { tileHeight: number; globalIndex: number }>
    > = [[], []];
    const colHeights = [0, 0];
    portfolio.forEach((item, i) => {
      const ratio =
        item.aspect_ratio && item.aspect_ratio > 0 ? item.aspect_ratio : 1;
      const tileHeight = Math.min(Math.max(PORTFOLIO_COL_W / ratio, 140), 300);
      const target = colHeights[0]! <= colHeights[1]! ? 0 : 1;
      cols[target]!.push({ ...item, tileHeight, globalIndex: i });
      colHeights[target]! += tileHeight + 12;
    });
    return cols;
  }, [portfolio, PORTFOLIO_COL_W]);

  const portfolioImages = useMemo(
    () => portfolio.map((item) => ({ uri: item.image_url })),
    [portfolio],
  );

  // Hero info floats over the photo/gradient. Every theme always carries a
  // gradient now (saved as [backdrop, sheetColor]), so "is there a gradient"
  // can't decide text colour any more — some backdrops (Cream, Sky, Blush…)
  // are pale, and white text on them is close to invisible. Decide from the
  // actual rendered colour's brightness instead; a photo always gets the
  // dark-overlay treatment so white text is safe there.
  const heroBgColor = provider?.hasCustomGradient
    ? provider?.gradient[0]
    : OP.hero;
  const heroIsDark =
    !!provider?.backgroundImage ||
    (heroBgColor ? isDarkColor(heroBgColor) : true);
  const heroText = heroIsDark ? "#FFFFFF" : "#26201E";
  const heroSub = heroIsDark ? "rgba(255,255,255,0.96)" : "rgba(38,32,30,0.78)";

  // Slide in the offers tab from the right when promotions are available
  useEffect(() => {
    if (promotions.length > 0) {
      Animated.spring(offersTabSlide, {
        toValue: 0,
        useNativeDriver: true,
        tension: 60,
        friction: 10,
        delay: 600,
      }).start();
    } else {
      offersTabSlide.setValue(80);
    }
  }, [promotions.length, offersTabSlide]);

  // Load auth user + their waitlist entries for this provider
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setCurrentUserId(user.id);
      // Try to get display name from users table
      getUserDisplayName(user.id)
        .then((name) => {
          if (name) setCurrentUserName(name);
        })
        .catch(() => {});
    });
  }, []);

  useEffect(() => {
    if (!currentUserId || !providerDbId) return;
    getUserWaitlistEntries(currentUserId)
      .then((entries) => {
        const map: Record<string, WaitlistEntry> = {};
        entries
          .filter((e) => e.provider_id === providerDbId)
          .forEach((e) => {
            map[e.service_id ?? "__any__"] = e;
          });
        setUserWaitlistMap(map);
      })
      .catch(() => {});
  }, [currentUserId, providerDbId]);

  // Check near-term availability per service so the Waitlist button (or,
  // when waitlists are off, the plain "no openings" note) only shows once a
  // service is confirmed to have nothing bookable soon — otherwise it
  // decorated every service unconditionally. Runs regardless of the
  // waitlist toggle since the fully-booked note doesn't depend on it.
  //
  // Fired alongside a second, much wider check (the provider's whole
  // booking window, clamped internally by hasNearTermAvailabilityForServices
  // to whatever booking_window_days actually is) — that's the only one
  // strict enough to disable Book itself, since "nothing in 14 days" is not
  // the same claim as "nothing ever."
  useEffect(() => {
    if (!provider || !providerDbId) return;
    const allServices = Object.values(provider.categories).flat();
    if (allServices.length === 0) return;
    let cancelled = false;
    const serviceRequests = allServices
      .filter((service) => !!service.dbId)
      .map((service) => ({ serviceId: service.dbId as string, duration: service.duration }));
    if (serviceRequests.length === 0) return;

    const FULL_BOOKING_HORIZON_DAYS = 180;
    Promise.all([
      AvailabilityService.hasNearTermAvailabilityForServices(providerDbId, serviceRequests),
      AvailabilityService.hasNearTermAvailabilityForServices(providerDbId, serviceRequests, FULL_BOOKING_HORIZON_DAYS),
    ])
      .then(([nearTermById, fullWindowById]) => {
        if (cancelled) return;
        setServiceNearTermAvailability((prev) => ({
          ...prev,
          ...Object.fromEntries(nearTermById),
        }));
        setServiceFullyBooked((prev) => ({
          ...prev,
          ...Object.fromEntries(
            Array.from(fullWindowById.entries()).map(([id, hasAvailability]) => [id, !hasAvailability])
          ),
        }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [provider, providerDbId]);

  // If this provider requires a consultation before a new client's first
  // booking, and this client has no booking history with them, fetch the
  // consultation service so handleBook can pass it into BookingSheet.
  useEffect(() => {
    if (!provider?.consultationRequiredNewClients || !providerDbId) {
      setRequiredConsultationService(null);
      return;
    }
    let cancelled = false;
    Promise.all([
      getProviderConsultationService(providerDbId),
      getProviderIdsWithBookingHistory([providerDbId]),
    ])
      .then(([service, historyIds]) => {
        if (cancelled) return;
        setRequiredConsultationService(historyIds.has(providerDbId) ? null : service);
      })
      .catch(() => {
        if (!cancelled) setRequiredConsultationService(null);
      });
    return () => {
      cancelled = true;
    };
  }, [provider?.consultationRequiredNewClients, providerDbId]);

  const openOffersPanel = useCallback(() => {
    setShowOffersModal(true);
    Animated.spring(offersPanelSlide, {
      toValue: 0,
      useNativeDriver: true,
      tension: 55,
      friction: 11,
    }).start();
  }, [offersPanelSlide]);

  const closeOffersPanel = useCallback(() => {
    Animated.spring(offersPanelSlide, {
      toValue: SIDE_PANEL_W,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start(() => setShowOffersModal(false));
  }, [offersPanelSlide]);

  // Show notification popup from right
  const showRightNotification = useCallback(() => {
    setShowNotification(true);
    // Reset animation - start from right edge
    slideRightAnimation.setValue(100);

    // Animate notification slide in from right
    Animated.sequence([
      Animated.spring(slideRightAnimation, {
        toValue: 0,
        useNativeDriver: true,
        tension: 120,
        friction: 8,
      }),
      Animated.delay(2500),
      Animated.timing(slideRightAnimation, {
        toValue: 100,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowNotification(false);
    });
  }, [slideRightAnimation]);

  // Notification toggle handler
  const handleNotificationToggle = useCallback(() => {
    logger.warn("Bell button pressed");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newState = !isNotificationsEnabled;
    setIsNotificationsEnabled(newState);
    setNotificationMessageType("bell"); // SET TO BELL
    showRightNotification();
  }, [isNotificationsEnabled, showRightNotification]);

  // Bookmark toggle handler
  const {
    isBookmarked: isBookmarkedFn,
    addBookmark,
    removeBookmark,
  } = useBookmarkStore();
  const [isBookmarkLoading, setIsBookmarkLoading] = useState(false);
  const [expandedServices, setExpandedServices] = useState<
    Set<string | number>
  >(new Set());
  const [serviceImageModal, setServiceImageModal] = useState<{
    visible: boolean;
    images: any[];
    currentIndex: number;
    key: number;
  }>({ visible: false, images: [], currentIndex: 0, key: 0 });

  // The fullscreen viewer's FlatList uses `initialScrollIndex`, which React
  // Native only honours on a component's first mount — since this Modal's
  // contents stay mounted across opens, reopening with a different index
  // (e.g. tapping a different portfolio photo) would silently keep showing
  // wherever the list last scrolled to. Bumping `key` on every open forces a
  // fresh FlatList each time so it lands on the right image.
  const openImageViewer = useCallback((images: any[], currentIndex: number) => {
    setServiceImageModal((prev) => ({
      visible: true,
      images,
      currentIndex,
      key: prev.key + 1,
    }));
  }, []);
  const closeImageViewer = useCallback(() => {
    setServiceImageModal((prev) => ({
      visible: false,
      images: [],
      currentIndex: 0,
      key: prev.key,
    }));
  }, []);

  // Get real-time bookmark status from store
  const providerIsBookmarked = isBookmarkedFn(providerDbId ?? providerId);

  const handleBookmarkToggle = useCallback(async () => {
    if (isBookmarkLoading) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsBookmarkLoading(true);

    try {
      if (providerIsBookmarked) {
        await removeBookmark(providerDbId ?? providerId);
        logger.log("Bookmark removed:", providerId);
        setNotificationMessageType("bookmark"); // BOOKMARK MESSAGE TYPE

        // Show slide-in message
        setShowNotification(true);
        slideRightAnimation.setValue(100);

        Animated.sequence([
          Animated.spring(slideRightAnimation, {
            toValue: 0,
            useNativeDriver: true,
            tension: 120,
            friction: 8,
          }),
          Animated.delay(2000),
          Animated.timing(slideRightAnimation, {
            toValue: 100,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setShowNotification(false);
        });
      } else {
        await addBookmark(providerDbId ?? providerId);
        logger.log("Provider bookmarked:", providerId);
        setNotificationMessageType("bookmark"); // BOOKMARK MESSAGE TYPE

        // Show slide-in message
        setShowNotification(true);
        slideRightAnimation.setValue(100);

        Animated.sequence([
          Animated.spring(slideRightAnimation, {
            toValue: 0,
            useNativeDriver: true,
            tension: 120,
            friction: 8,
          }),
          Animated.delay(2000),
          Animated.timing(slideRightAnimation, {
            toValue: 100,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setShowNotification(false);
        });
      }
    } catch (error) {
      logger.error("Bookmark toggle failed:", error);
      Alert.alert("Error", "Failed to update bookmark");
    } finally {
      setIsBookmarkLoading(false);
    }
  }, [
    providerIsBookmarked,
    isBookmarkLoading,
    providerId,
    providerDbId,
    addBookmark,
    removeBookmark,
    slideRightAnimation,
  ]);

  // Share handler with native share options
  const handleShare = useCallback(async () => {
    if (!provider) return;
    try {
      const shareOptions = {
        message: `Check out @${provider.providerName} - ${provider.providerService} services in ${provider.location}. Rated ${provider.rating}/5 stars!`,
        title: `${provider.providerName} - ${provider.providerService}`,
        url: `https://app.yourapp.com/provider/${provider.id}`, // Replace with your app URL
      };

      const result = await Share.share(shareOptions);

      if (result.action === Share.sharedAction) {
        if (result.activityType) {
          logger.log("Shared via:", result.activityType);
        } else {
          logger.log("Shared successfully");
        }
      } else if (result.action === Share.dismissedAction) {
        logger.log("Share dismissed");
      }
    } catch (error) {
      logger.error("Error sharing:", error);
      Alert.alert("Error", "Unable to share at this time.");
    }
  }, [provider]);

  const closeWaitlistModal = useCallback(() => {
    setWaitlistModal({ visible: false, service: null });
    setWaitlistNotes("");
    setWaitlistDateMode("anytime");
    setWaitlistDateFrom(null);
    setWaitlistDateTo(null);
    setShowDatePickerFrom(false);
    setShowDatePickerTo(false);
    setWaitlistError(null);
  }, []);

  const handleOpenDatePicker = useCallback(
    (which: "from" | "to") => {
      if (Platform.OS === "android") {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const {
          DateTimePickerAndroid,
        } = require("@react-native-community/datetimepicker");
        DateTimePickerAndroid.open({
          value:
            (which === "from" ? waitlistDateFrom : waitlistDateTo) ??
            new Date(),
          mode: "date",
          minimumDate:
            which === "to" ? (waitlistDateFrom ?? new Date()) : new Date(),
          onChange: (_: unknown, date?: Date) => {
            if (date) {
              if (which === "from") setWaitlistDateFrom(date);
              else setWaitlistDateTo(date);
            }
          },
        });
      } else {
        const alreadyOpen = showDatePickerFrom || showDatePickerTo;
        setShowDatePickerFrom(false);
        setShowDatePickerTo(false);
        if (alreadyOpen) {
          setTimeout(() => {
            if (which === "from") setShowDatePickerFrom(true);
            else setShowDatePickerTo(true);
          }, 200);
        } else {
          if (which === "from") setShowDatePickerFrom(true);
          else setShowDatePickerTo(true);
        }
      }
    },
    [waitlistDateFrom, waitlistDateTo, showDatePickerFrom, showDatePickerTo],
  );

  const handleJoinWaitlist = useCallback(async () => {
    if (!provider || !providerDbId || !currentUserId || !waitlistModal.service)
      return;
    setWaitlistJoining(true);
    try {
      let preferredDates: string[] | undefined;
      if (waitlistDateMode === "range" && waitlistDateFrom) {
        const fromStr = waitlistDateFrom.toISOString().split("T")[0]!;
        preferredDates = waitlistDateTo
          ? [fromStr, waitlistDateTo.toISOString().split("T")[0]!]
          : [fromStr];
      }
      const entry = await joinWaitlist({
        providerId: providerDbId,
        userId: currentUserId,
        serviceId: waitlistModal.service.dbId,
        serviceNameSnapshot: waitlistModal.service.name,
        providerNameSnapshot: provider.displayName,
        ...(currentUserName ? { userNameSnapshot: currentUserName } : {}),
        ...(preferredDates ? { preferredDates } : {}),
        ...(waitlistNotes.trim() ? { notes: waitlistNotes.trim() } : {}),
      });
      setUserWaitlistMap((prev) => ({
        ...prev,
        [entry.service_id ?? "__any__"]: entry,
      }));
      closeWaitlistModal();
    } catch {
      setWaitlistError("Couldn't save — check your connection and try again.");
    }
    setWaitlistJoining(false);
  }, [
    provider,
    providerDbId,
    currentUserId,
    currentUserName,
    waitlistModal.service,
    waitlistNotes,
    waitlistDateMode,
    waitlistDateFrom,
    waitlistDateTo,
    closeWaitlistModal,
  ]);

  const handleLeaveWaitlist = useCallback(async (entry: WaitlistEntry) => {
    try {
      await leaveWaitlist(entry.id);
      setUserWaitlistMap((prev) => {
        const next = { ...prev };
        delete next[entry.service_id ?? "__any__"];
        return next;
      });
    } catch {
      Alert.alert("Error", "Could not leave waitlist.");
    }
  }, []);

  const handleConfirmLeave = useCallback(async () => {
    if (!leaveConfirmEntry) return;
    const entry = leaveConfirmEntry;
    setLeaveConfirmEntry(null);
    await handleLeaveWaitlist(entry);
  }, [leaveConfirmEntry, handleLeaveWaitlist]);

  // Get In Touch → opens in-app chat with this provider
  const handleGetInTouch = useCallback(() => {
    if (!provider || !providerDbId) {
      Alert.alert("Not available", "Provider details are still loading.");
      return;
    }
    navigation.navigate("ProviderChat", {
      providerId: provider.id,
      providerDbId,
      providerName: provider.displayName,
    });
  }, [provider, providerDbId, navigation]);

  // Configure the navigation header with your gradient and icons
  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTransparent: true,
      headerTitle:
        isScrolledRef.current && provider ? provider.displayName : "",
      headerTitleStyle: {
        fontFamily: SERIF,
        fontSize: 17,
        color: OP.text,
      },
      headerLeft: () => (
        <TouchableOpacity
          style={styles.navBackButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={styles.navBackText}>←</Text>
        </TouchableOpacity>
      ),
      headerRight: () => (
        <View style={styles.navHeaderActions}>
          <TouchableOpacity
            style={[
              styles.headerActionButton,
              providerIsBookmarked && styles.headerActionButtonActive,
            ]}
            onPress={handleBookmarkToggle}
            activeOpacity={0.7}
            disabled={isBookmarkLoading}
            accessibilityLabel={
              providerIsBookmarked ? "Remove bookmark" : "Bookmark provider"
            }
            accessibilityRole="button"
          >
            <BookmarkIcon
              size={18}
              color={providerIsBookmarked ? adaptiveAccentColor : "#000"}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerActionButton}
            onPress={handleShare}
            activeOpacity={0.7}
            accessibilityLabel="Share"
            accessibilityRole="button"
          >
            <ShareIcon size={18} color="#000" />
          </TouchableOpacity>
        </View>
      ),
      headerBackground: () =>
        isScrolledRef.current ? (
          <View
            style={[
              styles.headerBackgroundContainer,
              { backgroundColor: OP.bg },
            ]}
          />
        ) : null,
      headerStyle: {
        height: 120, // Increased from default to push the header background down
        borderBottomWidth: 0,
        elevation: 0,
        shadowOpacity: 0,
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
        overflow: "hidden",
      },
    });
  }, [
    navigation,
    provider,
    providerIsBookmarked,
    isBookmarkLoading,
    adaptiveAccentColor,
    handleBookmarkToggle,
    handleShare,
  ]);
  const handleScroll = useCallback(
    (event: any) => {
      const scrolled = event.nativeEvent.contentOffset.y > 100;
      if (scrolled === isScrolledRef.current) return; // only act on threshold cross
      isScrolledRef.current = scrolled;
      // Update ONLY the header — no parent state, so scrolling never re-renders
      // this large screen (the fix for the first-scroll freeze).
      navigation.setOptions({
        headerTitle: scrolled && provider ? provider.displayName : "",
        headerBackground: () =>
          scrolled ? (
            <View
              style={[
                styles.headerBackgroundContainer,
                { backgroundColor: OP.bg },
              ]}
            />
          ) : null,
      });
    },
    [navigation, provider, OP.bg],
  );

  // Show success message with animation
  const showSuccessMessageWithAnimation = useCallback(
    (title: string, message: string, type: "cart" | "checkout") => {
      setSuccessMessageData({ title, message, type });
      setShowSuccessMessage(true);

      // Animate in
      Animated.spring(successAnimation, {
        toValue: 1,
        useNativeDriver: true,
        tension: 150,
        friction: 8,
      }).start();
    },
    [successAnimation],
  );

  // Hide success message with animation
  const hideSuccessMessage = useCallback(() => {
    Animated.timing(successAnimation, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowSuccessMessage(false);
      setSuccessMessageData(null);
    });
  }, [successAnimation]);

  /// UPDATED ProviderProfile Cart Handlers - Replace these functions in your ProviderProfileScreen

  // ===== UPDATED CART HANDLERS FOR COMPATIBILITY =====
  const handleQuickBook = useCallback(
    async (service: ServiceData, promo?: DbPromotion) => {
      logger.log("Quick Book - Redirecting to checkout:", service.name);
      if (!provider) return;

      // Providers with an external booking link are fully bypassed from
      // Cerviced's in-app booking — hand off to their own booking page
      // instead of adding to cart. See tryOpenExternalBooking below, which
      // handleBook uses for the same check on the non-Quick-Book path.
      if (provider.externalBookingUrl) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Linking.openURL(provider.externalBookingUrl).catch(() => {
          Alert.alert("Couldn't open booking link", 'Please try again in a moment.');
        });
        return;
      }

      try {
        // Actually resolve "next available" to a real date+time instead of
        // just claiming one in the toast — the cart item now carries it, so
        // this service arrives already scheduled. Never blocks Quick Book on
        // failure: falls back to the old unscheduled-add behavior below.
        // Runs alongside the deposit-policy check (independent lookups).
        const uuidServiceId =
          service.dbId && UUID_RE.test(service.dbId) ? service.dbId : undefined;
        const providerDisplayName = provider.displayName ?? provider.providerName;
        const [slot, depositPolicies] = await Promise.all([
          AvailabilityService.resolveNextAvailableSlot(
            providerDbId ?? providerDisplayName,
            service.duration,
            uuidServiceId,
          ).catch(() => null),
          getProviderDepositPoliciesByDisplayNames([providerDisplayName]).catch(
            () => ({}) as Record<string, import("../services/databaseService").ProviderDepositPolicy>
          ),
        ]);
        // Quick Book skips the payment-choice step entirely, so if the
        // provider requires a deposit (no "pay in full" option) that has to
        // be forced here too — otherwise this fast path would silently let
        // a client pay in full against the provider's own policy.
        const requiresDepositOnly = !!depositPolicies[providerDisplayName]?.depositOnly;

        // Create cart item for immediate checkout
        const cartItem = {
          providerName: provider.providerName,
          providerDisplayName: provider.displayName,
          providerSlug: provider.id,
          providerId: providerDbId ?? undefined,
          // Carry the offer's code into the cart so "Book Now" on a promo
          // actually applies it, instead of silently landing at full price.
          initialPromoCode: promo?.promo_code ?? undefined,
          providerImage: provider.providerLogo,
          providerService: provider.providerService,
          service: {
            // dbId is the real services.id UUID — carrying it into the cart
            // (and from there into bookings.service_id) is what lets
            // per-service buffer/duration lookups and waitlist matching work.
            id: service.dbId || service.id,
            name: service.name,
            price: service.price,
            duration: service.duration,
            description: service.description,
            addOns: [],
          },
          quantity: 1,
          selectedOptions: {},
          forceNewInstance: true,
          ...(slot ? { selectedDate: slot.date, selectedTime: slot.time } : {}),
          ...(requiresDepositOnly ? { isDepositOnly: true } : {}),
        };

        // Add to cart
        addToCart(cartItem);

        // Show redirecting message and navigate to cart for immediate checkout
        const slotLabel = slot
          ? `${new Date(slot.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} at ${slot.time}`
          : null;
        showSuccessMessageWithAnimation(
          "Redirecting to Checkout...",
          slotLabel
            ? `${service.name} booked for ${slotLabel}. Taking you to checkout.`
            : `${service.name} added to cart. Taking you to checkout to pick a time.`,
          "checkout",
        );

        // Navigate to Cart screen within the same stack
        setTimeout(() => {
          hideSuccessMessage();
          // Navigate to CartMain within the current stack for proper back navigation
          navigation.navigate("CartMain");
        }, 1500);
      } catch (error) {
        logger.error("Error in Quick Book:", error);
        Alert.alert(
          "Error",
          "Failed to process quick booking. Please try again.",
        );
      }
    },
    [
      provider,
      providerDbId,
      addToCart,
      showSuccessMessageWithAnimation,
      hideSuccessMessage,
      navigation,
    ],
  );

  // Providers with an external booking link (Fresha, Treatwell, Acuity, etc.)
  // are fully bypassed from Cerviced's in-app booking flow — every "Book"
  // entry point checks this first and hands off to their own booking page
  // instead of opening the cart/BookingSheet. Returns true if it handled the
  // tap (caller should stop), false if the caller should proceed in-app.
  const tryOpenExternalBooking = useCallback((): boolean => {
    const url = provider?.externalBookingUrl;
    if (!url) return false;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(url).catch(() => {
      Alert.alert("Couldn't open booking link", 'Please try again in a moment.');
    });
    return true;
  }, [provider]);

  // Offers "Book Now" — when the offer's eligibility narrows to exactly one
  // service, skip straight to checkout via the same flow as Quick Book.
  // promo.service_ids is the actual scoping field (null/empty means "every
  // service", same convention BookingSheet/CartScreen use for promo
  // eligibility) — promo.service_category is only the provider's own macro
  // category (HAIR/NAILS/...), the same value for every promo this provider
  // creates, not a key into provider.categories (which is that provider's
  // own custom per-service category_name groupings, a different vocabulary
  // entirely) — so it must NOT be used to index provider.categories.
  const handleBookOffer = useCallback(
    (promo: DbPromotion) => {
      closeOffersPanel();
      if (!provider) return;

      const allServices = Object.values(provider.categories).flat();
      const eligibleServices =
        promo.service_ids && promo.service_ids.length > 0
          ? allServices.filter((s) => promo.service_ids!.includes(s.dbId))
          : allServices; // no service_ids restriction → applies to every service

      if (eligibleServices.length === 1) {
        const target = eligibleServices[0]!;
        setTimeout(() => handleQuickBook(target, promo), 350); // let the panel slide out first
        return;
      }

      // Multiple eligible services and no in-app service list to send them
      // to anyway — go straight to the provider's own booking page, same as
      // every other "Book" entry point.
      if (tryOpenExternalBooking()) return;

      // Nothing safe to auto-pick — land the client on Services instead.
      // Pre-select the category only if the eligible set happens to live
      // entirely inside one of the provider's own categories.
      const matchedCategories = new Set(
        Object.entries(provider.categories)
          .filter(([, services]) => services.some((s) => eligibleServices.includes(s)))
          .map(([name]) => name),
      );
      if (matchedCategories.size === 1) {
        setSelectedCategory([...matchedCategories][0]!);
      }
      setTimeout(() => {
        const scrollNode = scrollRef.current;
        const section = servicesSectionRef.current;
        if (!scrollNode || !section) return;
        // Calling `section.measureLayout(...)` as an instance method still
        // logged "ref.measureLayout must be called with a ref to a native
        // component" at runtime (scrollTo happened to still work despite the
        // warning, which is how it went unnoticed). The static
        // `UIManager.measureLayout(target, relativeTo, onFail, onSuccess)`
        // form below takes plain node handles for both sides — via
        // findNodeHandle on each — instead of invoking measureLayout as a
        // method on the ref itself, which sidesteps that native-component
        // check entirely.
        const scrollHandle = findNodeHandle(scrollNode);
        const sectionHandle = findNodeHandle(section);
        if (!scrollHandle || !sectionHandle) return;
        UIManager.measureLayout(
          sectionHandle,
          scrollHandle,
          () => {},
          (_x: number, y: number) =>
            scrollNode.scrollTo({ y: Math.max(y - 90, 0), animated: true }),
        );
      }, 350);
    },
    [closeOffersPanel, provider, handleQuickBook, tryOpenExternalBooking],
  );

  const handleBook = useCallback((service: ServiceData) => {
    if (tryOpenExternalBooking()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      setSelectedService(service);
      setShowBookingSheet(true);
    } catch (error) {
      logger.error("Error opening booking sheet:", error);
      Alert.alert("Error", "Failed to open booking options. Please try again.");
    }
  }, [tryOpenExternalBooking]);

  // Arriving with route.params.openServiceId (e.g. tapping "Book Now" on a
  // specific service card in Explore) — open that exact service's booking
  // modal automatically once the provider's services have loaded, instead
  // of leaving the client to find it themselves in the list below.
  const openServiceIdHandled = useRef(false);
  useEffect(() => {
    if (openServiceIdHandled.current) return;
    const targetId = route.params?.openServiceId;
    // Never auto-fire for external-booking providers — handleBook would
    // silently launch Linking.openURL the moment this screen mounts, before
    // the client has even seen the profile. Let them tap Book themselves.
    if (!targetId || !provider || provider.externalBookingUrl) return;
    const match = Object.values(provider.categories)
      .flat()
      .find((s) => s.dbId === targetId);
    if (match) {
      openServiceIdHandled.current = true;
      handleBook(match);
    }
  }, [route.params?.openServiceId, provider, handleBook]);

  const handleBookingSheetSubmit = useCallback(
    (service: ServiceData, result: BookingSheetResult) => {
      logger.log("BookingSheet submit - Adding to cart:", service.name, result);
      if (!provider) return;

      try {
        const addOnsTotal = result.selectedAddOns.reduce(
          (sum, addOn) => sum + addOn.price,
          0,
        );
        const totalPrice = service.price + addOnsTotal;

        const cartItem = {
          providerName: provider.providerName,
          providerDisplayName: provider.displayName,
          providerSlug: provider.id,
          providerId: providerDbId ?? undefined,
          initialPromoCode: result.promoCode,
          providerImage: provider.providerLogo,
          providerService: provider.providerService,
          service: {
            // dbId is the real services.id UUID — see handleQuickBook for why
            // this must flow through instead of the local numeric id.
            id: service.dbId || service.id,
            name: service.name,
            price: service.price,
            duration: service.duration,
            description: service.description,
            // CRITICAL: Add-ons must be in service object for CartContext
            addOns: result.selectedAddOns,
          },
          quantity: 1,
          selectedOptions: {},
          forceNewInstance: true, // Always create new instance
          selectedDate: result.date,
          selectedTime: result.time,
          notes: result.notes || undefined,
          isDepositOnly: result.isDepositOnly,
        };

        // Add to cart context
        addToCart(cartItem);

        // A required consultation was scheduled alongside this service in
        // the same sheet (see requiredConsultationService) — add it as its
        // own cart item too, with its own date/time.
        if (result.consultationBooking && requiredConsultationService) {
          addToCart({
            providerName: provider.providerName,
            providerDisplayName: provider.displayName,
            providerSlug: provider.id,
            providerId: providerDbId ?? undefined,
            providerImage: provider.providerLogo,
            providerService: requiredConsultationService.categoryName,
            service: {
              id: requiredConsultationService.id,
              name: requiredConsultationService.name,
              price: requiredConsultationService.price,
              duration: `${requiredConsultationService.durationMinutes} min`,
              description: requiredConsultationService.description,
            },
            quantity: 1,
            selectedOptions: {},
            forceNewInstance: true,
            selectedDate: result.consultationBooking.date,
            selectedTime: result.consultationBooking.time,
          });
        }

        // Show success message
        const addOnsText =
          result.selectedAddOns.length > 0
            ? ` with ${result.selectedAddOns.length} add-on${result.selectedAddOns.length > 1 ? "s" : ""}`
            : "";
        const scheduledText = result.date
          ? ` booked for ${new Date(result.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} at ${result.time}`
          : "";
        const consultationText = result.consultationBooking
          ? ` Your required consultation is booked for ${new Date(result.consultationBooking.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} at ${result.consultationBooking.time}.`
          : "";

        showSuccessMessageWithAnimation(
          "Added to Cart!",
          `${service.name}${addOnsText}${scheduledText}. Total: £${totalPrice.toFixed(2)}.${consultationText}`,
          "cart",
        );
      } catch (error) {
        logger.error("Error adding service to cart:", error);
        Alert.alert(
          "Error",
          "Failed to add service to cart. Please try again.",
        );
      }
    },
    [provider, providerDbId, addToCart, showSuccessMessageWithAnimation, requiredConsultationService],
  );

  const handleViewCart = useCallback(() => {
    try {
      hideSuccessMessage();
      logger.log("Navigating to cart tab");

      const parent = navigation.getParent();
      if (parent) {
        parent.navigate("Cart", { screen: "CartMain" }); // Navigate to Cart tab and CartMain screen
      }
    } catch (error) {
      logger.error("Cart navigation error:", error);
      Alert.alert("Navigation Error", "Unable to navigate to cart");
    }
  }, [hideSuccessMessage, navigation]);

  // reviews is now state — seeded with defaults above, overwritten by Supabase fetch in useEffect

  const notificationMessage = useMemo(() => {
    if (notificationMessageType === "bell") {
      const fullName = provider?.providerName ?? "this provider";
      return isNotificationsEnabled
        ? `Notifications enabled for\n${fullName}`
        : `Notifications disabled for\n${fullName}`;
    } else {
      return providerIsBookmarked
        ? `Added to your\nproviders list`
        : `Removed from your\nproviders list`;
    }
  }, [
    notificationMessageType,
    isNotificationsEnabled,
    providerIsBookmarked,
    provider?.providerName,
    providerId,
  ]);

  if (loading || !provider) {
    // Show skeleton while loading, error text only when not found
    if (!loading && !provider) {
      return (
        <View style={[styles.loading, { backgroundColor: OP.bg }]}>
          <Text style={{ color: OP.sub, fontFamily: "Jura-VariableFont_wght" }}>
            Provider not found
          </Text>
        </View>
      );
    }
    return <ProviderProfileSkeleton />;
  }

  const selectedCategoryServices = provider.categories[selectedCategory] ?? [];
  const visibleServices = selectedCategoryServices.slice(
    0,
    SERVICES_COLLAPSED_LIMIT,
  );

  // Image viewer content, shared between the standalone top-level <Modal>
  // (used from the main profile page) and an internal overlay rendered
  // inside the "All Services" sheet's own <Modal> (used when a photo is
  // tapped from in there). Never both at once — see the two render sites.
  const renderImageViewerOverlay = () => (
    <View style={styles.imageModalOverlay}>
      <TouchableOpacity
        style={[StyleSheet.absoluteFill, { zIndex: 0 }]}
        activeOpacity={1}
        onPress={closeImageViewer}
      />
      {serviceImageModal.images.length > 0 && (
        <FlatList
          key={serviceImageModal.key}
          data={serviceImageModal.images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={serviceImageModal.currentIndex}
          getItemLayout={(_, index) => ({
            length: screenWidth,
            offset: screenWidth * index,
            index,
          })}
          keyExtractor={(_, i) => `modal-img-${i}`}
          renderItem={({ item }) => (
            <Image
              source={item}
              style={{ width: screenWidth, height: screenHeight * 0.85 }}
              resizeMode="contain"
            />
          )}
          style={{ width: screenWidth, flexGrow: 0, zIndex: 1 }}
        />
      )}
      <TouchableOpacity style={styles.imageModalClose} onPress={closeImageViewer}>
        <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700" }}>✕</Text>
      </TouchableOpacity>
    </View>
  );

  // Category tabs + service cards — shared by the capped inline list and the
  // fullscreen "Show all" sheet, so the two never drift out of sync. Pass
  // `onShowAll` to get the trailing expand button (inline view); pass null
  // for the sheet, which already shows everything.
  const renderServiceCategoryBlock = (
    services: ServiceData[],
    onShowAll: (() => void) | null,
    // Book / Waitlist open their own <Modal> (BookingSheet, the waitlist
    // modals). React Native doesn't reliably support one Modal opening on
    // top of another — on Android especially, the new one can render behind
    // or eat no touches at all. When this block is rendered inside the "All
    // Services" sheet, onBeforeAction closes that sheet first so the next
    // modal is never stacked on it. Image taps deliberately don't use this —
    // the viewer renders as an internal overlay instead, so tapping a photo
    // doesn't kick you out of the sheet you were browsing.
    onBeforeAction: () => void = () => {},
  ) => (
    <>
      {/* Enhanced Category Tabs */}
      <FlatList
        data={Object.keys(provider.categories)}
        renderItem={({ item: category }) => (
          <CategoryTabItem
            category={category}
            isSelected={selectedCategory === category}
            onPress={() => setSelectedCategory(category)}
            cardBg={
              selectedCategory === category ? adaptiveAccentColor : cardBg
            }
            blurIntensity={cardBlurIntensity}
            blurTint={cardBlurTint}
            borderColor={
              selectedCategory === category ? "transparent" : OP.border
            }
            textColor={selectedCategory === category ? "#FFFFFF" : OP.text}
          />
        )}
        keyExtractor={(item, index) => `cat-${item}-${index}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryTabs}
        contentContainerStyle={styles.categoryTabsContent}
        nestedScrollEnabled={true}
      />

      {/* Selected category's description — what it includes, benefits, etc. */}
      {provider.categoryDescriptions[selectedCategory] ? (
        <Text style={[styles.categoryDescriptionText, { color: OP.sub }]}>
          {provider.categoryDescriptions[selectedCategory]}
        </Text>
      ) : null}

      {/* Services List */}
      <View style={styles.categoryServicesContainer}>
        {services.map((service) => (
          <BlurView
            key={service.id}
            intensity={cardBlurIntensity}
            tint={cardBlurTint}
            style={[
              styles.serviceItemCard,
              { backgroundColor: cardBg, borderColor: OP.border },
            ]}
          >
            <LinearGradient
              colors={cardHighlightColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.cardHighlight}
            />
            <View style={styles.serviceCardBlur}>
              <View style={styles.serviceItem}>
                {(() => {
                  const isMulti = (service.images?.length ?? 0) > 1;
                  const hasSingle = (service.images?.length ?? 0) === 1;
                  const hasLocal = !!service.image;

                  if (isMulti) {
                    return (
                      <MultiImagePill
                        images={service.images!}
                        onPress={(imgs, idx) => openImageViewer(imgs, idx)}
                        imageStyle={styles.serviceImage}
                        containerStyle={[
                          styles.serviceImageContainer,
                          { marginRight: 0 },
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
                          styles.serviceImagePlaceholder,
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
                          {service.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    );
                  }
                  const imgSrc = hasSingle ? service.images![0] : service.image;
                  return (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => {
                        if (imgSrc) {
                          const imgs = service.images?.length
                            ? service.images
                            : [imgSrc];
                          openImageViewer(imgs, 0);
                        }
                      }}
                    >
                      <View style={styles.serviceImageContainer}>
                        <Image
                          source={imgSrc}
                          style={styles.serviceImage}
                          resizeMode="cover"
                        />
                      </View>
                    </TouchableOpacity>
                  );
                })()}

                <View style={styles.serviceInfo}>
                  <Text style={[styles.serviceName, { color: OP.text }]}>
                    {service.name}
                  </Text>
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
                  <Text
                    style={[styles.serviceDescription, { color: OP.sub }]}
                    numberOfLines={
                      expandedServices.has(service.id) ? undefined : 2
                    }
                  >
                    {service.description}
                  </Text>
                  {(service.description?.length ?? 0) > 80 && (
                    <TouchableOpacity
                      onPress={() =>
                        setExpandedServices((prev) => {
                          const next = new Set(prev);
                          next.has(service.id)
                            ? next.delete(service.id)
                            : next.add(service.id);
                          return next;
                        })
                      }
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.seeMoreText, { color: OP.text }]}>
                        {expandedServices.has(service.id)
                          ? "See less"
                          : "See more"}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* Treatment Safety — plain text, no box/border — only shown
                    when the provider actually filled this in (real
                    treatments), directly under the description so clients
                    see it before booking. */}
                  {(service.patchTestRequired ||
                    !!service.minAge ||
                    (service.contraindications?.length ?? 0) > 0) && (
                    <View style={styles.serviceSafetyInline}>
                      <Text
                        style={[styles.serviceSafetyTitle, { color: OP.text }]}
                      >
                        Treatment Safety
                      </Text>
                      {service.patchTestRequired && (
                        <Text
                          style={[styles.serviceSafetyLine, { color: OP.sub }]}
                        >
                          • Patch test required before this treatment
                        </Text>
                      )}
                      {!service.isPregnancySafe && (
                        <Text
                          style={[styles.serviceSafetyLine, { color: OP.sub }]}
                        >
                          • Not recommended during pregnancy
                        </Text>
                      )}
                      {!!service.minAge && (
                        <Text
                          style={[styles.serviceSafetyLine, { color: OP.sub }]}
                        >
                          • Minimum age {service.minAge}
                        </Text>
                      )}
                      {(service.contraindications?.length ?? 0) > 0 && (
                        <Text
                          style={[styles.serviceSafetyLine, { color: OP.sub }]}
                        >
                          • Not suitable if:{" "}
                          {service.contraindications!.join(", ")}
                        </Text>
                      )}
                    </View>
                  )}
                  <View style={styles.serviceDetails}>
                    <Text style={[styles.serviceDuration, { color: OP.sub }]}>
                      {service.duration}
                    </Text>
                    <Text style={[styles.servicePrice, { color: OP.text }]}>
                      £{service.price}
                    </Text>
                  </View>
                </View>

                {/* Book + Waitlist stacked column */}
                <View style={styles.serviceActionColumn}>
                  {(() => {
                    const fullyBooked = DEBUG_FORCE_FULLY_BOOKED || serviceFullyBooked[service.dbId] === true;
                    return (
                      <TouchableOpacity
                        disabled={fullyBooked}
                        style={[
                          styles.bookButton,
                          {
                            backgroundColor: fullyBooked
                              ? withAlpha(OP.sub, 0.18)
                              : adaptiveAccentColor,
                          },
                        ]}
                        onPress={() => {
                          onBeforeAction();
                          handleBook(service);
                        }}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.bookButtonText,
                            fullyBooked
                              ? { color: OP.sub, fontSize: 10 }
                              : { color: "#fff" },
                          ]}
                        >
                          {fullyBooked ? "Fully Booked" : "Book"}
                        </Text>
                      </TouchableOpacity>
                    );
                  })()}

                  {(() => {
                    const wEntry = userWaitlistMap[service.dbId];
                    if (wEntry) {
                      return (
                        <View
                          style={[
                            styles.waitlistChip,
                            {
                              borderColor:
                                wEntry.status === "notified"
                                  ? adaptiveAccentColor + "70"
                                  : "#FF9500" + "70",
                              backgroundColor:
                                wEntry.status === "notified"
                                  ? adaptiveAccentColor + "0D"
                                  : "#FF950010",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.waitlistChipText,
                              {
                                color:
                                  wEntry.status === "notified"
                                    ? adaptiveAccentColor
                                    : "#FF9500",
                              },
                            ]}
                          >
                            {wEntry.status === "notified"
                              ? "Slot Held — Confirm!"
                              : `Waiting · #${wEntry.position}`}
                          </Text>
                          <TouchableOpacity
                            onPress={() => {
                              onBeforeAction();
                              setLeaveConfirmEntry(wEntry);
                            }}
                            activeOpacity={0.6}
                            hitSlop={{
                              top: 6,
                              bottom: 6,
                              left: 6,
                              right: 6,
                            }}
                          >
                            <Text
                              style={[
                                styles.waitlistChipX,
                                {
                                  color:
                                    wEntry.status === "notified"
                                      ? adaptiveAccentColor
                                      : "#FF9500",
                                },
                              ]}
                            >
                              ✕
                            </Text>
                          </TouchableOpacity>
                        </View>
                      );
                    }
                    // undefined means "still checking" and true means
                    // "still has openings" — both stay quiet here.
                    if (!DEBUG_FORCE_FULLY_BOOKED && serviceNearTermAvailability[service.dbId] !== false)
                      return null;
                    // Provider turned waitlists off in Automations — still
                    // surface the scarcity so the client isn't only told
                    // "nothing this fortnight" after tapping Book and paging
                    // through empty weeks in the calendar. Skipped when
                    // the Book button above already reads "Fully Booked" —
                    // this note would just repeat the same claim.
                    if (!DEBUG_FORCE_FULLY_BOOKED && !provider.waitlistEnabled) {
                      if (serviceFullyBooked[service.dbId] === true) return null;
                      return (
                        <Text
                          style={[
                            styles.fullyBookedNote,
                            { color: OP.sub },
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
                          {
                            borderColor: adaptiveAccentColor + "70",
                            backgroundColor: adaptiveAccentColor + "0D",
                          },
                        ]}
                        onPress={() => {
                          onBeforeAction();
                          setWaitlistNotes("");
                          setWaitlistModal({
                            visible: true,
                            service,
                          });
                        }}
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
              </View>
            </View>
          </BlurView>
        ))}
        {onShowAll && selectedCategoryServices.length > SERVICES_COLLAPSED_LIMIT && (
          <TouchableOpacity
            style={styles.showAllServicesBtn}
            activeOpacity={0.7}
            onPress={onShowAll}
          >
            <Text
              style={[styles.showAllServicesText, { color: adaptiveAccentColor }]}
            >
              {`Show all ${selectedCategoryServices.length} services`}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={adaptiveAccentColor} />
          </TouchableOpacity>
        )}
      </View>
    </>
  );

  return (
    <SafeAreaProvider>
      <ThemedBackground>
        {/* Hero photo/gradient — full-bleed backdrop; the rounded sheet below overlaps
            up onto its lower edge for a seamless card-over-photo transition.
            Always rendered so the app's themed background never shows through. */}
        {provider.backgroundImage ? (
          <>
            <Image
              source={{ uri: provider.backgroundImage }}
              style={[styles.heroImage, { opacity: 0.88 }]}
              resizeMode="cover"
            />
            <LinearGradient
              colors={["rgba(0,0,0,0.38)", "rgba(0,0,0,0.18)", "transparent"]}
              locations={[0, 0.35, 0.62]}
              style={styles.heroImage}
            />
          </>
        ) : (
          <LinearGradient
            colors={
              provider.hasCustomGradient ? provider.gradient : [OP.hero, OP.bg]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.heroImage}
          />
        )}

        <StatusBar
          barStyle={theme.statusBar}
          translucent={true}
          backgroundColor="transparent"
        />

        {/* Notification Alert */}
        <NotificationAlert
          isVisible={showNotification}
          message={notificationMessage}
          onHide={() => setShowNotification(false)}
          slideAnimation={slideRightAnimation}
          isNotificationsEnabled={isNotificationsEnabled}
        />

        {/* Success Message */}
        {successMessageData && (
          <SuccessMessage
            isVisible={showSuccessMessage}
            title={successMessageData.title}
            message={successMessageData.message}
            type={successMessageData.type}
            onClose={hideSuccessMessage}
            onViewCart={
              successMessageData.type === "cart" ? handleViewCart : undefined
            }
            animation={successAnimation}
            adaptiveAccentColor={adaptiveAccentColor}
          />
        )}

        {/* Add-Ons Modal */}
        <BookingSheet
          isVisible={showBookingSheet}
          onClose={() => setShowBookingSheet(false)}
          mode="add"
          service={selectedService}
          onSubmit={(result) => selectedService && handleBookingSheetSubmit(selectedService, result)}
          adaptiveAccentColor={adaptiveAccentColor}
          backgroundColor={OP.card}
          providerIdentifier={
            providerDbId ?? provider?.displayName ?? provider?.providerName ?? ""
          }
          providerDisplayName={provider?.displayName ?? provider?.providerName ?? ""}
          providerKey={provider?.providerName ?? ""}
          providerServiceCategory={provider?.providerService}
          consultationRequired={
            selectedService?.serviceType !== "consultation" && requiredConsultationService
              ? {
                  id: requiredConsultationService.id,
                  name: requiredConsultationService.name,
                  price: requiredConsultationService.price,
                  duration: `${requiredConsultationService.durationMinutes} min`,
                  description: requiredConsultationService.description,
                }
              : null
          }
        />

        {/* Reviews Modal */}
        <ReviewsModal
          isVisible={showReviewsModal}
          onClose={() => setShowReviewsModal(false)}
          reviews={reviews}
          providerName={provider?.providerName ?? ""}
          adaptiveAccentColor={adaptiveAccentColor}
          providerGradient={provider?.gradient ?? ["#FF6B6B", "#4ECDC4"]}
        />

        {/* Offers side panel */}
        <OffersSidePanel
          isVisible={showOffersModal}
          onClose={closeOffersPanel}
          slideAnim={offersPanelSlide}
          promotions={promotions}
          providerName={provider?.providerName ?? ""}
          adaptiveAccentColor={adaptiveAccentColor}
          themeTokens={OP}
          onBookOffer={handleBookOffer}
        />

        {/* Fullscreen service image carousel modal — hidden whenever the "All
            Services" sheet is open, since that sheet renders this same
            content as an internal overlay instead (see renderImageViewerOverlay
            above). Never both, or we're back to two stacked native Modals. */}
        <Modal
          visible={serviceImageModal.visible && !showAllServicesModal}
          transparent
          animationType="fade"
          onRequestClose={closeImageViewer}
        >
          {renderImageViewerOverlay()}
        </Modal>

        {/* All Services — fullscreen sheet. Replaces the old inline
            "un-collapse in place" behaviour, which just made the whole
            profile page one long continuous scroll for a big category. */}
        <Modal
          visible={showAllServicesModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowAllServicesModal(false)}
        >
          {/* Gated on showAllServicesModal (not just Modal's own `visible`) —
              RN's Modal doesn't unmount its children when hidden, so without
              this every service card (Book button, waitlist state, image
              carousels, all of it) would stay permanently double-mounted:
              once here and once in the inline capped list below. */}
          {showAllServicesModal && (
            <View style={[styles.modalBackground, { backgroundColor: OP.card }]}>
              <SafeAreaView style={styles.modalSafeArea}>
                <View style={[styles.modalHeader, { borderBottomColor: OP.border }]}>
                  <View style={styles.modalHeaderContent}>
                    <View>
                      <Text style={[styles.modalTitle, { color: OP.text }]}>All Services</Text>
                      <Text style={[styles.modalSubtitle, { color: OP.sub }]}>
                        {selectedCategory} • {selectedCategoryServices.length}{" "}
                        service
                        {selectedCategoryServices.length === 1 ? "" : "s"}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.modalCloseButton,
                        { backgroundColor: adaptiveAccentColor },
                      ]}
                      onPress={() => setShowAllServicesModal(false)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.modalCloseText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <ScrollView
                  style={styles.modalContent}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.modalScrollContent}
                >
                  {renderServiceCategoryBlock(selectedCategoryServices, null, () =>
                    setShowAllServicesModal(false),
                  )}
                </ScrollView>
              </SafeAreaView>

              {/* Image viewer as an internal overlay, not a second <Modal> —
                  tapping a photo in here shouldn't kick you back out to find
                  the service again just to see it. */}
              {serviceImageModal.visible && (
                <View style={StyleSheet.absoluteFillObject}>
                  {renderImageViewerOverlay()}
                </View>
              )}
            </View>
          )}
        </Modal>

        {/* Waitlist Join Modal — centered popup */}
        <Modal
          visible={waitlistModal.visible}
          transparent
          animationType="fade"
          onRequestClose={closeWaitlistModal}
        >
          <View style={styles.waitlistPopupBackdrop}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={closeWaitlistModal}
            />
            <View
              style={[
                styles.waitlistPopupCard,
                { backgroundColor: OP.bg, borderColor: OP.border },
              ]}
            >
              {/* Header row */}
              <View style={styles.waitlistPopupHeader}>
                <View
                  style={[
                    styles.waitlistPopupIconWrap,
                    { backgroundColor: adaptiveAccentColor + "18" },
                  ]}
                >
                  <Ionicons
                    name="time-outline"
                    size={20}
                    color={adaptiveAccentColor}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.waitlistPopupTitle, { color: OP.text }]}>
                    Join Waitlist
                  </Text>
                  {waitlistModal.service && (
                    <Text
                      style={[
                        styles.waitlistPopupService,
                        { color: adaptiveAccentColor },
                      ]}
                      numberOfLines={1}
                    >
                      {waitlistModal.service.name}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={closeWaitlistModal}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.6}
                >
                  <Ionicons name="close" size={20} color={OP.sub} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.waitlistPopupSub, { color: OP.sub }]}>
                We'll notify you when a slot opens up.
              </Text>

              {/* Availability toggle */}
              <Text style={[styles.waitlistPopupLabel, { color: OP.sub }]}>
                AVAILABILITY
              </Text>
              <View
                style={[
                  styles.waitlistSegment,
                  { backgroundColor: OP.surface, borderColor: OP.border },
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.waitlistSegmentBtn,
                    waitlistDateMode === "anytime" && {
                      backgroundColor: adaptiveAccentColor,
                    },
                  ]}
                  onPress={() => setWaitlistDateMode("anytime")}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.waitlistSegmentText,
                      {
                        color: waitlistDateMode === "anytime" ? "#fff" : OP.sub,
                      },
                    ]}
                  >
                    Anytime
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.waitlistSegmentBtn,
                    waitlistDateMode === "range" && {
                      backgroundColor: adaptiveAccentColor,
                    },
                  ]}
                  onPress={() => setWaitlistDateMode("range")}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.waitlistSegmentText,
                      { color: waitlistDateMode === "range" ? "#fff" : OP.sub },
                    ]}
                  >
                    Date Range
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Date range rows */}
              {waitlistDateMode === "range" && (
                <View
                  style={[styles.waitlistDateBlock, { borderColor: OP.border }]}
                >
                  <TouchableOpacity
                    style={[
                      styles.waitlistDateRow,
                      { borderBottomColor: OP.sep },
                    ]}
                    onPress={() => handleOpenDatePicker("from")}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={15}
                      color={OP.sub}
                    />
                    <Text style={[styles.waitlistDateLabel, { color: OP.sub }]}>
                      From
                    </Text>
                    <Text
                      style={[
                        styles.waitlistDateValue,
                        {
                          color: waitlistDateFrom ? OP.text : OP.sub,
                          opacity: waitlistDateFrom ? 1 : 0.5,
                        },
                      ]}
                    >
                      {waitlistDateFrom
                        ? waitlistDateFrom.toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "Select date"}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={13}
                      color={OP.sub}
                      style={{ opacity: 0.4 }}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.waitlistDateRow}
                    onPress={() => handleOpenDatePicker("to")}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={15}
                      color={OP.sub}
                    />
                    <Text style={[styles.waitlistDateLabel, { color: OP.sub }]}>
                      To
                    </Text>
                    <Text
                      style={[
                        styles.waitlistDateValue,
                        {
                          color: waitlistDateTo ? OP.text : OP.sub,
                          opacity: waitlistDateTo ? 1 : 0.5,
                        },
                      ]}
                    >
                      {waitlistDateTo
                        ? waitlistDateTo.toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "Select date"}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={13}
                      color={OP.sub}
                      style={{ opacity: 0.4 }}
                    />
                  </TouchableOpacity>
                </View>
              )}

              {/* iOS inline date pickers — onChange only updates value, Done button closes */}
              {Platform.OS === "ios" &&
                showDatePickerFrom &&
                waitlistDateMode === "range" && (
                  <View>
                    <TouchableOpacity
                      style={[
                        styles.waitlistPickerDone,
                        { borderBottomColor: OP.border },
                      ]}
                      onPress={() => setShowDatePickerFrom(false)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.waitlistPickerDoneText,
                          { color: adaptiveAccentColor },
                        ]}
                      >
                        Done
                      </Text>
                    </TouchableOpacity>
                    <DateTimePicker
                      value={waitlistDateFrom ?? new Date()}
                      mode="date"
                      display="spinner"
                      minimumDate={new Date()}
                      onChange={(_, date) => {
                        if (date) setWaitlistDateFrom(date);
                      }}
                      themeVariant={OP.isDark ? "dark" : "light"}
                    />
                  </View>
                )}
              {Platform.OS === "ios" &&
                showDatePickerTo &&
                waitlistDateMode === "range" && (
                  <View>
                    <TouchableOpacity
                      style={[
                        styles.waitlistPickerDone,
                        { borderBottomColor: OP.border },
                      ]}
                      onPress={() => setShowDatePickerTo(false)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.waitlistPickerDoneText,
                          { color: adaptiveAccentColor },
                        ]}
                      >
                        Done
                      </Text>
                    </TouchableOpacity>
                    <DateTimePicker
                      value={
                        waitlistDateTo ??
                        (waitlistDateFrom
                          ? new Date(waitlistDateFrom.getTime() + 7 * 86400000)
                          : new Date())
                      }
                      mode="date"
                      display="spinner"
                      minimumDate={waitlistDateFrom ?? new Date()}
                      onChange={(_, date) => {
                        if (date) setWaitlistDateTo(date);
                      }}
                      themeVariant={OP.isDark ? "dark" : "light"}
                    />
                  </View>
                )}

              {/* Notes */}
              <Text
                style={[
                  styles.waitlistPopupLabel,
                  { color: OP.sub, marginTop: 16 },
                ]}
              >
                NOTES (OPTIONAL)
              </Text>
              <TextInput
                style={[
                  styles.waitlistNotesField,
                  {
                    color: OP.text,
                    backgroundColor: OP.surface,
                    borderColor: OP.border,
                  },
                ]}
                value={waitlistNotes}
                onChangeText={setWaitlistNotes}
                placeholder="Any preferences for the provider..."
                placeholderTextColor={OP.sub}
                multiline
                maxLength={280}
              />

              {waitlistError && (
                <Text style={[styles.waitlistErrorText, { color: "#FF3B30" }]}>
                  {waitlistError}
                </Text>
              )}

              {/* Action buttons */}
              <View style={styles.waitlistPopupActions}>
                <TouchableOpacity
                  style={[
                    styles.waitlistPopupCancelBtn,
                    { borderColor: OP.border },
                  ]}
                  onPress={closeWaitlistModal}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.waitlistPopupCancelText, { color: OP.sub }]}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.waitlistPopupConfirmBtn,
                    {
                      backgroundColor: adaptiveAccentColor,
                      opacity: waitlistJoining ? 0.6 : 1,
                    },
                  ]}
                  onPress={handleJoinWaitlist}
                  disabled={waitlistJoining}
                  activeOpacity={0.8}
                >
                  <Text style={styles.waitlistJoinConfirmText}>
                    {waitlistJoining ? "Joining..." : "Join Waitlist"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Waitlist Leave Confirmation Modal */}
        <Modal
          visible={leaveConfirmEntry !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setLeaveConfirmEntry(null)}
        >
          <View style={styles.waitlistPopupBackdrop}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setLeaveConfirmEntry(null)}
            />
            <View
              style={[
                styles.leavePopupCard,
                { backgroundColor: OP.bg, borderColor: OP.border },
              ]}
            >
              <View
                style={[
                  styles.leavePopupIconWrap,
                  { backgroundColor: "#FF950018" },
                ]}
              >
                <Ionicons name="exit-outline" size={22} color="#FF9500" />
              </View>
              <Text style={[styles.leavePopupTitle, { color: OP.text }]}>
                Leave Waitlist?
              </Text>
              {leaveConfirmEntry && (
                <Text
                  style={[
                    styles.leavePopupService,
                    { color: adaptiveAccentColor },
                  ]}
                  numberOfLines={1}
                >
                  {leaveConfirmEntry.service_name_snapshot}
                </Text>
              )}
              <Text style={[styles.leavePopupBody, { color: OP.sub }]}>
                You'll lose your place in the queue and won't be notified when a
                slot opens up.
              </Text>
              <View style={styles.waitlistPopupActions}>
                <TouchableOpacity
                  style={[
                    styles.waitlistPopupCancelBtn,
                    { borderColor: OP.border },
                  ]}
                  onPress={() => setLeaveConfirmEntry(null)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.waitlistPopupCancelText, { color: OP.sub }]}
                  >
                    Keep my spot
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.leavePopupLeaveBtn}
                  onPress={handleConfirmLeave}
                  activeOpacity={0.8}
                >
                  <Text style={styles.leavePopupLeaveText}>Leave</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Floating offers pull-out tab — fixed to right edge, slides in when deals are available */}
        {promotions.length > 0 && (
          <Animated.View
            style={[
              styles.offersFloatTab,
              { transform: [{ translateX: offersTabSlide }] },
            ]}
          >
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                openOffersPanel();
              }}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={
                  provider.hasCustomGradient
                    ? [
                        provider.gradient[0],
                        provider.gradient[1] ?? provider.gradient[0],
                      ]
                    : [adaptiveAccentColor, adaptiveAccentColor + "CC"]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.offersFloatTabGradient}
              >
                <Text style={styles.offersFloatCount}>{promotions.length}</Text>
                <Text style={styles.offersFloatLabel}>OFFERS</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* No bottom edge inset — the pink sheet must run under the home indicator */}
        <SafeAreaView style={styles.safeArea} edges={[]}>
          <ScrollView
            ref={scrollRef}
            style={styles.content}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            scrollEventThrottle={16}
            onScroll={handleScroll}
            nestedScrollEnabled={true}
          >
            {/* Logo + profile info — floats directly over the hero photo/gradient */}
            <View style={styles.heroInfoWrap}>
              {/* Provider Logo - Bigger */}
              <View style={styles.logoContainer}>
                <View style={styles.logoWrapper}>
                  {provider.providerLogo ? (
                    <Image
                      source={provider.providerLogo}
                      style={styles.providerLogo}
                      resizeMode="cover"
                    />
                  ) : (
                    <View
                      style={[
                        styles.providerLogo,
                        {
                          backgroundColor: provider.accentColor ?? "#AF9197",
                          alignItems: "center",
                          justifyContent: "center",
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: "#fff",
                          fontSize: 28,
                          fontWeight: "800",
                        }}
                      >
                        {provider.displayName
                          .split(" ")
                          .map((w: string) => w[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <LinearGradient
                    colors={
                      ["rgba(255,255,255,0.3)", "transparent"] as [
                        string,
                        string,
                        ...string[],
                      ]
                    }
                    style={styles.logoGloss}
                  />
                </View>
              </View>

              {/* Provider Info — editorial strip */}
              <View style={styles.providerInfoCenter}>
                {/* Name + verified */}
                <View style={styles.providerNameRow}>
                  <Text
                    style={[
                      styles.providerDisplayName,
                      { color: heroText },
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

                {/* SERVICE TYPE · LOCATION in small caps */}
                <Text
                  style={[
                    styles.providerMeta,
                    { color: heroSub },
                    heroIsDark && styles.heroTextShadow,
                  ]}
                >
                  {(provider.providerService === "OTHER"
                    ? provider.customServiceType || "SERVICE"
                    : provider.providerService
                  ).toUpperCase()}
                  {provider.location
                    ? ` · ${provider.location.toUpperCase()}`
                    : ""}
                </Text>

                {/* Rating inline */}
                <View style={styles.ratingRow}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <StarIcon key={star} size={12} color="#FFD700" />
                  ))}
                  <Text
                    style={[
                      styles.ratingInline,
                      { color: heroText },
                      heroIsDark && styles.heroTextShadow,
                    ]}
                  >
                    {provider.rating}
                  </Text>
                </View>

                {/* Years experience (optional) */}
                {provider.yearsExperience ? (
                  <Text
                    style={[
                      styles.yearsExp,
                      { color: heroSub },
                      heroIsDark && styles.heroTextShadow,
                    ]}
                  >
                    {provider.yearsExperience} years experience
                  </Text>
                ) : null}

                {/* Slots + bell */}
                {provider.slotsText ? (
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
                      {provider.slotsText}
                    </Text>
                    <TouchableOpacity
                      style={styles.bellButtonInline}
                      onPress={handleNotificationToggle}
                      activeOpacity={0.8}
                      accessibilityLabel="Notifications"
                      accessibilityRole="button"
                      accessibilityState={{ selected: isNotificationsEnabled }}
                    >
                      <BellIcon
                        size={16}
                        color={isNotificationsEnabled ? "#4CAF50" : OP.sub}
                      />
                    </TouchableOpacity>
                  </BlurView>
                ) : null}
              </View>
            </View>

            {/* The content sheet rises over the hero photo with its own large
                top corners (see contentSheet.borderTopLeftRadius/Right) —
                rises directly off the hero photo like a floating card. */}
            <View style={[styles.contentSheet, { backgroundColor: OP.bg }]}>
              {/* About / Policy tabbed card */}
              <View style={styles.aboutCardShadowWrap}>
                <BlurView
                  intensity={cardBlurIntensity}
                  tint={cardBlurTint}
                  style={[
                    styles.aboutCard,
                    { backgroundColor: cardBg, borderColor: OP.border },
                  ]}
                >
                  <LinearGradient
                    colors={cardHighlightColors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={styles.cardHighlight}
                  />
                  {/* Tab switcher — only show if there are policy rows */}
                  {(() => {
                    if (!hasPolicyInfo(provider)) return null;
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
                      {!hasPolicyInfo(provider) && (
                        <Text style={[styles.sectionTitle, { color: OP.text }]}>
                          Relevant Information
                        </Text>
                      )}
                      <Text style={[styles.aboutText, { color: OP.sub }]}>
                        {showFullAbout
                          ? provider.aboutText
                          : `${provider.aboutText.substring(0, 150)}...`}
                      </Text>
                      <TouchableOpacity
                        onPress={() => setShowFullAbout(!showFullAbout)}
                        style={styles.moreButton}
                        activeOpacity={0.6}
                      >
                        <Text style={[styles.moreButtonText, { color: OP.text }]}>
                          {showFullAbout ? "Show Less" : "More"}
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    /* Policy tab content */
                    (() => {
                      const bp = provider.bookingPolicies;
                      const rows: {
                        icon: keyof typeof Ionicons.glyphMap;
                        label: string;
                        value: string;
                        /** Short badge shown next to the label — e.g. "ONLY"
                         *  when the provider requires the deposit and won't
                         *  accept payment in full. */
                        tag?: string;
                      }[] = [];
                      if (bp?.depositRequired && bp.depositAmount) {
                        rows.push({
                          icon: "card-outline",
                          label: "Deposit",
                          value:
                            bp.depositType === "percent"
                              ? `${bp.depositAmount}% required`
                              : `£${bp.depositAmount} required`,
                          ...(bp.depositOnly ? { tag: "ONLY" } : {}),
                        });
                      }
                      // Cancellation — the enforced window (Automations screen) wins over
                      // the descriptive registration text, so clients see exactly what
                      // the cancel flow will apply.
                      const cancelPenaltyText =
                        bp?.cancelPenalty && bp.cancelPenalty !== "none"
                          ? ` · ${bp.cancelPenalty === "deposit" ? "deposit kept" : "full charge"}`
                          : "";
                      if (provider.cancellationNoticeHours > 0) {
                        rows.push({
                          icon: "time-outline",
                          label: "Cancellation",
                          value: `${provider.cancellationNoticeHours} hours' notice${cancelPenaltyText}`,
                        });
                      } else if (bp?.cancelNotice && bp.cancelNotice !== "none") {
                        rows.push({
                          icon: "time-outline",
                          label: "Cancellation",
                          value: `${bp.cancelNotice} notice${cancelPenaltyText}`,
                        });
                      }
                      if (bp?.rescheduleNotice || bp?.maxReschedules) {
                        const parts = [];
                        if (
                          bp.rescheduleNotice &&
                          bp.rescheduleNotice !== "same_day"
                        )
                          parts.push(`${bp.rescheduleNotice} notice`);
                        if (
                          bp.maxReschedules &&
                          bp.maxReschedules !== "unlimited"
                        )
                          parts.push(`max ${bp.maxReschedules}`);
                        if (parts.length > 0)
                          rows.push({
                            icon: "calendar-outline",
                            label: "Reschedule",
                            value: parts.join(" · "),
                          });
                      }
                      if (bp?.noShowAction && bp.noShowAction !== "none") {
                        rows.push({
                          icon: "close-circle-outline",
                          label: "No-show",
                          value:
                            bp.noShowAction === "warn"
                              ? "Warning issued"
                              : bp.noShowAction === "charge_deposit"
                                ? "Deposit charged"
                                : "Full charge",
                        });
                      }
                      if (bp?.cancelNote) {
                        rows.push({
                          icon: "information-circle-outline",
                          label: "Note",
                          value: bp.cancelNote,
                        });
                      }
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
                                  style={[styles.policyValue, { color: OP.text }]}
                                >
                                  {row.value}
                                </Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      );
                    })()
                  )}

                  {/* Floating policy-photo button — bottom-right of the card,
                      on top of whichever tab (or lack of tabs) is showing. This
                      is the only way in for a provider who uploaded this photo
                      but filled in none of the structured fields above (which
                      is why the tab switcher itself doesn't gate on it). */}
                  {provider.bookingPolicies?.policyImageUrl ? (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() =>
                        openImageViewer(
                          [{ uri: provider.bookingPolicies!.policyImageUrl }],
                          0,
                        )
                      }
                      style={[
                        styles.policyImageFab,
                        { backgroundColor: adaptiveAccentColor },
                      ]}
                      accessibilityLabel="View full policy details"
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

              {/* Specialties / Tags */}
              {provider.specialties.length > 0 && (
                <View style={styles.specialtiesSection}>
                  <Text style={[styles.sectionTitleNoCard, { color: OP.text }]}>
                    Specialties
                  </Text>
                  <View style={styles.specialtiesRow}>
                    {provider.specialties.map((s, i) => (
                      <View
                        key={i}
                        style={[
                          styles.specialtyChip,
                          {
                            borderColor: adaptiveAccentColor + "55",
                            backgroundColor: adaptiveAccentColor + "18",
                          },
                        ]}
                      >
                        <Text
                          style={[styles.specialtyChipText, { color: OP.text }]}
                        >
                          {s}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Services Section */}
              <View
                style={styles.servicesSection}
                ref={servicesSectionRef}
                collapsable={false}
              >
                <Text style={[styles.sectionTitleNoCard, { color: OP.text }]}>
                  Services
                </Text>

                {renderServiceCategoryBlock(visibleServices, () => {
                  Haptics.selectionAsync().catch(() => {});
                  setShowAllServicesModal(true);
                })}
              </View>

              {/* Reviews Section */}
              <BlurView
                intensity={cardBlurIntensity}
                tint={cardBlurTint}
                style={[
                  styles.reviewsCard,
                  { backgroundColor: cardBg, borderColor: OP.border },
                ]}
              >
                <LinearGradient
                  colors={cardHighlightColors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.cardHighlight}
                />
                <Text style={[styles.sectionTitle, { color: OP.text }]}>
                  Reviews
                </Text>
                {reviews.slice(0, 5).map((review) => (
                  <View
                    key={review.id}
                    style={[styles.reviewItem, { borderBottomColor: OP.sep }]}
                  >
                    <View style={styles.reviewHeader}>
                      <Text style={[styles.reviewerName, { color: OP.text }]}>
                        {review.name}
                      </Text>
                      <View style={styles.reviewRating}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <TabIcon
                            key={star}
                            name="star"
                            size={12}
                            color={
                              star <= review.rating ? "#FFD700" : OP.border
                            }
                          />
                        ))}
                      </View>
                      <Text style={[styles.reviewDate, { color: OP.sub }]}>
                        {review.date}
                      </Text>
                    </View>
                    {review.comment ? (
                      <Text style={[styles.reviewComment, { color: OP.sub }]}>
                        {review.comment}
                      </Text>
                    ) : null}
                  </View>
                ))}

                <TouchableOpacity
                  style={styles.seeAllButton}
                  onPress={() => setShowReviewsModal(true)}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.seeAllText, { color: OP.text }]}>
                    See All Reviews
                  </Text>
                </TouchableOpacity>
              </BlurView>

              {/* Contact */}
              <BlurView
                intensity={cardBlurIntensity}
                tint={cardBlurTint}
                style={[
                  styles.contactCard,
                  { backgroundColor: cardBg, borderColor: OP.border },
                ]}
              >
                <LinearGradient
                  colors={cardHighlightColors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.cardHighlight}
                />
                <Text style={[styles.sectionTitle, { color: OP.text }]}>
                  Contact
                </Text>

                {provider.location ? (
                  <View
                    style={[styles.contactRow, { borderBottomColor: OP.sep }]}
                  >
                    <Text style={[styles.contactRowLabel, { color: OP.sub }]}>
                      Location
                    </Text>
                    <Text
                      style={[styles.contactRowText, { color: OP.text }]}
                      numberOfLines={1}
                    >
                      {provider.location}
                    </Text>
                  </View>
                ) : null}

                {provider.phone && provider.preferredContactMethods.includes("phone") ? (
                  <TouchableOpacity
                    style={[styles.contactRow, { borderBottomColor: OP.sep }]}
                    onPress={() =>
                      Linking.openURL(
                        `sms:${provider.phone.replace(/\s/g, "")}`,
                      )
                    }
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.contactRowLabel, { color: OP.sub }]}>
                      Phone
                    </Text>
                    <Text style={[styles.contactRowAction, { color: OP.text }]}>
                      Message ›
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {provider.whatsapp && provider.preferredContactMethods.includes("whatsapp") ? (
                  <TouchableOpacity
                    style={[styles.contactRow, { borderBottomColor: OP.sep }]}
                    onPress={() =>
                      Linking.openURL(
                        `https://wa.me/${provider.whatsapp.replace(/[^0-9+]/g, "")}`,
                      )
                    }
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.contactRowLabel, { color: OP.sub }]}>
                      WhatsApp
                    </Text>
                    <Text style={[styles.contactRowAction, { color: OP.text }]}>
                      Open ›
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {provider.email && provider.preferredContactMethods.includes("email") ? (
                  <TouchableOpacity
                    style={[styles.contactRow, { borderBottomColor: OP.sep }]}
                    onPress={() => Linking.openURL(`mailto:${provider.email}`)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.contactRowLabel, { color: OP.sub }]}>
                      Email
                    </Text>
                    <Text style={[styles.contactRowAction, { color: OP.text }]}>
                      Send ›
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {provider.instagram ? (
                  <TouchableOpacity
                    style={[styles.contactRow, { borderBottomColor: OP.sep }]}
                    onPress={() =>
                      Linking.openURL(
                        `https://instagram.com/${provider.instagram}`,
                      )
                    }
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.contactRowLabel, { color: OP.sub }]}>
                      Instagram
                    </Text>
                    <Text
                      style={[styles.contactRowAction, { color: OP.text }]}
                      numberOfLines={1}
                    >
                      @{provider.instagram} ›
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {provider.website ? (
                  <TouchableOpacity
                    style={[styles.contactRow, { borderBottomColor: OP.sep }]}
                    onPress={() => Linking.openURL(provider.website)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.contactRowLabel, { color: OP.sub }]}>
                      Website
                    </Text>
                    <Text style={[styles.contactRowAction, { color: OP.text }]}>
                      Visit ›
                    </Text>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  style={[
                    styles.contactButton,
                    { backgroundColor: adaptiveAccentColor },
                  ]}
                  onPress={handleGetInTouch}
                  activeOpacity={0.8}
                >
                  <Text style={styles.contactButtonText}>Get In Touch</Text>
                </TouchableOpacity>
              </BlurView>

              {/* Portfolio — Pinterest-style two-column masonry of client work */}
              {portfolio.length > 0 && (
                <View style={styles.portfolioSection}>
                  <Text
                    style={[
                      styles.sectionTitleNoCard,
                      { color: OP.text, paddingHorizontal: 0 },
                    ]}
                  >
                    Portfolio
                  </Text>
                  <View style={styles.portfolioColumns}>
                    {portfolioColumns.map((column, colIdx) => (
                      <View
                        key={`pcol-${colIdx}`}
                        style={styles.portfolioColumn}
                      >
                        {column.map((item) => (
                          <TouchableOpacity
                            key={item.id}
                            activeOpacity={0.88}
                            onPress={() =>
                              openImageViewer(portfolioImages, item.globalIndex)
                            }
                            style={styles.portfolioTile}
                          >
                            <Image
                              source={{ uri: item.image_url }}
                              style={{ width: "100%", height: item.tileHeight }}
                              resizeMode="cover"
                            />
                            {item.caption ? (
                              <View style={styles.portfolioCaptionWrap}>
                                <Text
                                  style={styles.portfolioCaption}
                                  numberOfLines={1}
                                >
                                  {item.caption}
                                </Text>
                              </View>
                            ) : null}
                          </TouchableOpacity>
                        ))}
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </ThemedBackground>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  heroImage: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  safeArea: {
    flex: 1,
  },

  // Navigation Header Styles - Seamless Transition
  headerBackgroundContainer: {
    flex: 1,
    overflow: "hidden",
  },
  navHeaderBackground: {
    flex: 1,
    // Extend to create seamless transition from status bar
    marginTop: -60, // Back to original value
    paddingTop: 60, // Back to original value
    opacity: 1, // Full opacity for seamless blend
  },
  navBackButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    borderRadius: 20,
    marginLeft: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  navBackText: {
    fontSize: 24,
    fontFamily: "BakbakOne-Regular",
    color: "#000",
  },
  navHeaderActions: {
    flexDirection: "row",
    gap: 15,
    marginRight: 15,
  },
  headerActionButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  headerActionButtonActive: {
    backgroundColor: "rgba(255,255,255,0.4)",
    borderColor: "rgba(255,255,255,0.5)",
    shadowColor: "rgba(0,0,0,0.15)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },

  // Content Styles
  content: {
    flex: 1,
  },
  scrollContent: {
    // No padding here — the sheet itself carries the bottom padding so its pink
    // backdrop extends all the way down instead of exposing the screen behind it.
  },
  heroInfoWrap: {
    paddingTop: 100, // clears the status bar / back button over the hero photo
  },
  heroTextShadow: {
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  contentSheet: {
    minHeight: screenHeight, // always reach the bottom of the screen — never lets the hero photo show through below short content
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
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 20,
    marginTop: 0,
  },
  logoWrapper: {
    position: "relative",
    width: 148,
    height: 148,
  },
  providerLogo: {
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
  logoGloss: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 148,
    height: 148,
    borderRadius: 74,
  },
  providerInfoCenter: {
    alignItems: "center",
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  providerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  providerDisplayName: {
    fontFamily: SERIF,
    fontSize: 30,
    lineHeight: 40,
    textAlign: "center",
  },
  providerHandle: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "600",
    fontSize: 13,
    marginBottom: 14,
    textAlign: "center",
    opacity: 0.7,
  },
  providerMeta: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 1.2,
    textAlign: "center",
    marginBottom: 10,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    marginBottom: 8,
  },
  ratingInline: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "800",
    fontSize: 13,
    marginLeft: 4,
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
  infoTabRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    marginHorizontal: -4,
  },
  infoTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  infoTabText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  infoTagRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "center",
    marginBottom: 14,
  },
  infoTagPill: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  infoTagText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 12,
    letterSpacing: 0.3,
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
    marginBottom: 4,
  },
  providerNameLarge: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 28,
    color: "#000",
    marginBottom: 15,
    textAlign: "center",
    textShadowColor: "rgba(255,255,255,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 15,
  },
  stars: {
    flexDirection: "row",
    gap: 3,
  },
  ratingText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 16,
    color: "#000",
    fontWeight: "bold",
  },
  serviceTag: {
    borderRadius: 25,
    marginBottom: 15,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    shadowColor: "rgba(0,0,0,0.1)",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  serviceTagBlur: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
  },

  // Enhanced Slots Content with Inline Bell
  slotsContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  // Inline Bell Button
  bellButtonInline: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },

  // Notification Alert Styles
  notificationAlert: {
    position: "absolute",
    top: 120,
    right: 5, // Moved even closer to the right edge
    zIndex: 1000,
    borderRadius: 20,
    overflow: "hidden",
    maxWidth: screenWidth * 0.7, // Further reduced width
    minWidth: 200, // Further reduced minimum width
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  notificationBlur: {
    paddingHorizontal: 16, // Reduced padding
    paddingVertical: 12, // Reduced padding
    position: "relative",
  },
  notificationGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  notificationContent: {
    flexDirection: "row",
    alignItems: "flex-start", // Changed to flex-start for multi-line text
    gap: 10, // Reduced gap
    zIndex: 1,
  },
  notificationText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 12, // Reduced from 13
    fontWeight: "bold",
    flex: 1,
    flexWrap: "wrap", // Allow text wrapping
    lineHeight: 16, // Reduced line height
    textAlign: "left", // Ensure proper alignment for multi-line text
  },

  serviceText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 14,
    color: "#000",
    fontWeight: "bold",
    letterSpacing: 0.5,
  },
  locationText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 16,
    color: "#000",
    marginBottom: 15,
    textAlign: "center",
    fontWeight: "bold",
    textShadowColor: "rgba(255,255,255,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  slotsText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 11,
    textAlign: "center",
    zIndex: 2, // Above overlays
  },
  slotsoutcard: {
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    shadowColor: "rgba(0,0,0,0.1)",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },

  // Enhanced 3D Glass Effects
  cardShadow: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 20,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
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
  aboutCard: {
    padding: 22,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
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
  slotsCardHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
  },
  sectionTitle: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 18,
    marginBottom: 15,
  },
  aboutText: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "600",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
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

  // Services Section
  specialtiesSection: {
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  specialtiesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  specialtyChip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  specialtyChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  servicesSection: {
    marginBottom: 20,
  },
  sectionTitleNoCard: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 18,
    marginBottom: 15,
    paddingHorizontal: 20,
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
    paddingHorizontal: 20,
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
  serviceItemCard: {
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    shadowColor: "#B87E92",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 3,
    marginBottom: 12,
  },
  serviceCardBlur: {
    flex: 1,
  },
  serviceItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
  },
  serviceImageContainer: {
    position: "relative",
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: "hidden",
    marginRight: 15,
  },
  serviceImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  serviceImagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  serviceImagePlaceholderText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 22,
  },
  serviceImageOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.3,
  },
  serviceInfo: {
    flex: 1,
    marginRight: 15,
  },
  serviceName: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 14,
    marginBottom: 5,
  },
  serviceVirtualBadge: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "700",
    fontSize: 10,
    marginBottom: 5,
  },
  serviceDescription: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "600",
    fontSize: 12,
    marginBottom: 4,
  },
  seeMoreText: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 6,
  },
  serviceSafetyInline: {
    marginBottom: 6,
    gap: 2,
  },
  serviceSafetyTitle: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  serviceSafetyLine: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 11,
    lineHeight: 15,
  },
  imageModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  imageModalClose: {
    position: "absolute",
    top: 60,
    right: 20,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  imageModalFull: {
    width: "100%",
    height: "80%",
  },
  serviceDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  serviceDuration: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "600",
    fontSize: 11,
  },
  servicePrice: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 14,
    fontWeight: "bold",
    // Color will be set dynamically using adaptiveAccentColor
  },

  // Enhanced Action Buttons with Reflective Effects
  actionButtons: {
    flexDirection: "column",
    gap: 10, // Increased gap since there are only 2 buttons now
    minWidth: 90,
  },
  actionButtonBlur: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    position: "relative",
  },
  buttonReflection: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "50%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
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
  quickBookButton: {
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    shadowColor: "rgba(0,0,0,0.1)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  quickBookButtonText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 10,
    color: "#000",
    fontWeight: "600",
    opacity: 0.9,
    zIndex: 1,
  },

  // Portfolio — two-column masonry (sits inside contentSheet, which already pads 20)
  portfolioSection: {
    marginTop: 20,
    marginBottom: 20,
  },
  portfolioColumns: {
    flexDirection: "row",
    gap: 12,
  },
  portfolioColumn: {
    flex: 1,
    gap: 12,
  },
  portfolioTile: {
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  portfolioCaptionWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    paddingTop: 14,
    paddingBottom: 8,
    backgroundColor: "rgba(0,0,0,0.32)",
  },
  portfolioCaption: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "700",
    fontSize: 11,
    color: "#fff",
  },

  // Reviews Section
  reviewsCard: {
    padding: 22,
    borderRadius: 26,
    marginBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    shadowColor: "#B87E92",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 3,
  },
  reviewItem: {
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  reviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    // no marginBottom — the comment carries its own marginTop, so rows with and
    // without a comment keep identical spacing
  },
  reviewerName: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 12,
  },
  reviewRating: {
    flexDirection: "row",
    gap: 1,
  },
  reviewDate: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "600",
    fontSize: 10,
    marginLeft: "auto",
  },
  reviewComment: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "600",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  seeAllButton: {
    alignItems: "center",
    paddingTop: 10,
  },
  seeAllText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 12,
    fontWeight: "bold",
    // Color will be set dynamically using adaptiveAccentColor
  },

  // Contact Section
  policyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 14,
  },
  policyRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  policyIcon: {
    width: 28,
    alignItems: "center",
  },
  policyRowText: {
    flex: 1,
  },
  policyLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  policyLabel: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 2,
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
  // Floating circular button, bottom-right of the About/Policy card — opens
  // the provider's uploaded policy photo. Absolutely positioned so it stays
  // put regardless of which tab (About/Policy) is active, or whether the
  // tab switcher is even showing (a provider can have this image with no
  // structured policy fields at all, in which case it's the only way in).
  policyImageFab: {
    position: "absolute",
    bottom: 14,
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
  contactCard: {
    padding: 22,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    shadowColor: "#B87E92",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 3,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  contactRowLabel: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 13,
    fontWeight: "800",
  },
  contactRowText: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
    textAlign: "right",
    paddingLeft: 16,
  },
  contactRowAction: {
    fontFamily: "Jura-VariableFont_wght",
    fontSize: 13,
    fontWeight: "800",
  },
  contactText: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "600",
    fontSize: 12,
    marginBottom: 8,
  },
  contactButton: {
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: "center",
    marginTop: 16,
    shadowColor: "#B87E92",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  contactButtonText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 13,
    letterSpacing: 0.6,
    color: "#fff",
  },

  modalContainer: {
    flex: 1,
    marginTop: 100, // Start modal below status bar
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    overflow: "hidden",
  },
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
    fontWeight: "600",
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
  modalContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  modalScrollContent: {
    paddingVertical: 20,
    paddingBottom: 40,
  },
  modalReviewCard: {
    padding: 18,
    borderRadius: 20,
    marginBottom: 15,
    backgroundColor: "rgba(255,255,255,0.15)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
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
    fontWeight: "600",
    fontSize: 12,
    color: "rgba(0, 0, 0, 0.75)",
    marginLeft: "auto",
  },
  modalReviewComment: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "600",
    fontSize: 14,
    color: "#000",
    lineHeight: 20,
    marginTop: 12,
  },


  // Success Message Styles
  successOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2000,
  },
  successContainer: {
    marginHorizontal: 30,
    borderRadius: 25,
    overflow: "hidden",
    maxWidth: screenWidth * 0.85,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 15,
  },
  successBlur: {
    padding: 30,
    alignItems: "center",
    position: "relative",
  },
  successGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  successIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  successIconText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "bold",
  },
  successTitle: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 22,
    color: "#000",
    marginBottom: 12,
    textAlign: "center",
  },
  successMessage: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "600",
    fontSize: 16,
    color: "#000",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 25,
  },
  successButtons: {
    flexDirection: "row",
    gap: 15,
    width: "100%",
  },
  successCloseButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "rgba(0,0,0,0.2)",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  successCloseText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 13,
    color: "#000",
    fontWeight: "bold",
  },
  successViewCartButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  successViewCartText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 13,
    color: "#fff",
    fontWeight: "bold",
  },

  // ── Floating Offers Pull-Out Tab ────────────────────────────────────────────
  offersFloatTab: {
    position: "absolute",
    right: 0,
    top: 220,
    zIndex: 999, // always floats above the content sheet
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: -3, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 20,
  },
  offersFloatTabGradient: {
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 14,
    paddingRight: 10,
    alignItems: "center",
    minWidth: 54,
  },
  offersFloatCount: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 20,
    fontWeight: "800",
    color: "#fff",
    lineHeight: 22,
  },
  offersFloatLabel: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 8,
    color: "rgba(255,255,255,0.85)",
    letterSpacing: 1.2,
    marginTop: 2,
  },

  // ── Offers Side Panel ───────────────────────────────────────────────────────
  sidePanelBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    zIndex: 300,
  },
  sidePanelContainer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: SIDE_PANEL_W,
    zIndex: 301,
    shadowColor: "#000",
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 24,
  },

  // Waitlist — service card
  serviceActionColumn: { alignItems: "center", gap: 6 },
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
  fullyBookedNote: {
    fontSize: 10,
    fontWeight: "600",
    textAlign: "right",
    maxWidth: 90,
  },
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
  waitlistRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  waitlistBadge: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  waitlistBadgeText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 10,
    letterSpacing: 0.3,
  },
  waitlistLeaveText: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "600",
    fontSize: 10,
    opacity: 0.6,
  },

  // Waitlist — centered popup modal
  waitlistPopupBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.52)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 22,
  },
  waitlistPopupCard: {
    width: "100%",
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 12,
  },
  waitlistPopupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  waitlistPopupIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  waitlistPopupTitle: { fontFamily: "BakbakOne-Regular", fontSize: 17 },
  waitlistPopupService: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "600",
    fontSize: 12,
    marginTop: 1,
  },
  waitlistPopupSub: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "600",
    fontSize: 13,
    marginBottom: 16,
    opacity: 0.7,
  },
  waitlistPopupLabel: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  waitlistSegment: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    marginBottom: 14,
  },
  waitlistSegmentBtn: {
    flex: 1,
    borderRadius: 9,
    paddingVertical: 9,
    alignItems: "center",
  },
  waitlistSegmentText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 12,
    letterSpacing: 0.3,
  },
  waitlistDateBlock: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 2,
    overflow: "hidden",
  },
  waitlistDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  waitlistDateLabel: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 11,
    width: 32,
    letterSpacing: 0.3,
  },
  waitlistDateValue: {
    flex: 1,
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "600",
    fontSize: 13,
  },
  waitlistPickerDone: {
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  waitlistPickerDoneText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 14,
    letterSpacing: 0.3,
  },
  waitlistNotesField: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "600",
    fontSize: 14,
    minHeight: 72,
    textAlignVertical: "top",
    marginBottom: 18,
  },
  waitlistErrorText: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "600",
    fontSize: 12,
    marginBottom: 10,
    textAlign: "center",
  },
  waitlistPopupActions: { flexDirection: "row", gap: 10 },
  waitlistPopupCancelBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 13,
    alignItems: "center",
  },
  waitlistPopupCancelText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 12,
    letterSpacing: 0.3,
  },
  waitlistPopupConfirmBtn: {
    flex: 1.6,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  waitlistJoinConfirmText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 13,
    color: "#fff",
    letterSpacing: 0.4,
  },

  // Leave waitlist confirmation popup
  leavePopupCard: {
    width: "100%",
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 10,
  },
  leavePopupIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  leavePopupTitle: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 20,
    letterSpacing: 0.2,
    marginBottom: 6,
    textAlign: "center",
  },
  leavePopupService: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 13,
    letterSpacing: 0.3,
    marginBottom: 10,
    textAlign: "center",
  },
  leavePopupBody: {
    fontFamily: "Jura-VariableFont_wght",
    fontWeight: "600",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    opacity: 0.75,
    marginBottom: 22,
    paddingHorizontal: 6,
  },
  leavePopupLeaveBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
    backgroundColor: "#FF3B30",
  },
  leavePopupLeaveText: {
    fontFamily: "BakbakOne-Regular",
    fontSize: 13,
    color: "#fff",
    letterSpacing: 0.4,
  },
});

export default ProviderProfileScreen;
