import { getProviders, getProviderServiceFacets } from "../services/databaseService";
import { ALL_CAPABILITIES, getCapability, thinkingFor } from "../services/becca/registry";
import { resolveService } from "../services/becca/entityResolver";
import type { CapabilityContext, EntityBag } from "../services/becca/types";

jest.mock("../services/databaseService", () => ({
  getProviders: jest.fn(),
  getProviderServiceFacets: jest.fn(),
}));

const mockedProviders = getProviders as jest.MockedFunction<typeof getProviders>;
const mockedFacets = getProviderServiceFacets as jest.MockedFunction<typeof getProviderServiceFacets>;

const lashes = (): EntityBag => ({ service: resolveService("volume lashes")! });
const lola: EntityBag = {
  provider: {
    kind: "provider",
    value: { slug: "lola-studio", displayName: "Lola Studio" },
    confidence: 1,
    sourceText: "lola studio",
    label: "Lola Studio",
  },
};

describe("Becca's loading steps", () => {
  it("gives every capability one to three steps, with or without entities", () => {
    for (const capability of ALL_CAPABILITIES) {
      for (const entities of [{}, lashes(), lola]) {
        const steps = thinkingFor(capability, { entities, message: "find volume lashes near me" });
        expect(steps.length).toBeGreaterThanOrEqual(1);
        expect(steps.length).toBeLessThanOrEqual(3);
        for (const step of steps) {
          expect(step).toMatch(/^\S.{2,70}…$/);
          expect(step).not.toMatch(/undefined|null/);
        }
      }
    }
  });

  it("names the service a search is for", () => {
    const find = getCapability("discover.find", "client")!;
    expect(thinkingFor(find, { entities: lashes(), message: "someone who does volume lashes" })).toEqual([
      "Searching providers for lashes…",
      "Checking whose menus include volume lashes…",
      "Putting the list together…",
    ]);
  });

  it("names the provider whose policy is being read", () => {
    const policy = getCapability("provider.reschedule_policy", "client")!;
    expect(thinkingFor(policy, { entities: lola, message: "" })[0]).toBe("Reading Lola Studio’s rescheduling policy…");
  });
});

describe("Finding someone who does a specific service", () => {
  const row = (id: string, name: string) => ({
    id, slug: id, display_name: name, service_category: "LASHES", logo_url: null, location_text: null,
  });
  const facets = (menus: Record<string, string[]>) => ({
    priceRanges: new Map(),
    audiences: new Map(),
    skinTones: new Map(),
    specialityText: new Map(Object.entries(menus).map(([id, names]) => [id, new Set(names)])),
    specialityLabels: new Map(),
  });
  const run = () =>
    getCapability("discover.find", "client")!.run({
      entities: lashes(),
      hat: "client",
      rawMessage: "i am looking for someone who does volume lashes",
      verbatimMessage: "i am looking for someone who does volume lashes",
      bookings: [],
      now: new Date("2026-11-02T12:00:00Z"),
    } as CapabilityContext);

  beforeEach(() => {
    mockedProviders.mockResolvedValue([row("a", "Lash Lab"), row("b", "Brow & Lash Co")] as never);
  });

  it("shows only providers whose menu lists it", async () => {
    mockedFacets.mockResolvedValue(facets({ a: ["Russian Volume Full Set"], b: ["Classic Lash Set"] }));
    const result = await run();
    expect(result.providers?.map((p) => p.name)).toEqual(["Lash Lab"]);
    expect(result.text).toContain("1 provider who lists volume lashes");
    expect(result.suggestions?.some((s) => s.data?.message === "Find lashes")).toBe(true);
  });

  it("says so when nobody names it, rather than calling everyone a volume-lash provider", async () => {
    mockedFacets.mockResolvedValue(facets({ a: ["Classic Lash Set"], b: ["Lash Lift"] }));
    const result = await run();
    expect(result.providers).toHaveLength(2);
    expect(result.text).toMatch(/^Nobody names volume lashes on their menu yet/);
  });
});
