import { shouldShowBookingCta } from "../features/providers/bookingCtaVisibility";
import type { BookingCtaInput } from "../features/providers/bookingCtaVisibility";

const base: BookingCtaInput = {
  providerDbId: "viewed-provider",
  myProviderId: null,
  myProviderIdStatus: "resolved",
  isOwnProvider: false,
  viewerChecked: true,
};

const at = (overrides: Partial<BookingCtaInput>): boolean =>
  shouldShowBookingCta({ ...base, ...overrides });

describe("provider-profile booking CTA visibility", () => {
  it("paints Book with the first service-card frame", () => {
    expect(at({ viewerChecked: false })).toBe(true);
  });

  it("does not change when the slower viewer check finishes", () => {
    expect(at({ viewerChecked: false })).toBe(at({ viewerChecked: true }));
  });

  it("withholds Book from the owner on the first frame", () => {
    expect(at({ viewerChecked: false, myProviderId: "viewed-provider" })).toBe(false);
  });

  it("treats pending or failed session lookups as unknown", () => {
    expect(at({ myProviderIdStatus: "pending", viewerChecked: false })).toBe(false);
    expect(at({ myProviderIdStatus: "failed", viewerChecked: false })).toBe(false);
  });

  it("falls back to the authoritative profile result after session failure", () => {
    expect(at({ myProviderIdStatus: "failed", viewerChecked: true })).toBe(true);
    expect(at({ myProviderIdStatus: "failed", viewerChecked: true, isOwnProvider: true })).toBe(false);
  });

  it("lets the per-profile answer overrule stale session state", () => {
    expect(at({ isOwnProvider: true })).toBe(false);
  });
});
