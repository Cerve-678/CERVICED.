import { converse } from "../services/becca/engine";
import { AvailabilityService } from "../services/AvailabilityService";
import {
  getNewProviders,
  getProviderPriceRanges,
  getProviders,
  getTopRatedProviders,
} from "../services/databaseService";

/**
 * A discovery ask is usually two or three clauses — a service, plus how to
 * rank it, plus when or where. Each test here is an everyday phrasing where
 * Becca used to answer a different question, or drop a clause:
 *
 *  • "lashes" on its own got a PRICE breakdown. With no phrase matched,
 *    every service capability tied on the service alone and the price
 *    comparison won on registration order.
 *  • "best lash tech near me" kept "near me" and dropped "best".
 *  • "any new lash techs" and "top lash techs" matched nothing but the
 *    service, so they too got the price breakdown.
 *  • "who can do lashes this saturday" searched lashes and dropped Saturday.
 */

jest.mock("../services/databaseService", () => ({
  getTopRatedProviders: jest.fn(),
  getNewProviders: jest.fn(),
  getProviders: jest.fn(),
  getProviderPriceRanges: jest.fn(),
  getProviderServiceFacets: jest.fn(async () => ({
    priceRanges: new Map(), services: new Map(), specialityText: new Map(), specialityLabels: new Map(), specialities: new Map(),
  })),
  searchProviders: jest.fn(async () => []),
  getBookmarkedProviders: jest.fn(async () => []),
}));

jest.mock("../services/AvailabilityService", () => ({
  AvailabilityService: { resolveNextAvailableSlot: jest.fn(async () => null) },
}));

const mockedTop = getTopRatedProviders as jest.MockedFunction<typeof getTopRatedProviders>;
const mockedNew = getNewProviders as jest.MockedFunction<typeof getNewProviders>;
const mockedAll = getProviders as jest.MockedFunction<typeof getProviders>;
const mockedRanges = getProviderPriceRanges as jest.MockedFunction<typeof getProviderPriceRanges>;
const mockedSlot = AvailabilityService.resolveNextAvailableSlot as jest.Mock;

type Rows = Awaited<ReturnType<typeof getProviders>>;
const PRO = [
  { id: "p1", slug: "lash-lab", display_name: "Lash Lab", rating: 4.9, review_count: 12, service_category: "LASHES" },
] as unknown as Rows;

const now = new Date("2026-11-26T12:00:00Z"); // a Thursday
const say = (message: string) => converse({ message, hat: "client", bookings: [], now });
const routed = async (message: string) => (await say(message)).message.understood?.capabilityId;

beforeEach(() => {
  jest.clearAllMocks();
  mockedTop.mockResolvedValue(PRO);
  mockedNew.mockResolvedValue(PRO);
  mockedAll.mockResolvedValue(PRO);
  mockedRanges.mockResolvedValue(new Map());
});

describe("a service named on its own is a search", () => {
  it.each(["lashes", "gel nails", "lash tech", "brows in london"])("%p → discover.find", async (message) => {
    expect(await routed(message)).toBe("discover.find");
  });

  it("still prices up when price is what's asked", async () => {
    expect(await routed("how much are lashes")).toBe("discover.followup_price");
    expect(await routed("best price for lashes")).toBe("discover.followup_price");
  });
});

describe("a ranking word ranks, whatever else is in the sentence", () => {
  it.each([
    ["best lash tech near me", "LASHES"],
    ["best nail tech near me", "NAILS"],
    ["best brows in london", "BROWS"],
    ["top lash techs", "LASHES"],
    ["best reviewed lash tech", "LASHES"],
    ["any good nail techs near me", "NAILS"],
    ["find me a good lash tech", "LASHES"],
  ])("%p → top rated in %s", async (message, category) => {
    expect(await routed(message)).toBe("discover.top");
    expect(mockedTop).toHaveBeenCalledWith(expect.any(Number), category);
  });

  it("does not read 'the best way to' as a ranking", async () => {
    expect(await routed("what's the best way to look after my lashes")).not.toBe("discover.top");
  });
});

describe("asking who's new lists who just joined", () => {
  it.each([
    ["any new lash techs", "LASHES"],
    ["new nail techs", "NAILS"],
    ["anyone new doing lashes", "LASHES"],
    ["recently joined hairdressers", "HAIR"],
  ])("%p → newest in %s", async (message, category) => {
    expect(await routed(message)).toBe("discover.top");
    expect(mockedNew).toHaveBeenCalledWith(expect.any(Number), category);
  });

  it("answers who's new across everything", async () => {
    expect(await routed("who's new on here")).toBe("discover.top");
    expect(mockedNew).toHaveBeenCalledWith(expect.any(Number), undefined);
  });

  it.each(["i want new nails", "new nail art ideas", "any new messages"])(
    "does not read %p as a who's-new question",
    async (message) => {
      await say(message);
      expect(mockedNew).not.toHaveBeenCalled();
    },
  );
});

describe("a day in a search is kept", () => {
  it("checks who is free that day instead of listing everyone", async () => {
    await say("who can do lashes this saturday");
    expect(mockedSlot).toHaveBeenCalled();
  });
});

describe("'best for me' is a personal ask, not a ranking", () => {
  it.each(["which is best for me", "what would suit me"])("%p → discover.forme", async (message) => {
    expect(await routed(message)).toBe("discover.forme");
  });
});
