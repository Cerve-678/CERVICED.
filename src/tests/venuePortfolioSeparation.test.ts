import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  VENUE_PORTFOLIO_CATEGORY,
  isVenuePhoto,
  splitPortfolioByKind,
} from "../features/providers/venuePhotos";

/**
 * A venue photo is a picture of the room, not of the provider's work. It lives
 * in portfolio_items alongside the work gallery, so every surface that renders
 * or counts that table has to apply the same split: Additional Information on
 * the client's profile, never the Portfolio grid, and never Explore's
 * inspiration feed. The rule kept getting re-implemented as a local filter,
 * which is how the provider's own preview and photo counts ended up disagreeing
 * with what a client actually sees.
 */
const item = (id: string, category: string | null) => ({ id, category });

describe("venue photos are split from the work gallery", () => {
  it("routes venue-stamped rows away from the work gallery", () => {
    const { work, venue } = splitPortfolioByKind([
      item("a", "NAILS"),
      item("b", VENUE_PORTFOLIO_CATEGORY),
      item("c", "HAIR"),
    ]);
    expect(work.map((i) => i.id)).toEqual(["a", "c"]);
    expect(venue.map((i) => i.id)).toEqual(["b"]);
  });

  it("treats a category-less legacy row as work, not venue", () => {
    // Rows predating the venue uploader have a NULL category. Bucketing them
    // as venue would silently pull real work out of the portfolio grid and
    // out of Explore.
    const { work, venue } = splitPortfolioByKind([item("a", null), item("b", undefined as never)]);
    expect(work).toHaveLength(2);
    expect(venue).toHaveLength(0);
    expect(isVenuePhoto(item("a", null))).toBe(false);
  });

  it("stores the category lowercase, unlike every real service category", () => {
    // Service categories are uppercased at query time (`category.toUpperCase()`
    // in getPortfolioItems), so a lowercase value can never collide with one.
    expect(VENUE_PORTFOLIO_CATEGORY).toBe("venue");
    expect(VENUE_PORTFOLIO_CATEGORY).toBe(VENUE_PORTFOLIO_CATEGORY.toLowerCase());
  });

  it("declares the category value exactly once", () => {
    // A second literal is a second definition that can drift — the reason the
    // provider editor and the client profile disagreed about where these land.
    const hits = execSync(
      `grep -rln "['\\"]venue['\\"]" src --include=*.ts --include=*.tsx || true`,
      { cwd: process.cwd(), encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean)
      .filter((f) => !f.includes("/tests/"))
      .filter((f) => !f.endsWith("features/providers/venuePhotos.ts"))
      // databaseService only mentions it inside a comment explaining the SQL.
      .filter((f) => !f.endsWith("services/databaseService.ts"));
    expect(hits).toEqual([]);
  });

  it("excludes venue rows from every portfolio query that returns work", () => {
    // getPortfolioItems (Explore's feed), searchPortfolio (Becca + text
    // search) and getSavedPortfolioDetails (Explore's Favourites tab) return
    // other providers' rows; getProviderPortfolio returns one provider's work
    // half. Each needs the is-null OR neq form: a bare .neq() drops
    // NULL-category legacy rows too.
    //
    // getProviderPortfolio joined this list when its row cap moved into SQL.
    // It used to fetch work and venue as one capped list and let each caller
    // split afterwards, which meant venue shots ate the work gallery's budget.
    const source = readFileSync("src/services/databaseService.ts", "utf8");
    const clause = "category.is.null,category.neq.${VENUE_PORTFOLIO_CATEGORY}";
    expect(source.split(clause).length - 1).toBe(4);
  });
});
