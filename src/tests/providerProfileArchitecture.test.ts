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
    expect(sections).toContain("const INLINE_PORTFOLIO_LIMIT = 8");
    expect(sections).toContain("items.slice(0, INLINE_PORTFOLIO_LIMIT)");
    expect(sections).toContain("initialNumToRender={6}");
    expect(sections).toContain("maxToRenderPerBatch={6}");
    expect(sections).toContain("windowSize={5}");
    expect(sections).toContain("removeClippedSubviews={Platform.OS === \"android\"}");
    expect(sections).toContain("recyclingKey={item.id}");
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

    // The screen trusts the session answer only when it actually resolved,
    // and falls back to the per-profile check otherwise.
    expect(source).toContain(
      'myProviderIdStatus === "resolved" && providerDbId !== null',
    );
    expect(source).toContain(
      "isOwnProvider || (sessionOwnershipKnown && myProviderId === providerDbId)",
    );
  });

  it("still withholds booking controls until ownership is actually known", () => {
    // The safety property the gate exists for: a provider must never see a
    // "Book" button on their own profile, not even for one frame. Either
    // ownership check settling is enough to know, but one of them must.
    expect(source).toContain("const canBookProvider = ownershipResolved && !ownsThisProfile;");
    expect(source).toContain("const ownershipResolved = viewerChecked || sessionOwnershipKnown;");
    // The per-profile check stays the authority and can still take the
    // controls away if the two ever disagree.
    expect(source).toContain("isOwnProvider ||");
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
