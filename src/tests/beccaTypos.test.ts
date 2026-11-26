import { normalizeAsk } from "../services/becca/askNormaliser";
import { understand } from "../services/becca/matcher";
import type { BeccaHat } from "../services/becca/types";
import { isTypoOf, typoDistance } from "../utils/fuzzyMatch";

/** Route a message the way the engine does: repair it, then match. */
function route(message: string, hat: BeccaHat = "client") {
  return understand(normalizeAsk(message), {}, hat);
}

describe("typo reading", () => {
  it("counts two swapped letters as one slip", () => {
    expect(typoDistance("cancle", "cancel")).toBe(1);
    expect(typoDistance("reveiws", "reviews")).toBe(1);
    expect(typoDistance("booking", "booking")).toBe(0);
  });

  it("never fuzzes short words or a different first letter", () => {
    expect(isTypoOf("nxt", "next")).toBe(false);
    expect(isTypoOf("cooking", "booking")).toBe(false);
  });

  it("allows one slip up to eight letters, two beyond", () => {
    expect(isTypoOf("mesages", "messages")).toBe(true);
    expect(isTypoOf("bnking", "booking")).toBe(false);
    expect(isTypoOf("apontment", "appointment")).toBe(true);
  });
});

describe("Becca reads asks with typos in them", () => {
  // Every one of these got "I didn't catch that" before typo reading.
  it.each<[string, BeccaHat, string]>([
    ["cancle my booking", "client", "booking.cancel"],
    ["resechedule my booking", "client", "booking.reschedule"],
    ["reshedule my appointment", "client", "booking.reschedule"],
    ["show my favourits", "client", "discover.saved"],
    ["show my reveiws", "provider", "pv.reviews"],
    ["whats my availabilty", "provider", "pv.availability"],
    ["any new mesages", "provider", "pv.inbox"],
  ])("%s", (message, hat, capabilityId) => {
    expect(route(message, hat).capabilityId).toBe(capabilityId);
  });

  it("is never fully sure of a reading that needed a typo fixed", () => {
    expect(route("cancle my booking").confidence).not.toBe("high");
    expect(route("show my reveiws", "provider").confidence).not.toBe("high");
  });

  it("still answers a correctly typed ask with full confidence", () => {
    expect(route("show my reviews", "provider").confidence).toBe("high");
  });
});

describe("Becca never 'corrects' a real word", () => {
  it("does not read cancer as cancel", () => {
    expect(route("i have cancer can i get a facial").capabilityId).not.toBe("booking.cancel");
  });

  it("does not read massage as messages", () => {
    expect(route("any new massage", "provider").capabilityId).not.toBe("pv.inbox");
  });

  it("does not read brows (the service) as browse", () => {
    const u = route("show me brows");
    expect(u.capabilityId === null || !u.capabilityId.includes("browse")).toBe(true);
  });

  it("does not read police as policy", () => {
    expect(route("can i call the police").capabilityId ?? "").not.toMatch(/polic/);
  });
});
