import { converse } from "../services/becca/engine";
import {
  getBookmarkedProviders,
  getProviderReviews,
  searchProviders,
} from "../services/databaseService";
import type { ConversationContext } from "../services/becca/types";

/**
 * When Becca knows what someone wants but is missing one detail, she asks for
 * it and then answers the ORIGINAL question with their reply. Before this,
 * "Which provider did you mean?" → "Lola Studio" threw the question away and
 * just showed Lola Studio's profile, and "What are you after?" → "Nails" ran a
 * plain nails search instead of the plan that was asked for.
 */

jest.mock("../services/databaseService", () => ({
  searchProviders: jest.fn(),
  getBookmarkedProviders: jest.fn(),
  getProviderBySlug: jest.fn(async () => null),
  getProviderPriceRanges: jest.fn(async () => new Map()),
  getProviderReviews: jest.fn(),
  getProviderIdByDisplayName: jest.fn(async () => "provider-1"),
  getProviders: jest.fn(async () => []),
}));

const mockedSearch = searchProviders as jest.MockedFunction<typeof searchProviders>;
const mockedSaved = getBookmarkedProviders as jest.MockedFunction<typeof getBookmarkedProviders>;
const mockedReviews = getProviderReviews as jest.MockedFunction<typeof getProviderReviews>;

const now = new Date("2026-11-24T12:00:00Z");

const LIVE = [
  { id: "provider-1", slug: "lola-studio", display_name: "Lola Studio" },
  { id: "provider-2", slug: "lola-nails", display_name: "Lola Nails" },
  { id: "provider-3", slug: "glow-room", display_name: "Glow Room" },
];

async function say(message: string, conversation?: ConversationContext) {
  return converse({ message, hat: "client", bookings: [], now, ...(conversation ? { conversation } : {}) });
}

describe("Becca asks for a missing detail, then answers the original question", () => {
  beforeEach(() => {
    mockedSaved.mockReset();
    mockedSaved.mockResolvedValue([]);
    mockedSearch.mockReset();
    // Like the live search: any provider whose name contains the query.
    // "Lola" alone matches two, so typing "Lola Studio" has to be read whole.
    mockedSearch.mockImplementation(async (query) =>
      LIVE.filter((p) => p.display_name.toLowerCase().includes(query.toLowerCase())) as Awaited<ReturnType<typeof searchProviders>>,
    );
    mockedReviews.mockReset();
    mockedReviews.mockResolvedValue([
      { rating: 5, comment: "Lovely", created_at: "2026-11-01T10:00:00Z" },
    ] as Awaited<ReturnType<typeof getProviderReviews>>);
  });

  it("finishes a reviews question with the provider named in the reply", async () => {
    const first = await say("what are the reviews like");
    expect(first.message.content).toMatch(/which provider/i);
    expect(first.context.awaiting).toMatchObject({ capabilityId: "discover.reviews", kind: "provider" });

    const second = await say("Lola Studio", first.context);
    expect(second.message.understood?.capabilityId).toBe("discover.reviews");
    expect(second.message.content).toContain("5.0");
    expect(second.context.awaiting).toBeUndefined();
  });

  it("reads a lower-case reply as the provider's name", async () => {
    const first = await say("what are the reviews like");
    const second = await say("lola studio", first.context);
    expect(second.message.understood?.capabilityId).toBe("discover.reviews");
    expect(second.message.content).toContain("Lola Studio");
  });

  it("does not read an ordinary question as a provider name", async () => {
    const first = await say("what are the reviews like");
    const second = await say("what's my next booking?", first.context);
    expect(second.message.understood?.capabilityId).not.toBe("discover.reviews");
  });

  it("finishes a booking plan with the service tapped from the chips", async () => {
    const first = await say("help me plan a booking");
    expect(first.message.content).toMatch(/what are you after/i);
    const nails = first.message.suggestions?.find((s) => s.text === "Nails");
    expect(nails?.data?.message).toBeDefined();

    const second = await say(nails!.data!.message!, first.context);
    expect(second.message.understood?.capabilityId).toBe("discover.booking_plan");
    // The reply wording is picked at random; the plan card always names it.
    expect(second.message.answer?.card?.title).toMatch(/nails/i);
  });

  it("offers the providers just shown as answers to 'which provider?'", async () => {
    const first = await say("what are the reviews like", {
      hat: "client",
      entities: {},
      lastProviders: [
        { slug: "lola-studio", displayName: "Lola Studio" },
        { slug: "glow-room", displayName: "Glow Room" },
      ],
    });
    const labels = (first.message.suggestions ?? []).map((s) => s.text);
    expect(labels).toEqual(expect.arrayContaining(["Lola Studio", "Glow Room"]));
  });

  it("keeps the question open when the answer matches more than one provider", async () => {
    // "their" with two providers on screen is ambiguous: Becca asks which,
    // and tapping one must still answer the reviews question.
    const first = await say("what are their reviews", {
      hat: "client",
      entities: {},
      lastProviders: [
        { slug: "lola-studio", displayName: "Lola Studio" },
        { slug: "glow-room", displayName: "Glow Room" },
      ],
    });
    const lola = first.message.suggestions?.find((s) => s.text === "Lola Studio");
    expect(lola).toBeDefined();

    const second = await say(lola!.data!.message!, first.context);
    expect(second.message.understood?.capabilityId).toBe("discover.reviews");
  });

  it("asks which day for 'what about' after a nails search, then searches that day", async () => {
    const afterNails: ConversationContext = {
      hat: "client",
      entities: {
        service: { kind: "service", value: { category: "NAILS" }, confidence: 0.9, sourceText: "nails", label: "nails" },
      },
      lastCapabilityId: "discover.find",
    };
    const first = await say("what about", afterNails);
    expect(first.message.content).toMatch(/which day/i);
    expect(first.message.suggestions?.map((s) => s.text)).toContain("Tomorrow");

    const second = await say("Tomorrow", first.context);
    expect(second.message.understood?.capabilityId).toBe("discover.followup_day");
  });

  it("doesn't ask 'which day?' when a bare 'what about' has nothing to go on", async () => {
    const reply = await say("what about");
    expect(reply.message.content).not.toMatch(/which day/i);
    expect(reply.context.awaiting).toBeUndefined();
  });

  it("still answers a bare service word when nothing was asked", async () => {
    const reply = await say("Nails");
    expect(reply.message.understood?.capabilityId).toBeTruthy();
  });

  it("lets a new, complete question replace the one being asked", async () => {
    const first = await say("what are the reviews like");
    expect(first.context.awaiting).toBeDefined();

    const second = await say("help me plan a nails booking", first.context);
    expect(second.message.understood?.capabilityId).toBe("discover.booking_plan");
    expect(second.context.awaiting).toBeUndefined();
  });

  it("drops the open question when the person backs out", async () => {
    const first = await say("what are the reviews like");
    const second = await say("never mind", first.context);
    expect(second.context.awaiting).toBeUndefined();
  });
});
