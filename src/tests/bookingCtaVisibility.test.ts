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
  describe("the reported bug: the Book button must arrive WITH the card", () => {
    it("shows the CTA on the first paint, before the per-profile check returns", () => {
      // This is the exact frame the bug lived in. getProviderBySlug has just
      // resolved, so the service cards are rendering and providerDbId is set.
      // getProviderProfileViewerContext has NOT returned — it is a whole round
      // trip behind, chained after the provider fetch. Previously the gate was
      // `viewerChecked && !isOwnProvider`, so this frame rendered no booking
      // controls at all and they popped in later.
      expect(at({ viewerChecked: false })).toBe(true);
    });

    it("still shows it for a provider viewing a DIFFERENT provider's profile", () => {
      expect(
        at({ viewerChecked: false, myProviderId: "my-own-other-profile" }),
      ).toBe(true);
    });

    it("does not depend on the per-profile check to reach that state", () => {
      // Same input, only the slow check's arrival differs. The answer must not
      // change when it lands — otherwise the button would visibly appear or
      // disappear mid-load, which is the glitch in another form.
      expect(at({ viewerChecked: false })).toBe(at({ viewerChecked: true }));
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

    it("falls back to exactly the old behaviour when the session lookup failed", () => {
      // On the failed path the gate must reduce to `viewerChecked && !isOwnProvider`.
      for (const viewerChecked of [true, false]) {
        for (const isOwnProvider of [true, false]) {
          expect(
            at({ myProviderIdStatus: "failed", viewerChecked, isOwnProvider }),
          ).toBe(viewerChecked && !isOwnProvider);
        }
      }
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
      expect(
        at({ providerDbId: null, myProviderId: null, viewerChecked: true }),
      ).toBe(true);
    });
  });
});
