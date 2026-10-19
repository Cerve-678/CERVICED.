import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  getLatestProviderClaimRequest,
  requestProviderClaim,
  type ProviderClaimRequestRow,
} from "../services/databaseService";
import {
  displayHandle,
  getPendingClaim,
  isClaimWorthShowing,
  loadListingClaim,
  parsePendingClaim,
  savePendingClaim,
  type ProviderClaim,
} from "../services/providerClaimService";

jest.mock("../services/databaseService", () => ({
  searchUnclaimedProviders: jest.fn(),
  getUnclaimedProviderDetail: jest.fn(),
  requestProviderClaim: jest.fn(),
  getLatestProviderClaimRequest: jest.fn(),
}));

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-19T18:00:00Z");

function row(overrides: Partial<ProviderClaimRequestRow> = {}): ProviderClaimRequestRow {
  return {
    id: "req-1",
    provider_id: "listing-1",
    listing_name: "fshairuk",
    instagram_handle: "fshairuk",
    bio_code: "CERVICED-04821",
    status: "pending",
    created_at: "2026-10-19T17:00:00Z",
    decided_at: null,
    ...overrides,
  };
}

function claim(overrides: Partial<ProviderClaim> = {}): ProviderClaim {
  return {
    id: "req-1",
    listingName: "fshairuk",
    instagramHandle: "fshairuk",
    bioCode: "CERVICED-04821",
    status: "pending",
    decidedAt: null,
    ...overrides,
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe("listing claims checked through Instagram", () => {
  it("shows a handle without its @ or spaces", () => {
    expect(displayHandle(" @@ginasnailstudio ")).toBe("ginasnailstudio");
    expect(displayHandle(null)).toBe("");
  });

  it("reads a stashed listing, including one stashed by the old email-code flow", () => {
    expect(parsePendingClaim('{"providerId":"listing-1"}')).toEqual({ providerId: "listing-1" });
    expect(parsePendingClaim('{"providerId":"listing-1","code":"123456"}')).toEqual({ providerId: "listing-1" });
    expect(parsePendingClaim('{"code":"123456"}')).toBeNull();
    expect(parsePendingClaim("not json")).toBeNull();
    expect(parsePendingClaim(null)).toBeNull();
  });

  it("always shows an open claim, a decided one for a week, a withdrawn one never", () => {
    expect(isClaimWorthShowing(claim(), NOW)).toBe(true);
    const decided = new Date(NOW - 6 * DAY).toISOString();
    expect(isClaimWorthShowing(claim({ status: "approved", decidedAt: decided }), NOW)).toBe(true);
    expect(isClaimWorthShowing(claim({ status: "rejected", decidedAt: decided }), NOW)).toBe(true);
    const old = new Date(NOW - 8 * DAY).toISOString();
    expect(isClaimWorthShowing(claim({ status: "approved", decidedAt: old }), NOW)).toBe(false);
    expect(isClaimWorthShowing(claim({ status: "withdrawn", decidedAt: decided }), NOW)).toBe(false);
  });

  it("opens the claim on a listing picked before signup and forgets the stash", async () => {
    await savePendingClaim({ providerId: "listing-1" });
    (requestProviderClaim as jest.Mock).mockResolvedValue(row());

    await expect(loadListingClaim("user-1")).resolves.toEqual(claim());
    expect(requestProviderClaim).toHaveBeenCalledWith("listing-1");
    expect(getLatestProviderClaimRequest).not.toHaveBeenCalled();
    await expect(getPendingClaim()).resolves.toBeNull();
  });

  it("keeps the stash after a network failure so the next visit tries again", async () => {
    await savePendingClaim({ providerId: "listing-1" });
    (requestProviderClaim as jest.Mock).mockRejectedValue(new Error("Network request failed"));

    await expect(loadListingClaim("user-1")).rejects.toThrow("Network request failed");
    await expect(getPendingClaim()).resolves.toEqual({ providerId: "listing-1" });
  });

  it("drops the stash once the server has said no", async () => {
    await savePendingClaim({ providerId: "listing-1" });
    (requestProviderClaim as jest.Mock).mockRejectedValue({
      code: "P0001",
      message: "This listing has already been claimed or removed.",
    });

    await expect(loadListingClaim("user-1")).rejects.toMatchObject({ code: "P0001" });
    await expect(getPendingClaim()).resolves.toBeNull();
  });

  it("without a stash, shows the latest claim only while it's worth showing", async () => {
    (getLatestProviderClaimRequest as jest.Mock).mockResolvedValue(row());
    await expect(loadListingClaim("user-1")).resolves.toEqual(claim());

    (getLatestProviderClaimRequest as jest.Mock).mockResolvedValue(
      row({ status: "withdrawn", decided_at: new Date().toISOString() }),
    );
    await expect(loadListingClaim("user-1")).resolves.toBeNull();

    (getLatestProviderClaimRequest as jest.Mock).mockResolvedValue(null);
    await expect(loadListingClaim("user-1")).resolves.toBeNull();
    expect(requestProviderClaim).not.toHaveBeenCalled();
  });
});
