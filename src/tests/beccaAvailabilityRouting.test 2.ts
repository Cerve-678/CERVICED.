import { understand } from "../services/becca/matcher";

describe("Becca availability routing", () => {
  it("treats a service-free availability question as a real search, not a booking question", () => {
    const result = understand("Who's free this week?", {}, "client");

    expect(result.capabilityId).toBe("discover.available");
    expect(result.confidence).toBe("high");
  });

  it("keeps a service filter when the client supplies one", () => {
    const result = understand(
      "Who is free for nails this week?",
      {
        service: {
          kind: "service",
          value: { category: "NAILS" },
          confidence: 1,
          sourceText: "nails",
          label: "nails",
        },
      },
      "client",
    );

    expect(result.capabilityId).toBe("discover.available");
    expect(result.confidence).toBe("high");
  });
});
