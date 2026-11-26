import { readFileSync } from "fs";
import { join } from "path";
import { normalizeAsk } from "../services/becca/askNormaliser";
import { understand } from "../services/becca/matcher";
import { getCapability } from "../services/becca/registry";
import { LINK_ONLY_PROVIDER_NAV, PROVIDER_PUSH_NAV } from "../services/becca/navigationContract";
import type { CapabilityContext } from "../services/becca/types";
import { getMyProviderProfile } from "../services/databaseService";

/**
 * "change my branding" and "share my profile link" were the two provider asks
 * the 11-26 sweep left unanswered. Branding wasn't a screen Becca could open,
 * and nothing answered with the page link the QR sheet already builds.
 */

jest.mock("../services/databaseService", () => ({
  getMyProviderProfile: jest.fn(),
}));
const mockedProfile = getMyProviderProfile as jest.Mock;

const route = (message: string) => understand(normalizeAsk(message), {}, "provider").capabilityId;
const context = (rawMessage: string, linkOnly = false): CapabilityContext => ({
  rawMessage,
  verbatimMessage: rawMessage,
  hat: "provider",
  entities: {},
  bookings: [],
  now: new Date("2026-11-26T12:00:00Z"),
  linkOnly,
});

describe("branding", () => {
  it.each(["change my branding", "where do i change my page style", "my branding", "edit my logo"])(
    "%p is a request to open Branding",
    (message) => {
      expect(route(message)).toBe("pv.app_navigation");
    },
  );

  it.each([false, true])("opens Branding (link-only: %s)", async (linkOnly) => {
    const result = await getCapability("pv.app_navigation", "provider")!.run(context("change my branding", linkOnly));
    expect(result.text).toContain("Branding");
    expect(result.suggestions?.[0]?.data?.screen).toBe("branding");
  });

  it("is a screen Becca's own provider stack can push, for both setups", () => {
    expect(PROVIDER_PUSH_NAV["branding"]).toBe("Branding");
    expect(LINK_ONLY_PROVIDER_NAV.has("branding")).toBe(true);
    const navigator = readFileSync(
      join(__dirname, "../navigation/provider/tabs/ProviderBeccaNavigator.tsx"),
      "utf8",
    );
    expect(navigator).toMatch(/name="Branding"/);
    // Branding's "see more" for a link-only pro pushes this; without it the
    // tap would do nothing inside Becca's stack.
    expect(navigator).toMatch(/name="FullCervicedFeatures"/);
  });
});

describe("share link", () => {
  beforeEach(() => mockedProfile.mockReset());

  it.each(["share my profile link", "what's my page link", "my qr code", "link to my page"])(
    "%p asks for their page link",
    (message) => {
      expect(route(message)).toBe("pv.share_link");
    },
  );

  it("gives the link their QR and Share use", async () => {
    mockedProfile.mockResolvedValue({ slug: "lola-studio", has_gone_live: true });
    const result = await getCapability("pv.share_link", "provider")!.run(context("share my profile link"));
    expect(result.text).toContain("cerviced.co/@lola-studio");
    expect(result.text).toMatch(/QR/);
  });

  it("says it won't open yet when the page isn't live", async () => {
    mockedProfile.mockResolvedValue({ slug: "lola-studio", has_gone_live: false });
    const result = await getCapability("pv.share_link", "provider")!.run(context("share my profile link"));
    expect(result.text).toMatch(/once your profile is live/i);
  });

  // The QR button it points to is on My Profile, which link-only pros don't
  // have, so it stays full-service until that's decided.
  it("is full-service only", () => {
    expect(getCapability("pv.share_link", "provider")!.fitsLinkOnly).toBeUndefined();
  });
});
