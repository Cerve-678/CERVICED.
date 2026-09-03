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
    expect(sections).toContain("const INLINE_PORTFOLIO_LIMIT = 20");
    expect(sections).toContain("items.slice(0, INLINE_PORTFOLIO_LIMIT)");
    expect(sections).toContain("initialNumToRender={6}");
    expect(sections).toContain("maxToRenderPerBatch={6}");
    expect(sections).toContain("windowSize={5}");
    expect(sections).toContain("removeClippedSubviews={Platform.OS === \"android\"}");
    expect(sections).toContain("recyclingKey={item.id}");
  });
});
