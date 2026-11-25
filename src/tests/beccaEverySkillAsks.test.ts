import * as registry from "../services/becca/registry";
import { converse } from "../services/becca/engine";
import { BookingStatus, type ConfirmedBooking } from "../types/booking";
import type { BeccaHat, ConversationContext, EntityBag } from "../services/becca/types";
import { BECCA_ASKS, type AskGroup } from "./beccaEverySkillAsks.data";

/**
 * Every capability Becca has, asked the way people really ask, through the
 * whole engine (repair, entity resolution, carried context, matching).
 *
 * The asks were written as a person would type them, then measured: on the
 * day this test was added, main routed 73% of a set written blind to the
 * right capability. Anything here that stops routing is a question Becca
 * used to understand and no longer does.
 *
 * A routed capability counts whether it ran or asked for its missing detail
 * ("Which provider?") — both mean Becca understood what was being asked.
 */

jest.mock("../services/databaseService", () => {
  const live = [
    { id: "provider-1", slug: "lola-studio", display_name: "Lola Studio" },
    { id: "provider-3", slug: "glow-room", display_name: "Glow Room" },
  ];
  const known: Record<string, unknown> = {
    searchProviders: jest.fn(async (query: string) =>
      live.filter((p) => p.display_name.toLowerCase().includes(String(query).toLowerCase())),
    ),
    getProviderBySlug: jest.fn(async () => null),
    getProviderPriceRanges: jest.fn(async () => new Map()),
    getProviderIdByDisplayName: jest.fn(async () => "provider-1"),
  };
  // Every other read returns nothing: routing is under test, not the answers.
  return new Proxy(known, {
    get: (target, key: string) => {
      if (key === "__esModule") return true;
      if (!(key in target)) target[key] = jest.fn(async () => []);
      return target[key];
    },
  });
});

const now = new Date("2026-11-24T12:00:00Z");

const bookings = [
  {
    id: "b1", bookingDate: "2026-11-27", bookingTime: "10:00", status: BookingStatus.UPCOMING,
    serviceName: "Gel manicure", providerName: "Lola Studio", providerService: "Nails", price: 35,
  },
  {
    id: "b0", bookingDate: "2026-10-01", bookingTime: "14:00", status: BookingStatus.COMPLETED,
    serviceName: "Lash lift", providerName: "Glow Room", providerService: "Lashes", price: 45,
  },
] as unknown as ConfirmedBooking[];

const nails: NonNullable<EntityBag["service"]> = {
  kind: "service", value: { category: "NAILS" }, confidence: 1, sourceText: "nails", label: "nails",
};

function contextFor(hat: BeccaHat, ctx: AskGroup["ctx"]): ConversationContext | undefined {
  if (ctx === "carry") {
    return {
      hat,
      entities: { service: nails },
      lastCapabilityId: "discover.find",
      lastProviders: [
        { slug: "lola-studio", displayName: "Lola Studio" },
        { slug: "glow-room", displayName: "Glow Room" },
      ],
    };
  }
  if (ctx === "shown") {
    return {
      hat,
      entities: {},
      lastCapabilityId: "discover.find",
      lastProviders: [{ slug: "lola-studio", displayName: "Lola Studio" }],
    };
  }
  return undefined;
}

describe("Becca understands everyday asks for everything she can do", () => {
  const spy = jest.spyOn(registry, "getCapability");

  it.each(BECCA_ASKS.map((group) => [`${group.hat} ${group.id}${group.ctx ? ` (${group.ctx})` : ""}`, group] as const))(
    "%s",
    async (_name, group) => {
      const missed: string[] = [];
      for (const entry of group.asks) {
        const [ask, alternatives] = entry.split(" => ") as [string, string | undefined];
        const accepted = [group.id, ...(alternatives ? alternatives.split(",") : [])];
        spy.mockClear();
        const conversation = contextFor(group.hat, group.ctx);
        const { message, context } = await converse({
          message: ask,
          hat: group.hat,
          bookings,
          now,
          ...(conversation ? { conversation } : {}),
        });
        const lastLookup = spy.mock.calls.at(-1)?.[0];
        const routed = context.awaiting?.capabilityId ?? message.understood?.capabilityId ?? lastLookup;
        const fellBack = message.understood?.capabilityId === null;
        const special = /medical or dermatology/i.test(message.content)
          ? "medical"
          : !routed && message.understood === undefined ? "social" : undefined;
        const ok = (!fellBack && routed != null && accepted.includes(routed))
          || (special != null && accepted.includes(special));
        if (!ok) missed.push(`"${ask}" → ${fellBack ? "didn't catch it" : routed ?? special ?? "nothing"}`);
      }
      expect(missed).toEqual([]);
    },
  );
});
