import { closureReasonForClient } from './scheduleClosure';
import { useCallback, useEffect, useRef, useState } from "react";

import { AvailabilityService } from "../../services/AvailabilityService";
import type { WeeklyOpeningHoursDay } from "../../services/AvailabilityService";
import {
  getProviderActivePromotions,
  getProviderClosureReason,
  isProviderTakingBookings,
  getProviderBySlug,
  getProviderProfilePreviewBySlug,
  getProviderPortfolio,
  getProviderProfileViewerContext,
  peekCachedProviderProfile,
  getProviderReviews,
  trackUserInteraction,
} from "../../services/databaseService";
import { getUnclaimedProviderDetail } from "../../services/providerClaimService";
import type { UnclaimedProviderDetail } from "../../services/providerClaimService";
import userLearningService from "../../services/userLearningService";
import type { ClientPromotion, DbPortfolioItem } from "../../types/database";
import { logger } from "../../utils/logger";
import { isProviderProfileUuid } from "../../utils/providerProfileLink";
import { mapProviderProfileData } from "./profileMapper";
import type { ProviderProfileData } from "./profileTypes";
import { mapProviderReviews } from "./reviewPresentation";
import type { ProviderReviewItem } from "./reviewPresentation";

const PROFILE_REVIEWS_LIMIT = 10;

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
  /** Already split by getProviderPortfolio's own SQL, not divided again
   *  here — the work gallery and the venue/workspace shots have separate
   *  row caps and render in two different places on the profile. */
  portfolio: { work: DbPortfolioItem[]; venue: DbPortfolioItem[] };
  portfolioLoading: boolean;
  portfolioError: boolean;
  reloadPortfolio: () => Promise<void>;
  openingHours: WeeklyOpeningHoursDay[] | null;
  openingHoursLoading: boolean;
  /** False only once the server says this provider has closed their schedule. */
  takingBookings: boolean;
  /** Set only when closed and the provider chose to tell clients why. */
  closureReason: string | null;
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
  knownOwnedProviderId?: string | null,
): ProviderProfileDataState {
  const profileGenerationRef = useRef(0);
  // Keep this current without making a settled AuthContext update restart the
  // public-profile load. `undefined` means the ownership lookup is not ready.
  const knownOwnedProviderIdRef = useRef<string | null | undefined>(
    knownOwnedProviderId,
  );
  knownOwnedProviderIdRef.current = knownOwnedProviderId;
  // A profile already in the cache (an Explore prefetch, or My Profile's logo
  // tap) draws on the first frame. Starting on the skeleton and swapping a
  // frame later read as a flash, most of all on the logo preview.
  const [seed] = useState(() => {
    const cached = peekCachedProviderProfile(providerSlug);
    return cached ? { profile: mapProviderProfileData(cached), id: cached.id } : null;
  });
  const [provider, setProvider] = useState<ProviderProfileData | null>(seed?.profile ?? null);
  const [providerDbId, setProviderDbId] = useState<string | null>(seed?.id ?? null);
  const [loading, setLoading] = useState(!seed);
  const keepSeedRef = useRef(seed !== null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [unclaimedProvider, setUnclaimedProvider] =
    useState<UnclaimedProviderDetail | null>(null);
  const [reviews, setReviews] = useState<ProviderReviewItem[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsLoadedAll, setReviewsLoadedAll] = useState(false);
  const [promotions, setPromotions] = useState<ClientPromotion[]>([]);
  const [portfolio, setPortfolio] = useState<{
    work: DbPortfolioItem[];
    venue: DbPortfolioItem[];
  }>({ work: [], venue: [] });
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioError, setPortfolioError] = useState(false);
  const portfolioRequestRef = useRef(0);
  const [openingHours, setOpeningHours] = useState<
    WeeklyOpeningHoursDay[] | null
  >(null);
  const [openingHoursLoading, setOpeningHoursLoading] = useState(true);
  const [takingBookings, setTakingBookings] = useState(true);
  const [closureReason, setClosureReason] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState("");
  const [isOwnProvider, setIsOwnProvider] = useState(false);
  const [viewerChecked, setViewerChecked] = useState(false);
  const [isNotificationsEnabled, setIsNotificationsEnabled] = useState(false);

  const loadPortfolio = useCallback(async (id: string): Promise<void> => {
    const request = ++portfolioRequestRef.current;
    setPortfolioLoading(true);
    setPortfolioError(false);
    try {
      const rows = await getProviderPortfolio(id, { includeVenue: true });
      if (request === portfolioRequestRef.current) setPortfolio(rows);
    } catch (error: unknown) {
      if (request === portfolioRequestRef.current) {
        setPortfolioError(true);
        logger.warn("Failed to load provider portfolio:", error);
      }
    } finally {
      if (request === portfolioRequestRef.current) setPortfolioLoading(false);
    }
  }, []);
  const reloadPortfolio = useCallback(
    () => providerDbId ? loadPortfolio(providerDbId) : Promise.resolve(),
    [providerDbId, loadPortfolio],
  );

  useEffect(() => {
    profileGenerationRef.current += 1;
    portfolioRequestRef.current += 1;
    let cancelled = false;
    // The first run keeps the first frame's cached copy; a later slug change
    // looks in the cache again.
    if (keepSeedRef.current) {
      keepSeedRef.current = false;
    } else {
      const cached = peekCachedProviderProfile(providerSlug);
      setProvider(cached ? mapProviderProfileData(cached) : null);
      setProviderDbId(cached?.id ?? null);
      setLoading(!cached);
    }
    setLoadFailed(false);
    setUnclaimedProvider(null);
    setReviews([]);
    setReviewsLoading(true);
    setReviewsLoadedAll(false);
    setPromotions([]);
    setPortfolio({ work: [], venue: [] });
    setPortfolioLoading(true);
    setPortfolioError(false);
    setOpeningHours(null);
    setOpeningHoursLoading(true);
    setTakingBookings(true);
    setClosureReason(null);
    setCurrentUserId(null);
    setCurrentUserName("");
    setIsOwnProvider(false);
    setViewerChecked(false);
    setIsNotificationsEnabled(false);

    const loadProfile = async (): Promise<void> => {
      try {
        // Start the catalogue request straight away, but let the compact
        // profile response paint the hero first. A service-heavy provider no
        // longer makes a client wait for every image and add-on before they
        // can see whose profile they opened.
        const fullProfileRequest = getProviderBySlug(providerSlug).catch(
          (error: unknown) => {
            logger.warn("Failed to load full provider catalogue:", error);
            return null;
          },
        );
        let data = await getProviderProfilePreviewBySlug(providerSlug);
        if (!data) data = await fullProfileRequest;
        if (cancelled) return;
        if (!data) {
          // Unclaimed directory listings are only ever opened by their UUID,
          // and the lookup matches providers.id (a uuid column). Passing a
          // slug — which is what the cart, Home and Explore send — makes
          // Postgres reject the query, so a provider that has simply gone
          // offline showed "Could not load provider" instead of "not found".
          const unclaimed = isProviderProfileUuid(providerSlug)
            ? await getUnclaimedProviderDetail(providerSlug)
            : null;
          if (!cancelled) setUnclaimedProvider(unclaimed);
          return;
        }

        setProvider(mapProviderProfileData(data));
        setProviderDbId(data.id);
        setLoading(false);

        // Replace the lightweight first paint once the complete catalogue
        // returns. Secondary sections below already use the provider id and
        // can start loading from the preview without waiting for this.
        void fullProfileRequest.then((fullProfile) => {
          if (!cancelled && fullProfile) {
            setProvider(mapProviderProfileData(fullProfile));
          }
        });

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

        // includeVenue: the client profile renders venue/workspace shots
        // inside Additional Information, so it needs both halves — it is one
        // of the two callers getProviderPortfolio's second query exists for.
        void loadPortfolio(data.id);

        void AvailabilityService.getWeeklyOpeningHours(data.id)
          .then((hours) => {
            if (!cancelled) setOpeningHours(hours);
          })
          .catch((error: unknown) => {
            logger.warn("Failed to load provider opening hours:", error);
          })
          .finally(() => {
            if (!cancelled) setOpeningHoursLoading(false);
          });

        // The label only: the server refuses the booking either way, so a
        // failed lookup leaves the buttons as they are rather than hiding them.
        void isProviderTakingBookings(data.id)
          .then((taking) => {
            if (!cancelled) setTakingBookings(taking);
            return taking ? null : getProviderClosureReason(data.id);
          })
          .then((reason) => {
            if (!cancelled) setClosureReason(closureReasonForClient(reason));
          })
          .catch((error: unknown) => {
            logger.warn("Failed to check whether provider is taking bookings:", error);
          });

        // Booking authority is fail-closed. Never show a booking control
        // until this ownership lookup has answered: a timeout must not turn
        // an owner into a client for even one tappable frame. When
        // AuthContext has already settled who this viewer owns, reuse that
        // answer instead of issuing another providers lookup per profile.
        const viewerContextRequest = knownOwnedProviderIdRef.current === undefined
          ? getProviderProfileViewerContext(data.id)
          : getProviderProfileViewerContext(
              data.id,
              knownOwnedProviderIdRef.current,
            );
        void viewerContextRequest
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
      portfolioRequestRef.current += 1;
    };
  }, [providerSlug, loadPortfolio]);

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
    portfolioLoading,
    portfolioError,
    reloadPortfolio,
    openingHours,
    openingHoursLoading,
    takingBookings,
    closureReason,
    currentUserId,
    currentUserName,
    isOwnProvider,
    viewerChecked,
    isNotificationsEnabled,
    setIsNotificationsEnabled,
    loadAllReviews,
  };
}
