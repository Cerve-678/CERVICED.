import { normalizeAsk } from "../services/becca/askNormaliser";
import { resolveService } from "../services/becca/entityResolver";
import { understand } from "../services/becca/matcher";
import { respond } from "../services/becca/engine";
import { capabilitiesFor } from "../services/becca/registry";
import { BookingStatus, type ConfirmedBooking } from "../types/booking";
import type { EntityBag } from "../services/becca/types";

jest.mock("../services/databaseService", () => ({
  searchProviders: jest.fn(async () => []),
  getBookmarkedProviders: jest.fn(async () => []),
}));

/**
 * Follow-up cards send a message back to Becca. Each one has to land on the
 * capability its label promises, or tapping it answers a different question.
 * These are the cards an audit of every card found going to the wrong place.
 */
const booking = {
  id: "b1",
  providerId: "p1",
  providerName: "Lola Studio",
  serviceName: "Gel manicure",
  status: BookingStatus.UPCOMING,
  bookingDate: "2026-11-10",
  bookingTime: "10:00:00",
} as unknown as ConfirmedBooking;

/** What the resolver produces for a message naming this booking. */
const aboutTheBooking: EntityBag = {
  booking: { kind: "booking", value: booking, confidence: 1, sourceText: "my appointment", label: "Gel manicure with Lola Studio" },
  provider: {
    kind: "provider",
    value: { slug: "lola-studio", dbId: "p1", displayName: "Lola Studio" },
    confidence: 0.9,
    sourceText: "lola studio",
    label: "Lola Studio",
  },
  service: resolveService("gel manicure")!,
};

const route = (message: string, entities: EntityBag) =>
  understand(normalizeAsk(message), entities, "client").capabilityId;

describe("Becca's follow-up cards land where their label says", () => {
  it.each([
    ["Booking breakdown", "Tell me about my Gel manicure appointment with Lola Studio", "booking.details"],
    ["What am I paying?", "How much is my Gel manicure appointment with Lola Studio?", "booking.cost"],
    ["My prep & aftercare", "What did Lola Studio send me for my appointment?", "booking.info_packs"],
    ["Where is it?", "Where is my appointment with Lola Studio?", "booking.location"],
  ])("%s → %s", (_label, message, expected) => {
    expect(route(message, aboutTheBooking)).toBe(expected);
  });

  it("asks when a named provider is next free, not about the booking with them", () => {
    expect(route("When is Lola Studio next free?", aboutTheBooking)).toBe("provider.next_available");
  });

  it("keeps the rating when a nails search is still being carried", () => {
    const afterNailsSearch: EntityBag = { service: resolveService("nails")! };
    expect(route("Who are the best rated providers near me?", afterNailsSearch)).toBe("discover.top");
  });

  it("still finds a provider by name for an ordinary search follow-up", () => {
    // The booking veto must not stop "tell me about Lola Studio" reaching the provider.
    expect(route("Tell me about Lola Studio", { provider: aboutTheBooking.provider! })).toBe("discover.pick");
  });

  it.each(["client", "provider"] as const)(
    "routes every %s capability's own description back to it (the fallback's “did you mean” cards)",
    (hat) => {
      for (const capability of capabilitiesFor(hat)) {
        expect(understand(capability.describe, {}, hat).capabilityId).toBe(capability.id);
      }
    },
  );
});

describe("When Becca understood the question but not which appointment", () => {
  it("lists the upcoming appointments, each re-asking the same question about that one", async () => {
    const reply = await respond({
      message: "Break down an appointment and its policies",
      hat: "client",
      bookings: [booking],
      now: new Date("2026-11-02T12:00:00Z"),
    });
    expect(reply.content).toMatch(/Which appointment do you mean/);
    expect(reply.suggestions?.[0]?.data).toMatchObject({
      message: "Break down an appointment and its policies",
      bookingId: "b1",
    });
  });
});
