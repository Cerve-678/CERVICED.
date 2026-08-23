import { useCallback, useEffect, useRef, useState } from "react";

import { AvailabilityService } from "../../services/AvailabilityService";
import type {
  AvailabilitySummary,
  WeeklyOpeningHoursDay,
} from "../../services/AvailabilityService";
import {
  getProviderActivePromotions,
  getProviderBySlug,
  getProviderPortfolio,
  getProviderProfileViewerContext,
  getProviderReviews,
  trackUserInteraction,
} from "../../services/databaseService";
import { getUnclaimedProviderDetail } from "../../services/providerClaimService";
import type { UnclaimedProviderDetail } from "../../services/providerClaimService";
import userLearningService from "../../services/userLearningService";
import type { ClientPromotion, DbPortfolioItem } from "../../types/database";
import { logger } from "../../utils/logger";
import { mapProviderProfileData } from "./profileMapper";
import type { ProviderProfileData } from "./profileTypes";

export interface ProviderReviewItem {
  id: number | string;
  name: string;
  rating: number;
  comment: string;
  date: string;
}

const PROFILE_REVIEWS_LIMIT = 10;

export const mapProviderReviews = (
  rows: Awaited<ReturnType<typeof getProviderReviews>>,
): ProviderReviewItem[] =>
  rows.map((review) => ({
    id: review.id,
    name: review.user?.name?.trim() || "Anonymous",
    rating: review.rating,
    comment: review.comment ?? "",
    date: new Date(review.created_at).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
  }));

export interface ProviderProfileDataState {
  provider: ProviderProfileData | null;
  providerDbId: string | null;
  loading: boolean;
  loadFailed: boolean;
  unclaimedProvider: UnclaimedProviderDetail | null;
  reviews: ProviderReviewItem[];
  reviewsLoading: boolean;
  reviewsLoadedAll: boolean;
  promotions: ClientPromotion[];
  portfolio: DbPortfolioItem[];
  availability: AvailabilitySummary | null;
  availabilityLoading: boolean;
  openingHours: WeeklyOpeningHoursDay[] | null;
  currentUserId: string | null;
  currentUserName: string;
  isOwnProvider: boolean;
  viewerChecked: boolean;
  isNotificationsEnabled: boolean;
  setIsNotificationsEnabled: (enabled: boolean) => void;
  loadAllReviews: () => Promise<void>;
}

/**
 * Owns the profile's data lifecycle while keeping the page shell independent
 * from secondary sections. Only the public provider query can block the
 * initial render; every other request degrades within its own section.
 */
