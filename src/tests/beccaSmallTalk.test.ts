import { smallTalkReply } from "../services/becca/smallTalk";
import { converse } from "../services/becca/engine";

const reply = (message: string) => smallTalkReply(message, "client")?.content ?? null;

describe("Becca small talk", () => {
  it.each([
    "how are you",
    "How are you?",
    "hi, how are you",
    "hey becca how r u",
    "how are you doing today",
    "hows it going",
    "you ok?",
  ])("answers %p as being asked how she is", (message) => {
    expect(reply(message)).toMatch(/thanks for asking/);
  });

  it.each([
    "what is your name",
    "whats your name",
    "What's your name, Becca?",
    "what is ur nsme",
    "who are you",
    "what should I call you",
    "are you becca",
  ])("gives her name for %p", (message) => {
    expect(reply(message)).toMatch(/I’m Becca/);
  });

  it.each([
    "can i change your name",
    "Can I call you something else?",
    "can i call you bex",
    "can I rename you",
    "how do i change your name",
  ])("says plainly her name can't be changed for %p", (message) => {
    // No rename setting exists; saying otherwise would promise one.
    expect(reply(message)).toMatch(/isn’t a way to change my name/);
  });

  it.each(["are you a real person", "are you a bot", "am i talking to a human"])(
    "never claims to be a person for %p",
    (message) => {
      expect(reply(message)).toMatch(/I’m not a person/);
    },
  );

  it("tells a good mood from a low one, and notices being asked back", () => {
    expect(reply("im good thanks")).toMatch(/Glad to hear it/);
    expect(reply("good thank you")).toMatch(/Glad to hear it/);
    expect(reply("not bad, you?")).toMatch(/I’m good too/);
    expect(reply("not great tbh")).toMatch(/Sorry to hear that/);
  });

  it("keeps the existing greeting, thanks and goodbye replies", () => {
    expect(reply("hello")).toMatch(/what would you like help with/);
    expect(reply("thanks becca")).toMatch(/You’re welcome/);
    expect(reply("bye")).toMatch(/Speak soon/);
  });

  it("speaks to the provider hat as a business assistant", () => {
    expect(smallTalkReply("whats your name", "provider")?.content).toMatch(/business assistant/);
  });

  it.each([
    "hi, can you find nails?",
    "i am looking for someone who does volume lashes",
    "how are my reviews",
    "how much are nails",
    "what's on today",
    "can i call you tomorrow",
    "what is your cancellation policy",
  ])("leaves a real request alone: %p", (message) => {
    expect(smallTalkReply(message, "client")).toBeNull();
    expect(smallTalkReply(message, "provider")).toBeNull();
  });

  it("answers through the engine without fetching anything", async () => {
    const onProgress = jest.fn();
    const { message } = await converse({ message: "how are you?", hat: "client", bookings: [], onProgress });
    expect(message.content).toMatch(/thanks for asking/);
    // Nothing is looked up for small talk, so no loading steps are claimed.
    expect(onProgress).not.toHaveBeenCalled();
  });
});
