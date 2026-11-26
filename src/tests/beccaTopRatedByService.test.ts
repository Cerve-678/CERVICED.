import { converse } from "../services/becca/engine";
import {
  getNewProviders,
  getProviders,
  getTopRatedProviders,
} from "../services/databaseService";

/**
 * "Who's top rated in lashes?" used to answer with the top-rated providers
 * across every category: discover.find hands any rating question over to
 * discover.top, and discover.top never read the service that was named.
 * Becca's own "See top-rated" cards after a lash search hit the same gap.
 */

jest.mock("../services/databaseService", () => ({
  getTopRatedProviders: jest.fn(),
  getNewProviders: jest.fn(),
  getProviders: jest.fn(),
  searchProviders: jest.fn(async () => []),
  getBookmarkedProviders: jest.fn(async () => []),
  getProviderPriceRanges: jest.fn(async () => new Map()),
}));

const mockedTop = getTopRatedProviders as jest.MockedFunction<typeof getTopRatedProviders>;
const mockedNew = getNewProviders as jest.MockedFunction<typeof getNewProviders>;
const mockedAll = getProviders as jest.MockedFunction<typeof getProviders>;

type Rows = Awaited<ReturnType<typeof getTopRatedProviders>>;
const LASH_PRO = [
  { id: "p1", slug: "lash-lab", display_name: "Lash Lab", rating: 4.9, review_count: 12, service_category: "LASHES" },
] as unknown as Rows;

const now = new Date("2026-11-26T12:00:00Z");
const say = (message: string) => converse({ message, hat: "client", bookings: [], now });

describe("Becca's top-rated list keeps the service that was asked about", () => {
  beforeEach(() => {
    mockedTop.mockReset();
    mockedNew.mockReset();
    mockedAll.mockReset();
    mockedTop.mockResolvedValue(LASH_PRO);
    mockedNew.mockResolvedValue(LASH_PRO);
    mockedAll.mockResolvedValue([]);
  });

  it.each([
    "who's top rated in lashes",
    "who is the best rated lash tech",
    "Who are the best rated lashes providers?",
  ])("ranks only lash providers for %p", async (message) => {
    const reply = await say(message);
    expect(reply.message.understood?.capabilityId).toBe("discover.top");
    expect(mockedTop).toHaveBeenCalledWith(expect.any(Number), "LASHES");
    expect(reply.message.content).toMatch(/lash/i);
  });

  it("still ranks everyone when no service is named", async () => {
    const reply = await say("who's top rated");
    expect(reply.message.understood?.capabilityId).toBe("discover.top");
    expect(mockedTop).toHaveBeenCalledWith(expect.any(Number), undefined);
  });

  it("keeps the service for who has just joined", async () => {
    await say("newest lash techs");
    expect(mockedNew).toHaveBeenCalledWith(expect.any(Number), "LASHES");
  });

  it("falls back to that service's providers, not everyone, when none have enough reviews", async () => {
    mockedTop.mockResolvedValue([]);
    mockedAll.mockResolvedValue(LASH_PRO);
    const reply = await say("who's top rated in lashes");
    expect(mockedAll).toHaveBeenCalledWith("LASHES");
    expect(reply.message.content).toMatch(/lash/i);
  });
});
