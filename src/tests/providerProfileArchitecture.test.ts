import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("ProviderProfileScreen data architecture", () => {
  const source = readFileSync(
    join(__dirname, "../screens/client/ProviderProfileScreen.tsx"),
    "utf8",
  );

  it("uses the progressive hook instead of restoring the blocking loader", () => {
    expect(source).toContain("useProviderProfileData(providerId, viewerOwnershipHint)");
    expect(source).not.toContain("getProviderBySlug(providerId)");
    expect(source).not.toContain("Promise.allSettled([");
  });

  it("answers ownership before the profile paints and delegates the CTA gate", () => {
    const auth = readFileSync(
      join(__dirname, "../contexts/AuthContext.tsx"),
      "utf8",
    );
    const gate = readFileSync(
      join(__dirname, "../features/providers/bookingCtaVisibility.ts"),
      "utf8",
    );

    expect(source).toContain("const { myProviderId, myProviderIdStatus } = useAuth()");
    expect(source).toContain('myProviderIdStatus === "resolved" ? myProviderId : undefined');
    expect(source).toContain("const canBookProvider = shouldShowBookingCta({");
    expect(auth).toContain("getProviderIdForUserId");
    expect(auth).toContain("}, [user?.id, user?.accountType]);");
    expect(gate).toContain('myProviderIdStatus === "resolved"');
    expect(source).not.toContain("const canBookProvider = viewerChecked && !isOwnProvider;");
  });

  it("keeps state-independent profile sections outside the screen component", () => {
    for (const section of [
      "ProviderSpecialtiesSection",
      "ProviderReviewPreviewSection",
      "ProviderContactSection",
      "ProviderOpeningHoursSection",
      "ProviderPortfolioSection",
      "ProviderAdditionalInfoSection",
    ]) {
      expect(source).toContain(`<${section}`);
    }
    expect(source).not.toContain("portfolioColumns.map(");
    expect(source).not.toContain("reviews.slice(0, 5).map(");
  });

  it("caps inline media and virtualizes the full portfolio", () => {
    const sections = readFileSync(
      join(__dirname, "../features/providers/ProviderProfileSections.tsx"),
      "utf8",
    );

    expect(sections).toContain("React.memo(function ProviderPortfolioSection");
    expect(sections).toContain("const INLINE_PORTFOLIO_LIMIT = 6");
    expect(sections).toContain("items.slice(0, INLINE_PORTFOLIO_LIMIT)");
    expect(sections).toContain("initialNumToRender={6}");
    expect(sections).toContain("maxToRenderPerBatch={6}");
    expect(sections).toContain("windowSize={5}");
    expect(sections).toContain("removeClippedSubviews={Platform.OS === \"android\"}");
    expect(sections).toContain("recyclingKey={item.id}");
  });

  it("keeps the black safe-area treatment on the provider's own profile only", () => {
    const myProfileSource = readFileSync(
      join(__dirname, "../screens/provider/ProviderMyProfileScreen.tsx"),
      "utf8",
    );
    const tintContextSource = readFileSync(
      join(__dirname, "../contexts/StatusBarTintContext.tsx"),
      "utf8",
    );

    // The public/client profile owns its existing transparent navigation
    // header and must not change the app-wide safe-area strip for Black.
    expect(source).not.toContain("useDarkTopArea");

    // Only My Profile has the black hero/safe-area requirement. Base the
    // decision on the rendered hero, not the pale card palette used by Black.
    // Matched loosely: the claim also has to drop once pale content scrolls
    // under the status bar, or the clock vanishes into it, so the condition
    // carries more than these three terms. The terms are the contract.
    expect(myProfileSource).toMatch(
      /useDarkTopArea\([^;]*!isLoading[^;]*providerData[^;]*heroIsDark/,
    );

    // A focused-screen claim must be released when the screen blurs/unmounts,
    // otherwise the next screen inherits a stale black status-bar strip.
    expect(tintContextSource).toContain("const isFocused = useIsFocused()");
    expect(tintContextSource).toContain("return () => release(id)");
  });

  it("answers profile ownership from the session, not a per-visit round trip", () => {
    // The Book button used to appear only after getProviderProfileViewerContext
    // resolved — a whole round trip chained behind the provider fetch, so the
    // profile painted with no booking controls and they popped in afterwards.
    // Ownership is now resolved once per session in AuthContext, which is what
    // lets the button paint with the rest of the service card.
    expect(source).toContain("useAuth()");
    expect(source).toContain("myProviderId");
    expect(source).toContain("myProviderIdStatus");
    expect(source).not.toContain("const canBookProvider = viewerChecked && !isOwnProvider");

    const auth = readFileSync(
      join(__dirname, "../contexts/AuthContext.tsx"),
      "utf8",
    );
    expect(auth).toContain("getProviderIdForUserId");
    // upgradeToProvider and the claim flow both create the provider row
    // mid-session and flip accountType; without it as a dep a new provider
    // keeps the null they resolved to at login and gets offered Book on their
    // own profile.
    expect(auth).toContain("}, [user?.id, user?.accountType]);");
  });

  it("does not mistake a failed ownership lookup for owning nothing", () => {
    // Both outcomes leave myProviderId null. Collapsing them into one boolean
    // meant a single transient failure at login offered the provider a Book
    // button on their own profile — not for a frame, but on every visit for
    // the rest of the session, since the lookup is cached and not retried.
    const auth = readFileSync(
      join(__dirname, "../contexts/AuthContext.tsx"),
      "utf8",
    );
    expect(auth).toContain("'pending' | 'resolved' | 'failed'");
    expect(auth).toContain("setMyProviderIdStatus('failed')");

    // The gate consults the status, not just the id — the two nulls
    // ('resolved: owns none' and 'failed: unknown') must not be conflated.
    // What it does with each is pinned in bookingCtaVisibility.test.ts.
    const gate = readFileSync(
      join(__dirname, "../features/providers/bookingCtaVisibility.ts"),
      "utf8",
    );
    expect(gate).toContain('myProviderIdStatus === "resolved"');
  });

  it("delegates the booking-CTA gate rather than inlining it", () => {
    // The gate's interesting states are all mid-load and pass too quickly to
    // inspect in a running app, so the decision lives in a pure function with
    // its own truth-table test (bookingCtaVisibility.test.ts). This only
    // pins that the screen still routes through it.
    expect(source).toContain("shouldShowBookingCta({");
    expect(source).toContain("const canBookProvider = shouldShowBookingCta(");
    // The original gate, which made every client wait a round trip.
    expect(source).not.toContain("const canBookProvider = viewerChecked && !isOwnProvider");
  });

  it("resolves an owned provider id deterministically and does not swallow the error", () => {
    const db = readFileSync(
      join(__dirname, "../services/databaseService.ts"),
      "utf8",
    );
    const fn = db.slice(
      db.indexOf("export async function getProviderIdForUserId"),
      db.indexOf("export async function getProviderBrandingByUserId"),
    );
    expect(fn).toContain("getProviderIdForUserId");
    // Duplicate provider rows exist in this database: a bare .maybeSingle()
    // errors on >1 row instead of picking, and must pick the same row
    // getProviderProfileForUserId does.
    expect(fn).toContain('.order("is_active", { ascending: false })');
    expect(fn).toContain('.order("created_at", { ascending: true })');
    expect(fn).toContain(".limit(1)");
    // Never report "owns no provider profile" for a query that actually failed.
    expect(fn).toContain("if (error) throw error;");
  });
});
