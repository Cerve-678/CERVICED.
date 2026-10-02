import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("ProviderProfileScreen data architecture", () => {
  const source = readFileSync(
    join(__dirname, "../screens/client/ProviderProfileScreen.tsx"),
    "utf8",
  );

  it("uses the progressive hook instead of restoring the blocking loader", () => {
    expect(source).toContain("useProviderProfileData(providerId)");
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
});