export function useProviderProfileData(
  providerSlug: string,
): ProviderProfileDataState {
  const profileGenerationRef = useRef(0);
  const [provider, setProvider] = useState<ProviderProfileData | null>(null);
  const [providerDbId, setProviderDbId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [unclaimedProvider, setUnclaimedProvider] =
    useState<UnclaimedProviderDetail | null>(null);
  const [reviews, setReviews] = useState<ProviderReviewItem[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsLoadedAll, setReviewsLoadedAll] = useState(false);
  const [promotions, setPromotions] = useState<ClientPromotion[]>([]);
  const [portfolio, setPortfolio] = useState<DbPortfolioItem[]>([]);
  const [availability, setAvailability] = useState<AvailabilitySummary | null>(
    null,
  );
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [openingHours, setOpeningHours] = useState<
    WeeklyOpeningHoursDay[] | null
  >(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState("");
  const [isOwnProvider, setIsOwnProvider] = useState(false);
  const [viewerChecked, setViewerChecked] = useState(false);
  const [isNotificationsEnabled, setIsNotificationsEnabled] = useState(false);

  useEffect(() => {
    profileGenerationRef.current += 1;
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    setProvider(null);
    setProviderDbId(null);
    setUnclaimedProvider(null);
    setReviews([]);
    setReviewsLoading(true);
    setReviewsLoadedAll(false);
    setPromotions([]);
    setPortfolio([]);
    setAvailability(null);
    setAvailabilityLoading(true);
    setOpeningHours(null);
    setCurrentUserId(null);
    setCurrentUserName("");
    setIsOwnProvider(false);
    setViewerChecked(false);
    setIsNotificationsEnabled(false);

    const loadProfile = async (): Promise<void> => {
      try {
        const data = await getProviderBySlug(providerSlug);
        if (cancelled) return;
        if (!data) {
          const unclaimed = await getUnclaimedProviderDetail(providerSlug);
          if (!cancelled) setUnclaimedProvider(unclaimed);
          return;
        }

        setProvider(mapProviderProfileData(data));
        setProviderDbId(data.id);
        setLoading(false);

        void userLearningService
          .trackInteraction({
            type: "view",
            providerId: data.id,
            providerName: data.display_name,
            serviceCategory: data.service_category,
            timestamp: new Date().toISOString(),
          })
          .catch((error: unknown) => {
            logger.warn("Failed to track local provider view:", error);
          });
        void trackUserInteraction({
          type: "view",
          providerId: data.id,
          serviceCategory: data.service_category,
        }).catch((error: unknown) => {
          logger.warn("Failed to track provider view:", error);
        });

        void getProviderReviews(data.id, { limit: PROFILE_REVIEWS_LIMIT })
          .then((rows) => {
            if (cancelled) return;
            setReviews(mapProviderReviews(rows));
            setReviewsLoadedAll(rows.length < PROFILE_REVIEWS_LIMIT);
          })
          .catch((error: unknown) => {
            logger.warn("Failed to load provider reviews:", error);
          })
          .finally(() => {
            if (!cancelled) setReviewsLoading(false);
          });

        void getProviderActivePromotions(data.id)
          .then((rows) => {
            if (!cancelled) setPromotions(rows);
          })
          .catch((error: unknown) => {
            logger.warn("Failed to load provider promotions:", error);
          });

        void getProviderPortfolio(data.id)
          .then((rows) => {
            if (!cancelled) setPortfolio(rows);
          })
          .catch((error: unknown) => {
            logger.warn("Failed to load provider portfolio:", error);
          });

        void AvailabilityService.getAvailabilitySummary(data.id, {
          includeExtendedSearch: false,
        })
          .then((summary) => {
            if (!cancelled) setAvailability(summary);
          })
          .catch((error: unknown) => {
            logger.warn("Failed to load provider availability summary:", error);
          })
          .finally(() => {
            if (!cancelled) setAvailabilityLoading(false);
          });

        void AvailabilityService.getWeeklyOpeningHours(data.id)
          .then((hours) => {
            if (!cancelled) setOpeningHours(hours);
          })
          .catch((error: unknown) => {
            logger.warn("Failed to load provider opening hours:", error);
          });

        void getProviderProfileViewerContext(data.id)
          .then((viewer) => {
            if (cancelled) return;
            if (viewer) {
              setCurrentUserId(viewer.userId);
              setCurrentUserName(viewer.displayName);
              setIsOwnProvider(viewer.isOwnProvider);
              setIsNotificationsEnabled(viewer.notificationsEnabled);
            }
            setViewerChecked(true);
          })
          .catch((error: unknown) => {
            logger.warn("Failed to load provider viewer context:", error);
            // Fail open in the UI only. Server-side booking authority still
            // prevents self-booking, while a transient viewer-state failure
            // must not freeze every legitimate client's booking entry point.
            if (!cancelled) setViewerChecked(true);
          });
      } catch (error: unknown) {
        if (!cancelled) setLoadFailed(true);
        logger.warn("Failed to load provider profile:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadProfile();
    return () => {
      cancelled = true;
      profileGenerationRef.current += 1;
    };
  }, [providerSlug]);

  const loadAllReviews = useCallback(async (): Promise<void> => {
    if (!providerDbId || reviewsLoadedAll || reviewsLoading) return;
    const generation = profileGenerationRef.current;
    setReviewsLoading(true);
    try {
      const rows = await getProviderReviews(providerDbId);
      if (profileGenerationRef.current !== generation) return;
      setReviews(mapProviderReviews(rows));
      setReviewsLoadedAll(true);
    } catch (error: unknown) {
      logger.warn("Failed to load all provider reviews:", error);
    } finally {
      if (profileGenerationRef.current === generation) {
        setReviewsLoading(false);
      }
    }
  }, [providerDbId, reviewsLoadedAll, reviewsLoading]);

  return {
    provider,
    providerDbId,
    loading,
    loadFailed,
    unclaimedProvider,
    reviews,
    reviewsLoading,
    reviewsLoadedAll,
    promotions,
    portfolio,
    availability,
    availabilityLoading,
    openingHours,
    currentUserId,
    currentUserName,
    isOwnProvider,
    viewerChecked,
    isNotificationsEnabled,
    setIsNotificationsEnabled,
    loadAllReviews,
  };
}
