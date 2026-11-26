import { converse } from "../services/becca/engine";
import { BookingStatus, type ConfirmedBooking } from "../types/booking";

/**
 * Everyday asks about a booking, a named provider, the inbox and the app that
 * Becca answered as something else. The commonest: with a booking at Lola
 * Studio on file, "where is lola studio", "message lola studio", "rate lola
 * studio" and "lola studio prices" all got the BOOKING BREAKDOWN. Naming the
 * provider resolves the booking too, the provider capabilities' phrases were
 * all pronoun-shaped ("contact them", "their number"), and with no phrase
 * matched the booking breakdown won the tie on registration order.
 */

const LIVE = [{ id: "p1", slug: "lola-studio", display_name: "Lola Studio", service_category: "NAILS" }];

jest.mock("../services/databaseService", () => new Proxy({}, {
  get: (_target, key) => {
    if (key === "__esModule") return false;
    const name = String(key);
    if (name === "searchProviders") {
      return jest.fn(async (query: string) =>
        LIVE.filter((p) => p.display_name.toLowerCase().includes(String(query).toLowerCase())));
    }
    if (name === "getProviderBySlug") return jest.fn(async () => LIVE[0]);
    if (name === "getProviderIdByDisplayName") return jest.fn(async () => "p1");
    if (name.includes("Facets")) {
      return jest.fn(async () => ({
        priceRanges: new Map(), services: new Map(), specialityText: new Map(),
        specialityLabels: new Map(), specialities: new Map(),
      }));
    }
    if (name.includes("Ranges")) return jest.fn(async () => new Map());
    // Shapes the provider answers read, so they run rather than throw.
    if (name === "getMobileProviderDisplayNames") return jest.fn(async () => new Set());
    if (name === "getProviderLocationsByDisplayNames") return jest.fn(async () => ({}));
    return jest.fn(async () => []);
  },
}));
jest.mock("../services/AvailabilityService", () => ({
  AvailabilityService: new Proxy({}, { get: () => jest.fn(async () => null) }),
}));

const upcoming = {
  id: "b1", providerId: "p1", providerName: "Lola Studio", serviceName: "Gel manicure",
  status: BookingStatus.UPCOMING, bookingDate: "2026-11-29", bookingTime: "10:00:00", price: 35,
} as unknown as ConfirmedBooking;
const past = { ...upcoming, id: "b0", status: BookingStatus.COMPLETED, bookingDate: "2026-10-20" } as ConfirmedBooking;

async function reply(message: string) {
  return (await converse({
    message, hat: "client", bookings: [upcoming, past], now: new Date("2026-11-26T12:00:00Z"),
  })).message;
}

describe("a named provider gets the answer about them, not the booking breakdown", () => {
  it.each([
    ["where is lola studio", "provider.location"],
    ["does lola studio travel to me", "provider.location"],
    ["is lola studio mobile", "provider.location"],
    ["message lola studio", "provider.contact"],
    ["what's lola studio's number", "provider.contact"],
    ["lola studio instagram", "provider.contact"],
    ["is lola studio free tomorrow", "provider.next_available"],
    ["lola studio availability", "provider.next_available"],
    ["can i book lola studio last minute", "provider.booking_timing"],
    ["lola studio prices", "discover.provider_services"],
    ["rate lola studio", "action.review"],
    ["join lola studio waitlist", "action.waitlist"],
    ["tell me if lola studio has a cancellation", "action.waitlist"],
    ["add lola studio to my favourites", "action.bookmark"],
    ["did lola studio reply", "inbox.messages"],
    ["did lola studio send me anything", "booking.info_packs"],
  ])("%p → %s", async (message, capabilityId) => {
    expect((await reply(message)).understood?.capabilityId).toBe(capabilityId);
  });

  it("opens the provider when they're named with nothing else", async () => {
    expect((await reply("lola studio")).understood?.capabilityId).toBe("discover.pick");
  });
});

describe("booking asks reach the booking answer", () => {
  it.each([
    ["what time is my nails on sunday", "booking.next"],
    ["do i have anything booked", "booking.list"],
    ["details of my gel manicure", "booking.details"],
    ["what's the address for my booking", "booking.location"],
    ["change my appointment to next week", "booking.reschedule"],
    ["push my appointment back", "booking.reschedule"],
    ["did lola accept my new time", "booking.reschedule_status"],
    ["how often do i get my nails done", "booking.routine"],
    ["what do i usually book", "booking.routine"],
    ["what did i have done last year", "booking.history"],
  ])("%p → %s", async (message, capabilityId) => {
    expect((await reply(message)).understood?.capabilityId).toBe(capabilityId);
  });
});

// With a past and an upcoming booking on file and neither named, the honest
// answer is "which appointment?" — then the breakdown with its policies.
it.each(["what's the cancellation policy", "will i be charged if i cancel"])(
  "asks which booking for %p, to answer with its policies",
  async (message) => {
    const result = await converse({
      message, hat: "client", bookings: [upcoming, past], now: new Date("2026-11-26T12:00:00Z"),
    });
    expect(result.context.awaiting).toMatchObject({ capabilityId: "booking.details", kind: "booking" });
  },
);

describe("inbox, account and app asks", () => {
  it.each([
    ["has anyone messaged me", "inbox.messages"],
    ["who have i saved", "discover.saved"],
    ["my group bookings", "account.events"],
    ["hen party plans", "account.events"],
    ["any promo codes", "discover.offers"],
    ["use code SAVE10 at lola studio", "discover.promocode"],
    ["contact support", "meta.app_navigation"],
    ["open settings", "meta.app_navigation"],
    ["log out", "meta.app_navigation"],
  ])("%p → %s", async (message, capabilityId) => {
    expect((await reply(message)).understood?.capabilityId).toBe(capabilityId);
  });
});

describe("words shared with other questions stay where they were", () => {
  it.each([
    ["where is my appointment", "booking.location"],
    ["any messages", "inbox.messages"],
    ["reviews for lola studio", "discover.reviews"],
    ["cancel my appointment", "booking.cancel"],
    ["am i on any waitlists", "discover.waitlist"],
    ["my saved providers", "discover.saved"],
  ])("%p → %s", async (message, capabilityId) => {
    expect((await reply(message)).understood?.capabilityId).toBe(capabilityId);
  });
});

it("doesn't say 'providers providers' when checking everyone's availability", async () => {
  expect((await reply("who's free tomorrow")).content).not.toMatch(/providers providers/i);
});
