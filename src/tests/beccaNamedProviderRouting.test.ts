import {
  searchProviders,
  getBookmarkedProviders,
  getProviderBySlug,
  getProviderPriceRanges,
  getProviderReviews,
} from "../services/databaseService";
import { resolveEntities } from "../services/becca/entityResolver";
import { understand } from "../services/becca/matcher";
import { getCapability } from "../services/becca/registry";

jest.mock("../services/databaseService", () => ({
  searchProviders: jest.fn(),
  getBookmarkedProviders: jest.fn(),
  getProviderBySlug: jest.fn(),
  getProviderPriceRanges: jest.fn(),
  getProviderReviews: jest.fn(),
}));

const mockedSearchProviders = searchProviders as jest.MockedFunction<typeof searchProviders>;
const mockedGetBookmarkedProviders = getBookmarkedProviders as jest.MockedFunction<typeof getBookmarkedProviders>;
const mockedGetProviderBySlug = getProviderBySlug as jest.MockedFunction<typeof getProviderBySlug>;
const mockedGetProviderPriceRanges = getProviderPriceRanges as jest.MockedFunction<typeof getProviderPriceRanges>;
const mockedGetProviderReviews = getProviderReviews as jest.MockedFunction<typeof getProviderReviews>;

describe("natural named-provider routing", () => {
  beforeEach(() => {
    mockedSearchProviders.mockReset();
    mockedGetBookmarkedProviders.mockReset();
    mockedGetBookmarkedProviders.mockResolvedValue([]);
    mockedGetProviderBySlug.mockReset();
    mockedGetProviderPriceRanges.mockReset();
    mockedGetProviderReviews.mockReset();
  });

  it("resolves a lowercase multi-word provider after 'looking for'", async () => {
    mockedSearchProviders.mockImplementation(async (query) =>
      query.toLowerCase() === "lola studio"
        ? ([{ id: "provider-1", slug: "lola-studio", display_name: "Lola Studio" }] as Awaited<ReturnType<typeof searchProviders>>)
        : [],
    );

    const entities = await resolveEntities(
      "i'm looking for lola studio provider",
      [],
      new Date("2026-08-18T12:00:00Z"),
    );

    expect(entities.provider?.value.displayName).toBe("Lola Studio");
    expect(understand("i'm looking for lola studio provider", entities, "client")).toMatchObject({
      capabilityId: "discover.pick",
      confidence: "high",
    });
  });

  it("does not mistake a generic service search for a provider name", async () => {
    mockedSearchProviders.mockResolvedValue([]);

    const entities = await resolveEntities(
      "i'm looking for a nail provider",
      [],
      new Date("2026-08-18T12:00:00Z"),
    );

    expect(entities.service?.value.category).toBe("NAILS");
    expect(entities.provider).toBeUndefined();
    expect(understand("i'm looking for a nail provider", entities, "client").capabilityId).toBe("discover.find");
  });

  it("returns a named provider as a directly tappable profile card", async () => {
    mockedGetProviderBySlug.mockResolvedValue({
      id: "provider-1",
      slug: "lola-studio",
      display_name: "Lola Studio",
      service_category: "NAILS",
      logo_url: null,
      location_text: "London",
      services: [],
      specialties: [],
    } as unknown as Awaited<ReturnType<typeof getProviderBySlug>>);
    mockedGetProviderPriceRanges.mockResolvedValue(new Map());
    mockedGetProviderReviews.mockResolvedValue([]);

    const capability = getCapability("discover.pick", "client");
    const result = await capability!.run({
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
      rawMessage: "i'm looking for lola studio",
      bookings: [],
      now: new Date("2026-08-18T12:00:00Z"),
    });

    expect(result.providers).toEqual([
      expect.objectContaining({ id: "lola-studio", name: "Lola Studio" }),
    ]);
    expect(result.suggestions?.some((item) => item.text === "View profile")).toBe(false);
  });
});
