import { converse } from "../services/becca/engine";
import { getProviderDepositPoliciesByDisplayNames } from "../services/databaseService";
import { BookingStatus, type ConfirmedBooking } from "../types/booking";

/**
 * Two asks the 11-26 sweep left open.
 *
 *  • "is there a deposit" with no provider named offered a "did you mean"
 *    menu: the search's "is there a" phrase tied the deposit question. With
 *    one provider booked, that's who they mean; with several, ask which and
 *    offer the booked ones, one tap each.
 *  • "is gel good for weak nails" got a nails search. Whether a treatment
 *    suits someone is the provider's call, and Becca says so plainly.
 */

const LIVE = [
  { id: "p1", slug: "lola-studio", display_name: "Lola Studio", service_category: "NAILS" },
  { id: "p2", slug: "glow-room", display_name: "Glow Room", service_category: "LASHES" },
];

jest.mock("../services/databaseService", () => {
  // One mock per name, so the test sees the same function the code calls.
  const made = new Map<string, jest.Mock>();
  return new Proxy({}, {
  get: (_target, key) => {
    if (key === "__esModule") return false;
    const name = String(key);
    const existing = made.get(name);
    if (existing) return existing;
    const fn = build(name);
    made.set(name, fn);
    return fn;
  },
  });
  function build(name: string): jest.Mock {
    if (name === "searchProviders") {
      return jest.fn(async (query: string) =>
        LIVE.filter((p) => p.display_name.toLowerCase().includes(String(query).toLowerCase())));
    }
    if (name === "getProviderDepositPoliciesByDisplayNames") {
      return jest.fn(async (names: string[]) =>
        Object.fromEntries(names.map((n) => [n, { depositAvailable: false }])));
    }
    if (name.includes("Facets")) {
      return jest.fn(async () => ({
        priceRanges: new Map(), services: new Map(), specialityText: new Map(),
        specialityLabels: new Map(), specialities: new Map(),
      }));
    }
    if (name.includes("Ranges")) return jest.fn(async () => new Map());
    return jest.fn(async () => []);
  }
});

const mockedDeposit = getProviderDepositPoliciesByDisplayNames as jest.Mock;

const booking = (id: string, providerName: string, providerId: string): ConfirmedBooking => ({
  id, providerId, providerName, serviceName: "Gel manicure",
  status: BookingStatus.UPCOMING, bookingDate: "2026-11-29", bookingTime: "10:00:00",
} as unknown as ConfirmedBooking);

const now = new Date("2026-11-26T12:00:00Z");
const say = (message: string, bookings: ConfirmedBooking[]) =>
  converse({ message, hat: "client", bookings, now });

describe("a deposit question with no provider named", () => {
  beforeEach(() => mockedDeposit.mockClear());

  it.each(["is there a deposit", "do i need to pay a deposit"])(
    "answers %p about the one provider they're booked with",
    async (message) => {
      const reply = await say(message, [booking("b1", "Lola Studio", "p1")]);
      expect(reply.message.understood?.capabilityId).toBe("provider.deposit");
      expect(mockedDeposit).toHaveBeenCalledWith(["Lola Studio"]);
      expect(reply.message.content).toContain("Lola Studio");
    },
  );

  it("asks which, offering each booked provider, when there are several", async () => {
    const reply = await say("is there a deposit", [
      booking("b1", "Lola Studio", "p1"),
      booking("b2", "Glow Room", "p2"),
    ]);
    expect(reply.message.content).toMatch(/which provider/i);
    const labels = (reply.message.suggestions ?? []).map((s) => s.text);
    expect(labels).toEqual(expect.arrayContaining(["Lola Studio", "Glow Room"]));
    expect(reply.context.awaiting).toMatchObject({ capabilityId: "provider.deposit", kind: "provider" });
  });

  it("asks which provider when nothing is booked", async () => {
    const reply = await say("is there a deposit", []);
    expect(reply.message.content).toMatch(/which provider/i);
  });
});

describe("whether a treatment suits them", () => {
  it.each([
    "is gel good for weak nails",
    "will acrylics damage my nails",
    "is balayage ok for thin hair",
    "are lash extensions suitable for me",
  ])("%p is the provider's call, not a search", async (message) => {
    const reply = await say(message, []);
    expect(reply.message.understood?.capabilityId).toBe("discover.suitability");
    expect(reply.message.content).toMatch(/provider/i);
  });

  it("still hands a medical question to the medical boundary", async () => {
    const reply = await say("is gel good for my eczema", []);
    expect(reply.message.content).toMatch(/can’t give medical/i);
  });

  it.each([
    ["who's good for lashes near me", "discover.top"],
    ["any good for saturday", "discover.followup_day"],
  ])("leaves %p where it was", async (message, capabilityId) => {
    const reply = await say(message, []);
    expect(reply.message.understood?.capabilityId).not.toBe("discover.suitability");
    void capabilityId;
  });
});
