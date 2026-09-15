import { normalizeAsk } from "../services/becca/askNormaliser";
import { resolveService } from "../services/becca/entityResolver";
import { understand } from "../services/becca/matcher";
import { NEAR_ME_RE } from "../services/becca/capabilities/shared";
import type { EntityBag } from "../services/becca/types";

/** The service entity the resolver would produce, so routing can be tested alone. */
function withService(category: string, specific?: string): EntityBag {
  return {
    service: {
      kind: "service",
      value: { category, ...(specific ? { specific } : {}) },
      confidence: 1,
      sourceText: specific ?? category.toLowerCase(),
      label: specific ?? category.toLowerCase(),
    },
  };
}

/** Route a message the way the engine does: repair it, then match. */
function route(message: string, entities: EntityBag = {}) {
  return understand(normalizeAsk(message), entities, "client");
}

describe("Becca understands how people actually ask", () => {
  describe("the ask is repaired before anything reads it", () => {
    it("joins words that get typed as two", () => {
      expect(normalizeAsk("is there any one who can do lashes")).toBe(
        "is there anyone who can do lashes",
      );
    });

    it("fixes beauty vocabulary the catalogue owns", () => {
      expect(normalizeAsk("i want to do allmond")).toBe("i want to do almond");
      expect(normalizeAsk("can u do baliage")).toBe("can you do balayage");
      expect(normalizeAsk("wanna book a manicour")).toBe("want to book a manicure");
    });

    it("leaves an ordinary promo code's case alone", () => {
      // discover.promocode identifies a code by /\b[A-Z0-9]{4,}\b/, so a
      // blanket lowercase here would delete the only signal it has.
      //
      // This covers codes the rewrite table never touches. A code that DOES
      // spell a beauty word ("BALAYAGE") is corrected like any other spelling
      // of it, and is protected further downstream instead — see
      // beccaPromoCodeCase.test.ts and CapabilityContext.verbatimMessage.
      expect(normalizeAsk("is SAVE20 still valid")).toBe("is SAVE20 still valid");
    });

    it("never rewrites a provider's name into a service word", () => {
      // "Mani" is a plausible provider name AND a catalogue keyword. A general
      // spellchecker would collapse the two; an explicit rewrite list can't.
      expect(normalizeAsk("book with Mani")).toBe("book with Mani");
    });
  });

  describe("a shape is a complete request", () => {
    it("resolves a misspelled nail shape to nails", () => {
      const resolved = resolveService(normalizeAsk("i want to do allmond"));
      expect(resolved?.value.category).toBe("NAILS");
    });

    it("claims no specific service for a shape", () => {
      // No provider lists "almond" as a bookable service — a `specific` here
      // would be matched against real service names and find nothing.
      expect(resolveService("almond nails")?.value.specific).toBeUndefined();
    });
  });

  describe("conversational openers reach the search", () => {
    it.each([
      "is there anyone who can do lashes",
      "is there any one who can do lashes",
      "does anybody do lashes",
      "i am looking for a lash tech",
      "someone who does lashes",
      "im after lashes",
      "can i get lashes done",
    ])("routes %p to the provider search", (message) => {
      expect(route(message, withService("LASHES")).capabilityId).toBe("discover.find");
    });

    it("routes a want with no search verb in it at all", () => {
      expect(route("i want to do allmond", withService("NAILS")).capabilityId).toBe(
        "discover.find",
      );
    });
  });

  describe("job titles, singular and plural", () => {
    // containsPhrase is word-boundary exact, so "hairdressers" does not match
    // the keyword "hairdresser". Every job title needs both forms spelled out
    // or the plural — which is how people phrase it when they want options —
    // resolves no service at all, and the ask loses the category it named.
    it.each([
      ["hairdressers", "HAIR"],
      ["nail techs", "NAILS"],
      ["lash technicians", "LASHES"],
      ["brow artists", "BROWS"],
      ["beauticians", "AESTHETICS"],
      ["barbers", "MALE"],
    ])("resolves %p to %s", (word, category) => {
      expect(resolveService(word)?.value.category).toBe(category);
    });

    it("keeps the category on a plural ask with a location clause", () => {
      const resolved = resolveService(normalizeAsk("any good hairdressers nearby"));
      expect(resolved?.value.category).toBe("HAIR");
    });
  });

  describe("proximity", () => {
    it("answers a bare proximity question on its own terms", () => {
      // discover.find requires a service, so this used to be turned back with
      // "which service?" rather than answered.
      expect(route("see who is near me").capabilityId).toBe("discover.nearby");
    });

    it("lets the rating clause pick the list when both are asked for", () => {
      expect(route("see who is near me top rated").capabilityId).toBe("discover.top");
    });

    it("recognises a location clause as a modifier", () => {
      expect(NEAR_ME_RE.test("find nail techs near me")).toBe(true);
      expect(NEAR_ME_RE.test("anyone nearby")).toBe(true);
      expect(NEAR_ME_RE.test("providers in my area")).toBe(true);
    });

    it("does not read a closed day as a proximity request", () => {
      expect(NEAR_ME_RE.test("what time do they close")).toBe(false);
      expect(NEAR_ME_RE.test("are they closed on monday")).toBe(false);
    });
  });
});

describe("Becca keeps every clause of a two-part ask", () => {
  it("keeps the service when a location clause has no verb", () => {
    // "nail techs near me" has no search verb at all. Without a proximity
    // phrase on discover.find, this scored on the service entity alone and
    // lost to discover.nearby — which would have answered with everyone
    // nearby and dropped the service the client named.
    const result = understand(
      normalizeAsk("nail techs near me"),
      withService("NAILS"),
      "client",
    );
    expect(result.capabilityId).toBe("discover.find");
  });

  it("keeps the rating when the client also asks for nearby", () => {
    expect(understand(normalizeAsk("best rated near me"), {}, "client").capabilityId).toBe(
      "discover.top",
    );
  });
});
