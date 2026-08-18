import { searchProviders, getBookmarkedProviders } from "../services/databaseService";
import { resolveEntities } from "../services/becca/entityResolver";
import { understand } from "../services/becca/matcher";

jest.mock("../services/databaseService", () => ({
  searchProviders: jest.fn(),
  getBookmarkedProviders: jest.fn(),
}));

const mockedSearchProviders = searchProviders as jest.MockedFunction<typeof searchProviders>;
const mockedGetBookmarkedProviders = getBookmarkedProviders as jest.MockedFunction<typeof getBookmarkedProviders>;

describe("natural named-provider routing", () => {
  beforeEach(() => {
    mockedSearchProviders.mockReset();
    mockedGetBookmarkedProviders.mockReset();
    mockedGetBookmarkedProviders.mockResolvedValue([]);
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
});
