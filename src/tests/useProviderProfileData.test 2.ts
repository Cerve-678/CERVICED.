import { renderHook, waitFor } from "@testing-library/react-native";

import { AvailabilityService } from "../services/AvailabilityService";
import {
  getProviderActivePromotions,
  getProviderBySlug,
  getProviderPortfolio,
  getProviderProfileViewerContext,
  getProviderReviews,
  trackUserInteraction,
} from "../services/databaseService";
import { getUnclaimedProviderDetail } from "../services/providerClaimService";
import userLearningService from "../services/userLearningService";
import { mapProviderProfileData } from "../features/providers/profileMapper";
import {
  mapProviderReviews,
  useProviderProfileData,
} from "../features/providers/useProviderProfileData";

jest.mock("../services/databaseService", () => ({
  getProviderActivePromotions: jest.fn(),
  getProviderBySlug: jest.fn(),
  getProviderPortfolio: jest.fn(),
  getProviderProfileViewerContext: jest.fn(),
  getProviderReviews: jest.fn(),
  trackUserInteraction: jest.fn(),
}));

jest.mock("../services/AvailabilityService", () => ({
  AvailabilityService: {
    getAvailabilitySummary: jest.fn(),
    getWeeklyOpeningHours: jest.fn(),
  },
}));

jest.mock("../services/providerClaimService", () => ({
  getUnclaimedProviderDetail: jest.fn(),
}));

jest.mock("../services/userLearningService", () => ({
  __esModule: true,
  default: { trackInteraction: jest.fn() },
}));

jest.mock("../features/providers/profileMapper", () => ({
  mapProviderProfileData: jest.fn(),
}));

const pending = <T>(): Promise<T> => new Promise<T>(() => {});

describe("useProviderProfileData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getUnclaimedProviderDetail as jest.Mock).mockResolvedValue(null);
    (userLearningService.trackInteraction as jest.Mock).mockResolvedValue(
      undefined,
    );
    (trackUserInteraction as jest.Mock).mockResolvedValue(undefined);
    (getProviderReviews as jest.Mock).mockReturnValue(pending());
    (getProviderActivePromotions as jest.Mock).mockReturnValue(pending());
    (getProviderPortfolio as jest.Mock).mockReturnValue(pending());
    (getProviderProfileViewerContext as jest.Mock).mockReturnValue(pending());
    (AvailabilityService.getAvailabilitySummary as jest.Mock).mockReturnValue(
      pending(),
    );
    (AvailabilityService.getWeeklyOpeningHours as jest.Mock).mockReturnValue(
      pending(),
    );
  });

  it("renders the profile shell without waiting for secondary requests", async () => {
    const mappedProfile = { id: "studio-a", profileTheme: "app" };
    (getProviderBySlug as jest.Mock).mockResolvedValue({
      id: "provider-1",
      slug: "studio-a",
      display_name: "Studio A",
      service_category: "HAIR",
    });
    (mapProviderProfileData as jest.Mock).mockReturnValue(mappedProfile);

    const { result } = renderHook(() => useProviderProfileData("studio-a"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.provider).toBe(mappedProfile);
    expect(result.current.providerDbId).toBe("provider-1");
    expect(result.current.reviewsLoading).toBe(true);
    expect(AvailabilityService.getAvailabilitySummary).toHaveBeenCalledWith(
      "provider-1",
      { includeExtendedSearch: false },
    );
  });

  it("maps review rows into display-safe values", () => {
    expect(
      mapProviderReviews([
        {
          id: "review-1",
          booking_id: "booking-1",
          user_id: "user-1",
          provider_id: "provider-1",
          service_id: null,
          rating: 5,
          comment: null,
          tip_amount: null,
          created_at: "2026-08-19T12:00:00.000Z",
          user: { name: "   ", avatar_url: null },
        },
      ]),
    ).toEqual([
      {
        id: "review-1",
        name: "Anonymous",
        rating: 5,
        comment: "",
        date: "19 Aug 2026",
      },
    ]);
  });
});
