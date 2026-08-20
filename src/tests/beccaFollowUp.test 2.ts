import { converse } from "../services/becca/engine";

describe("Becca contextual follow-ups", () => {
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
