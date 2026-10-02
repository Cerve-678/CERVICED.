import { validatePromoCode } from "../services/databaseService";
import { normalizeAsk } from "../services/becca/askNormaliser";
import { getCapability } from "../services/becca/registry";
import type { CapabilityContext } from "../services/becca/types";

jest.mock("../services/databaseService", () => ({
  validatePromoCode: jest.fn(),
}));

const mockedValidatePromoCode = validatePromoCode as jest.MockedFunction<
  typeof validatePromoCode
>;

/**
 * A promo code is identified by its SHAPE — /\b[A-Z0-9]{4,}\b/, uppercase and
 * no `i` flag — while `askNormaliser` corrects spelling case-insensitively and
 * substitutes lowercase. So a code that happens to spell a beauty word is the
 * one input where "the text Becca understood" and "the text the user typed"
 * must not be the same string.
 *
 * Without `verbatimMessage`, "is BALAYAGE still valid" reached this capability
 * as "is balayage still valid", matched no candidate, and the client — who had
 * typed the code correctly, in full — was asked what the code was.
 */
function context(typed: string): CapabilityContext {
  return {
    entities: {
      provider: {
        kind: "provider",
        value: { slug: "lola-studio", dbId: "provider-1", displayName: "Lola Studio" },
        confidence: 0.9,
        sourceText: "lola studio",
        label: "Lola Studio",
      },
    },
    hat: "client",
    // Exactly what the engine builds: the repaired ask, and the keystrokes.
    rawMessage: normalizeAsk(typed),
    verbatimMessage: typed,
    bookings: [],
    now: new Date("2026-09-07T12:00:00Z"),
  };
}

describe("a promo code survives spelling correction", () => {
  beforeEach(() => {
    mockedValidatePromoCode.mockReset();
    mockedValidatePromoCode.mockResolvedValue(null);
  });

  it.each(["BALAYAGE", "SHELLAC", "KERATIN", "ACRYLIC", "HIGHLIGHTS"])(
    "still reads %s as the code, though the normaliser lowercases that word",
    async (code) => {
      const typed = `is ${code} still valid`;

      // The hazard is real, not hypothetical: the repaired text has lost it.
      expect(normalizeAsk(typed)).not.toContain(code);

      const capability = getCapability("discover.promocode", "client");
      await capability!.run(context(typed));

      expect(mockedValidatePromoCode).toHaveBeenCalledWith("Lola Studio", code);
    },
  );

  it("still reads an ordinary code that no rewrite touches", async () => {
    const capability = getCapability("discover.promocode", "client");
    await capability!.run(context("is SAVE20 still valid"));

    expect(mockedValidatePromoCode).toHaveBeenCalledWith("Lola Studio", "SAVE20");
  });
});
