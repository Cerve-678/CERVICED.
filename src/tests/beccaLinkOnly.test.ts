import { converse } from "../services/becca/engine";
import { understand } from "../services/becca/matcher";
import { normalizeAsk } from "../services/becca/askNormaliser";
import { capabilitiesFor, getCapability } from "../services/becca/registry";
import type { ChatSuggestion } from "../services/becca/types";

// Link-only pros take bookings on their own booking site. Becca keeps to the
// capabilities marked `fitsLinkOnly`; anything else is "not part of your
// setup" (user decision 2026-10-20, FUTURE_LOGIC "Link-only pros still see
// full-service features", item 5).
const FITS_LINK_ONLY = ["pv.inbox", "pv.notifications", "pv.hours", "pv.reach", "pv.availability", "pv.help"];

const linkOnly = (message: string) =>
  converse({ message, hat: "provider", bookings: [], linkOnly: true, conversation: { entities: {} } });

/** Every ask chip must land on a capability a link-only pro has. */
function expectChipsFit(suggestions: ChatSuggestion[] | undefined) {
  expect(suggestions?.length).toBeGreaterThan(0);
  for (const s of suggestions ?? []) {
    const ask = s.data?.message;
    if (s.action === "navigate" || !ask) continue;
    const id = understand(normalizeAsk(ask), {}, "provider").capabilityId;
    expect(FITS_LINK_ONLY).toContain(id);
  }
}

describe("Becca for link-only pros", () => {
  it("marks exactly the agreed capabilities as fitting", () => {
    const marked = capabilitiesFor("provider").filter((c) => c.fitsLinkOnly).map((c) => c.id).sort();
    expect(marked).toEqual([...FITS_LINK_ONLY].sort());
  });

  it.each(["What's on today?", "How's my week?", "Who's on my waitlist?", "What are my reviews?", "What do I charge?", "set my daily limit"])(
    "answers %p with not-part-of-your-setup, and offers only fitting chips",
    async (message) => {
      const { message: reply } = await linkOnly(message);
      expect(reply.content).toContain("isn't part of your setup");
      expectChipsFit(reply.suggestions);
    },
  );

  it("lists only what fits when asked what she can do", async () => {
    const { message: reply } = await linkOnly("What can you do?");
    expect(reply.content).toContain("live on your own booking site");
    expect(reply.content).not.toMatch(/waitlist|reviews|automations|info packs/i);
    expectChipsFit(reply.suggestions);
  });

  it("offers only fitting chips when she doesn't understand", async () => {
    const { message: reply } = await linkOnly("zzqx blorp");
    expectChipsFit(reply.suggestions);
  });

  it("routes every fitting chip message to a fitting capability", () => {
    for (const message of ["Any unread messages?", "Any updates?", "What are my working hours?", "How many followers have I got?", "What can you do?"]) {
      const id = understand(normalizeAsk(message), {}, "provider").capabilityId;
      expect(FITS_LINK_ONLY).toContain(id);
      expect(getCapability(id!, "provider")?.fitsLinkOnly).toBe(true);
    }
  });

  it("leaves a full provider exactly as before", async () => {
    const { message: reply } = await converse({ message: "What can you do?", hat: "provider", bookings: [], conversation: { entities: {} } });
    expect(reply.content).toContain("Diary & capacity");
    expect(reply.suggestions?.map((s) => s.data?.message)).toContain("What's on today?");
  });
});
