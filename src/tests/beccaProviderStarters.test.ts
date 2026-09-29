import { understand } from "../services/becca/matcher";

// The provider hat's welcome chips send these messages. If a rename in the
// provider capabilities stops one matching, the chip would answer "I didn't
// catch that" instead of the thing its label promised.
describe("Becca's provider starter chips are answered in the chat", () => {
  it.each([
    ["What's on today?", "pv.today"],
    ["How many clients do I have?", "pv.clients"],
    ["Any unread messages?", "pv.inbox"],
    ["How am I doing?", "pv.analytics"],
  ])("routes %p to %s", (message, capabilityId) => {
    expect(understand(message, {}, "provider").capabilityId).toBe(capabilityId);
  });
});

// Every follow-up the four starter answers offer is itself a message, so each
// one must land on an answer too — a chip that falls through to "I didn't
// catch that" is worse than no chip.
describe("Becca's provider follow-up chips are answered in the chat", () => {
  it.each([
    ["What's on tomorrow?", "pv.today"],
    ["How's my week looking?", "pv.week"],
    ["Who's on my waitlist?", "pv.waitlist"],
    ["Who hasn't filled their form in?", "pv.forms"],
    ["Who hasn't been back in a while?", "pv.lapsed"],
    ["What are clients saying?", "pv.reviews"],
    ["How many followers have I got?", "pv.reach"],
  ])("routes %p to %s", (message, capabilityId) => {
    expect(understand(message, {}, "provider").capabilityId).toBe(capabilityId);
  });
});
