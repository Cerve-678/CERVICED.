import { respond } from "../services/becca/engine";
import { abandonMiss, trackTurn, type BeccaTurn, type PendingMiss } from "../services/becca/missLog";
import type { ChatSuggestion } from "../services/becca/types";

jest.mock("../services/databaseService", () => ({
  searchProviders: jest.fn(async () => []),
  getBookmarkedProviders: jest.fn(async () => []),
}));

const alt = (i: number, message: string): ChatSuggestion =>
  ({ id: `alt-${i}`, text: message, action: "message", data: { message } }) as ChatSuggestion;

const missReply = (...offered: string[]): BeccaTurn["reply"] => ({
  understood: { capabilityId: null },
  suggestions: offered.map((m, i) => alt(i, m)),
});
const hit = (capabilityId: string): BeccaTurn["reply"] => ({ understood: { capabilityId } });

const typed = (sent: string, reply: BeccaTurn["reply"], hat: BeccaTurn["hat"] = "client"): BeccaTurn =>
  ({ hat, sent, fromChip: false, reply });
const tapped = (sent: string, reply: BeccaTurn["reply"], hat: BeccaTurn["hat"] = "client"): BeccaTurn =>
  ({ hat, sent, fromChip: true, reply });

const held: PendingMiss = { hat: "client", message: "wen do i go", offered: ["Your next appointment"] };

describe("the miss log", () => {
  it("holds a typed miss with the options Becca offered, recording nothing yet", () => {
    const out = trackTurn(null, typed("wen do i go", missReply("Your next appointment", "Cancel a booking")));
    expect(out.records).toEqual([]);
    expect(out.pending).toEqual({ hat: "client", message: "wen do i go", offered: ["Your next appointment", "Cancel a booking"] });
  });

  it("records a rescue when the person taps one of those options", () => {
    const out = trackTurn(held, tapped("Your next appointment", hit("booking.next")));
    expect(out.pending).toBeNull();
    expect(out.records).toEqual([
      { hat: "client", message: "wen do i go", resolvedCapabilityId: "booking.next", resolvedBy: "chip" },
    ]);
  });

  it("records a reword when the person asks again and Becca gets it", () => {
    const out = trackTurn(held, typed("when is my next appointment", hit("booking.next")));
    expect(out.records).toEqual([
      { hat: "client", message: "wen do i go", resolvedCapabilityId: "booking.next", resolvedBy: "reworded" },
    ]);
  });

  it("keeps waiting when the person taps a chip that wasn't one of the options", () => {
    const out = trackTurn(held, tapped("What can you do?", hit("meta.help")));
    expect(out).toEqual({ pending: held, records: [] });
  });

  it("keeps waiting through a reply that wasn't an attempt to understand", () => {
    expect(trackTurn(held, typed("thanks", {}))).toEqual({ pending: held, records: [] });
  });

  it("records the old miss as unanswered when the next question misses too", () => {
    const out = trackTurn(held, typed("ugh never mind the thing", missReply()));
    expect(out.records).toEqual([
      { hat: "client", message: "wen do i go", resolvedCapabilityId: null, resolvedBy: null },
    ]);
    expect(out.pending?.message).toBe("ugh never mind the thing");
  });

  it("never holds Becca's own words: a tapped chip that misses isn't a miss", () => {
    expect(trackTurn(null, tapped("Some chip text", missReply()))).toEqual({ pending: null, records: [] });
  });

  it("closes a miss from the other hat as unanswered", () => {
    const out = trackTurn(held, typed("show my reviews", hit("pv.reviews"), "provider"));
    expect(out.records).toEqual([
      { hat: "client", message: "wen do i go", resolvedCapabilityId: null, resolvedBy: null },
    ]);
    expect(out.pending).toBeNull();
  });

  it("ignores hits when nothing is held", () => {
    expect(trackTurn(null, typed("show my reviews", hit("pv.reviews")))).toEqual({ pending: null, records: [] });
  });

  it("records a held miss as unanswered when the conversation ends", () => {
    expect(abandonMiss(held)).toEqual([
      { hat: "client", message: "wen do i go", resolvedCapabilityId: null, resolvedBy: null },
    ]);
    expect(abandonMiss(null)).toEqual([]);
  });
});

describe("Becca says what she understood", () => {
  it("marks the honest fallback as a miss", async () => {
    const reply = await respond({ message: "flibbertigibbet wobble", hat: "client", bookings: [] });
    expect(reply.understood).toEqual({ capabilityId: null });
  });

  it("names the capability that answered", async () => {
    const reply = await respond({ message: "show my saved providers", hat: "client", bookings: [] });
    expect(reply.understood).toEqual({ capabilityId: "discover.saved" });
  });
});
