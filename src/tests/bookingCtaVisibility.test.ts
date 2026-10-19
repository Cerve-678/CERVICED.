import { shouldShowBookingCta } from "../features/providers/bookingCtaVisibility";
import type { BookingCtaInput } from "../features/providers/bookingCtaVisibility";

/** A client browsing someone else's profile, everything settled. */
const base: BookingCtaInput = {
  providerDbId: "provider-being-viewed",
  myProviderId: null,
  myProviderIdStatus: "resolved",
  isOwnProvider: false,
  viewerChecked: true,
};

const at = (over: Partial<BookingCtaInput>): boolean =>
  shouldShowBookingCta({ ...base, ...over });

describe("booking CTA visibility on a provider profile", () => {
  describe("ownership is fail-closed", () => {
    it("withholds the CTA until the per-profile ownership check returns", () => {
      expect(at({ viewerChecked: false })).toBe(false);
    });
  });

  describe("the safety property: never offer an owner their own Book button", () => {
    it("withholds the CTA on your own profile, from the very first paint", () => {
      expect(
        at({
          viewerChecked: false,
          myProviderId: "provider-being-viewed",
        }),
      ).toBe(false);
    });

    it("withholds it when the session lookup FAILED and the slow check has not landed", () => {
      // The regression security review caught. A failed lookup also leaves
      // myProviderId null, so treating it as an answer would read "owns
      // nothing" and hand the owner a Book button on their own profile — on
      // every visit, since the lookup is cached per session and not retried.
      expect(
        at({ myProviderIdStatus: "failed", viewerChecked: false }),
      ).toBe(false);
    });

    it("withholds it while the session lookup is still pending", () => {
      expect(
        at({ myProviderIdStatus: "pending", viewerChecked: false }),
      ).toBe(false);
    });

    it("lets the authoritative per-profile check overrule a stale session answer", () => {
      // If the two ever disagree, the per-profile check wins and takes the
      // controls away — e.g. a profile claimed mid-session.
      expect(
        at({ isOwnProvider: true, myProviderId: null }),
      ).toBe(false);
    });

    it("allows another profile after a failed session lookup only once the viewer check confirms it", () => {
      expect(at({ myProviderIdStatus: "failed", viewerChecked: true, isOwnProvider: false })).toBe(true);
      expect(at({ myProviderIdStatus: "failed", viewerChecked: false, isOwnProvider: false })).toBe(false);
    });
  });

  describe("while the profile itself is still loading", () => {
    it("withholds the CTA until there is a profile to compare against", () => {
      // No providerDbId yet: nothing to compare ownership to, and no service
      // cards on screen to attach a button to either.
      expect(at({ providerDbId: null, viewerChecked: false })).toBe(false);
    });

    it("never treats a null profile id as matching a null owned id", () => {
      // Both null must not read as "these are the same profile".
      expect(at({ providerDbId: null, myProviderId: null, viewerChecked: true })).toBe(false);
    });
  });
});
