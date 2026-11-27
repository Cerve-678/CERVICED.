import { normalizeAsk } from "../services/becca/askNormaliser";
import { resolveMoney, resolveService } from "../services/becca/entityResolver";
import { understand } from "../services/becca/matcher";
import { menuNeedles } from "../services/becca/serviceCatalogue";
import { matchesAnySpeciality } from "../utils/fuzzyMatch";

/** Resolve the service the way the engine does: repair the ask, then read it. */
function service(message: string) {
  return resolveService(normalizeAsk(message))?.value;
}

describe("Becca knows the names of looks people search on Pinterest and TikTok", () => {
  it.each([
    ["can anyone do wispy lashes", "LASHES", "wispy lashes"],
    ["i want wispies", "LASHES", "wispy lashes"],
    ["who does kim k lashes near me", "LASHES", "kim k lashes"],
    ["doll eye lashes this week", "LASHES", "doll eye lashes"],
    ["fox eye lashes", "LASHES", "fox eye lashes"],
    ["anime lashes please", "LASHES", "anime lashes"],
    ["wet look lashes", "LASHES", "wet look lashes"],
    ["glazed donut nails", "NAILS", "glazed nails"],
    ["aura nails", "NAILS", "aura nails"],
    ["velvet nails", "NAILS", "cat eye nails"],
    ["cat eye nails", "NAILS", "cat eye nails"],
    ["milky white nails", "NAILS", "milky nails"],
    ["christmas nails", "NAILS", "christmas nails"],
    ["soap brows", "BROWS", "brow lamination"],
    ["fluffy brows", "BROWS", "brow lamination"],
    ["powder brows", "BROWS", "powder brows"],
    // Pinterest's own phrasing, years and adjectives included.
    ["wispy cat eye lashes", "LASHES", "cat eye lashes"],
    ["cat eye lash map", "LASHES", "cat eye lashes"],
    ["who does squirrel lashes", "LASHES", "squirrel lashes"],
    ["christmas nails 2026 classy", "NAILS", "christmas nails"],
    ["new years nails 2027", "NAILS", "new years nails"],
    ["winter nails 2026 ideas", "NAILS", "winter nails"],
  ])("reads %p as %s / %s", (message, category, specific) => {
    expect(service(message)).toMatchObject({ category, specific });
  });

  it.each(["who does kim k lashes", "new years nails 2027", "christmas nails 2026 classy"])(
    "sends %p to the provider search",
    (ask) => {
      const message = normalizeAsk(ask);
      const entities = { service: resolveService(message)! };
      expect(understand(message, entities, "client").capabilityId).toBe("discover.find");
    },
  );

  it("does not read the year in a Pinterest search as a price", () => {
    expect(resolveMoney(normalizeAsk("christmas nails 2026"))).toBeUndefined();
  });

  describe("a look word that means something else in another category stays there", () => {
    it.each([
      ["wispy fringe", "HAIR"],
      ["wet look hair", "HAIR"],
      ["glazed donut skin facial", "AESTHETICS"],
    ])("%p is not read as a lash or nail look", (message, category) => {
      expect(service(message)?.category).toBe(category);
    });

    it("a business called Aura is not a nail look", () => {
      expect(service("book with aura")).toBeUndefined();
    });
  });

  describe("a provider's menu names the look the way providers write it", () => {
    it("matches a one-word trend tag", () => {
      expect(matchesAnySpeciality(["kim-k"], menuNeedles("LASHES", "kim k lashes"))).toBe(true);
      expect(matchesAnySpeciality(["soap-brows"], menuNeedles("BROWS", "brow lamination"))).toBe(true);
      expect(matchesAnySpeciality(["cat-eye"], menuNeedles("NAILS", "cat eye nails"))).toBe(true);
      expect(matchesAnySpeciality(["squirrel-lashes"], menuNeedles("LASHES", "squirrel lashes"))).toBe(true);
    });

    it("matches a service name that carries the look's own word", () => {
      expect(matchesAnySpeciality(["Wispy Hybrid Set"], menuNeedles("LASHES", "wispy lashes"))).toBe(true);
      expect(matchesAnySpeciality(["Christmas Nail Art"], menuNeedles("NAILS", "christmas nails"))).toBe(true);
    });

    it("does not count a menu that only shares the category", () => {
      expect(matchesAnySpeciality(["Classic Set", "volume"], menuNeedles("LASHES", "wispy lashes"))).toBe(false);
      expect(matchesAnySpeciality(["Chrome", "nail art"], menuNeedles("NAILS", "glazed nails"))).toBe(false);
    });
  });
});
