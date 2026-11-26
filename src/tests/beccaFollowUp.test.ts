import { converse } from "../services/becca/engine";

describe("Becca contextual follow-ups", () => {
  it.each([
    ["Hello", "client", "Hi — what would you like help with today?"],
    ["good evening!", "provider", "Hi — I’m here to help you stay on top of your business."],
    ["What's your name?", "client", "I’m Becca, CERVICED’s beauty and booking assistant."],
    ["what is your name", "provider", "I’m Becca, CERVICED’s business assistant."],
    ["what is ur nsme", "client", "I’m Becca, CERVICED’s beauty and booking assistant."],
    ["who are you", "client", "I’m Becca, CERVICED’s beauty and booking assistant."],
  ] as const)("responds conversationally to %p", async (message, hat, expected) => {
    const reply = await converse({ message, hat, bookings: [] });

    expect(reply.message.content).toContain(expected);
    expect(reply.message.suggestions?.length).toBeGreaterThan(0);
  });

  it.each(["set", "set mit", "set limt", "set lmit", "yes please"])(
    "treats '%s' after a capacity answer as setting the daily booking limit",
    async (message) => {
    const reply = await converse({
      message,
      hat: "provider",
      bookings: [],
      conversation: {
        entities: {},
        lastCapabilityId: "pv.capacity",
      },
    });

    expect(reply.message.content).toContain("maximum bookings per day");
    expect(reply.message.suggestions).toEqual([
      expect.objectContaining({
        text: "Set a daily limit",
        data: { screen: "bookingRules" },
      }),
    ]);
    expect(reply.context.lastCapabilityId).toBe("pv.capacity");
    },
  );

  it("recognises a misspelled explicit limit request after a chat has been restored", async () => {
    const reply = await converse({
      message: "set lmit",
      hat: "provider",
      bookings: [],
      conversation: { entities: {} },
    });

    expect(reply.message.suggestions?.[0]).toMatchObject({
      text: "Set a daily limit",
      data: { screen: "bookingRules" },
    });
  });
});
