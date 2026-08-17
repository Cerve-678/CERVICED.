import {
  ALL_CAPABILITIES,
  capabilitiesFor,
  toToolSchema,
} from "../services/becca/registry";
import { isBeccaNavigationSuggestion } from "../services/becca/navigationContract";
import type { ChatSuggestion } from "../services/becca/types";

describe("Becca capability contract", () => {
  it("registers every capability with a unique id, hat, description and phrases", () => {
    const ids = new Set<string>();
    for (const capability of ALL_CAPABILITIES) {
      expect(capability.id).toBeTruthy();
      expect(ids.has(capability.id)).toBe(false);
      ids.add(capability.id);
      expect(["client", "provider"]).toContain(capability.hat);
      expect(capability.describe.trim().length).toBeGreaterThan(3);
      expect(capability.phrases.length).toBeGreaterThan(0);
      expect(typeof capability.run).toBe("function");
    }
  });

  it("exposes each hat's registered capabilities as an AI tool schema", () => {
    for (const hat of ["client", "provider"] as const) {
      const capabilities = capabilitiesFor(hat);
      const tools = toToolSchema(hat);
      expect(tools.map((tool) => tool.name).sort()).toEqual(
        capabilities.map((capability) => capability.id).sort(),
      );
      expect(tools.every((tool) => tool.input_schema.type === "object")).toBe(true);
    }
  });

  it("accepts only navigation targets the matching Becca stack can fulfil", () => {
    const clientBooking: ChatSuggestion = {
      id: "booking",
      text: "View booking",
      action: "navigate",
      data: { screen: "BookingDetail", params: { bookingId: "booking-id" } },
    };
    const providerBooking: ChatSuggestion = {
      id: "booking",
      text: "View booking",
      action: "navigate",
      data: { screen: "BookingDetail", params: { bookingId: "booking-id" } },
    };
    const clientProfile: ChatSuggestion = {
      id: "profile",
      text: "Open password settings",
      action: "navigate",
      data: { screen: "Profile", params: { profileScreen: "ChangePassword" } },
    };
    const invalid: ChatSuggestion = {
      id: "invalid",
      text: "Broken",
      action: "navigate",
      data: { screen: "NotARealScreen" },
    };

    expect(isBeccaNavigationSuggestion("client", clientBooking)).toBe(true);
    expect(isBeccaNavigationSuggestion("provider", providerBooking)).toBe(true);
    expect(isBeccaNavigationSuggestion("client", clientProfile)).toBe(true);
    expect(isBeccaNavigationSuggestion("client", invalid)).toBe(false);
    expect(isBeccaNavigationSuggestion("provider", invalid)).toBe(false);
  });
});
