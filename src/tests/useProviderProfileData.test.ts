import { act, renderHook, waitFor } from "@testing-library/react-native";

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
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

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
    expect(result.current.viewerChecked).toBe(false);
    expect(AvailabilityService.getAvailabilitySummary).toHaveBeenCalledWith(
      "provider-1",
      { includeExtendedSearch: false },
    );
  });

  it("keeps auto-booking gated until viewer ownership settles", async () => {
    const viewer = deferred<null>();
    (getProviderBySlug as jest.Mock).mockResolvedValue({
      id: "provider-1",
      slug: "studio-a",
      display_name: "Studio A",
      service_category: "HAIR",
    });
    (mapProviderProfileData as jest.Mock).mockReturnValue({ id: "studio-a" });
    (getProviderProfileViewerContext as jest.Mock).mockReturnValue(
      viewer.promise,
    );

    const { result } = renderHook(() => useProviderProfileData("studio-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.viewerChecked).toBe(false);

    await act(async () => viewer.resolve(null));
    await waitFor(() => expect(result.current.viewerChecked).toBe(true));
    expect(result.current.isOwnProvider).toBe(false);
  });

  it("ignores a stale profile response after the route slug changes", async () => {
    const oldProfile = deferred<Record<string, unknown>>();
    (getProviderBySlug as jest.Mock).mockImplementation((slug: string) =>
      slug === "studio-old"
        ? oldProfile.promise
        : Promise.resolve({
            id: "provider-new",
            slug: "studio-new",
            display_name: "Studio New",
            service_category: "HAIR",
          }),
    );
    (mapProviderProfileData as jest.Mock).mockImplementation(
      (row: { slug: string }) => ({ id: row.slug }),
    );

    const { result, rerender } = renderHook(
      ({ slug }: { slug: string }) => useProviderProfileData(slug),
      { initialProps: { slug: "studio-old" } },
    );
    rerender({ slug: "studio-new" });
    await waitFor(() => expect(result.current.provider?.id).toBe("studio-new"));

    await act(async () =>
      oldProfile.resolve({
        id: "provider-old",
        slug: "studio-old",
        display_name: "Studio Old",
        service_category: "HAIR",
      }),
    );
    expect(result.current.provider?.id).toBe("studio-new");
  });

  it("maps review rows into display-safe values", () => {
    expect(
      mapProviderReviews([
        {
          id: "review-1",
          user_id: "user-1",
          provider_id: "provider-1",
          rating: 5,
          comment: null,
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
