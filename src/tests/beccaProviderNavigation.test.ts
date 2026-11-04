import { normalizeAsk } from "../services/becca/askNormaliser";
import { getCapability } from "../services/becca/registry";
import { understand } from "../services/becca/matcher";
import type { CapabilityContext } from "../services/becca/types";
import { converse } from "../services/becca/engine";

const route = (message: string) => understand(normalizeAsk(message), {}, "provider").capabilityId;
const context = (rawMessage: string, linkOnly = false): CapabilityContext => ({
  rawMessage,
  verbatimMessage: rawMessage,
  hat: "provider",
  entities: {},
  bookings: [],
  now: new Date("2026-11-04T12:00:00Z"),
  linkOnly,
});

describe("Becca finds provider controls", () => {
  it.each([
    "Where do I set walkins?",
    "How can I change walk-ins?",
    "Can you show me where to turn on walk ins?",
    "Where do I set my schedule?",
    "How do I change my working hours?",
    "Take me to my calendar",
    "Where can I change my booking notice?",
    "How do I edit my prices?",
    "Where can I update my bank details?",
    "Take me to my messages",
  ])("recognises a request to locate a control: %s", (ask) => {
    expect(route(ask)).toBe("pv.app_navigation");
  });

  it.each([
    ["What's on my schedule today?", "pv.today"],
    ["What are my working hours?", "pv.hours"],
    ["Am I fully booked?", "pv.capacity"],
  ])("preserves a factual question: %s", (ask, expected) => {
    expect(route(ask)).toBe(expected);
  });

  it("links walk-ins to the real toggle", async () => {
    const result = await getCapability("pv.app_navigation", "provider")!.run(context("Where do I set walkins?"));
    expect(result.text).toContain("Scheduling & Availability → Availability");
    expect(result.suggestions?.[0]?.data).toMatchObject({ screen: "bookingRules" });
  });

  it("links working hours to the schedule", async () => {
    const result = await getCapability("pv.app_navigation", "provider")!.run(context("How do I change my working hours?"));
    expect(result.suggestions?.[0]?.data).toMatchObject({ screen: "schedule" });
  });

  it("links payment settings to the provider payments screen", async () => {
    const result = await getCapability("pv.app_navigation", "provider")!.run(context("Where can I update my bank details?"));
    expect(result.suggestions?.[0]?.data).toMatchObject({ screen: "payments" });
  });

  it("keeps link-only booking settings on the external booking site", async () => {
    const result = await getCapability("pv.app_navigation", "provider")!.run(context("Where do I set walk-ins?", true));
    expect(result.text).toContain("your own booking site");
    expect(result.suggestions?.[0]?.data).toMatchObject({ screen: "schedule" });
  });

  it("uses the last setting for a 'change this' follow-up", async () => {
    const reply = await converse({
      message: "How can I change this?",
      hat: "provider",
      bookings: [],
      conversation: {
        hat: "provider",
        entities: {},
        lastCapabilityId: "pv.app_navigation",
        lastNavigationAsk: "Where do I set walk-ins?",
      },
    });
    expect(reply.message.suggestions?.[0]?.data).toMatchObject({ screen: "bookingRules" });
  });
});
