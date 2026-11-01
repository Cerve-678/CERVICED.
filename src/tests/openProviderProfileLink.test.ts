import { openProviderProfileLink } from "../navigation/openProviderProfileLink";
import { requestMode } from "../navigation/modeController";
import { navigationRef } from "../navigation/navigationRef";
import { getProviderBasicById } from "../services/databaseService";

jest.mock("../services/databaseService", () => ({
  getProviderBasicById: jest.fn(),
}));
jest.mock("../navigation/modeController", () => ({
  requestMode: jest.fn(),
}));
jest.mock("../navigation/navigationRef", () => ({
  navigationRef: { isReady: jest.fn(), navigate: jest.fn() },
}));
jest.mock("../utils/logger", () => ({
  logger: { error: jest.fn() },
}));

const PROVIDER_ID = "d631959b-468c-4a94-a4d3-df69bf4c5687";
const lookup = getProviderBasicById as jest.Mock;
const mode = requestMode as jest.Mock;
const ready = navigationRef.isReady as jest.Mock;
const navigate = navigationRef.navigate as jest.Mock;

describe("openProviderProfileLink", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mode.mockResolvedValue("client");
    ready.mockReturnValue(true);
  });

  it("opens a slug straight away, with Home kept underneath for the back button", async () => {
    await expect(openProviderProfileLink("glo-installs")).resolves.toBe(
      "opened",
    );
    expect(lookup).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("MainTabs", {
      screen: "Home",
      params: {
        screen: "ProviderProfile",
        initial: false,
        params: { providerId: "glo-installs", source: "profile_qr" },
      },
    });
  });

  it("turns a legacy printed UUID code into the slug the profile screen needs", async () => {
    lookup.mockResolvedValue({ id: PROVIDER_ID, slug: "glo-installs" });
    await expect(openProviderProfileLink(PROVIDER_ID)).resolves.toBe("opened");
    expect(lookup).toHaveBeenCalledWith(PROVIDER_ID);
    expect(navigate.mock.calls[0][1].params.params.providerId).toBe(
      "glo-installs",
    );
  });

  it("reports a legacy code that no longer matches a provider", async () => {
    lookup.mockResolvedValue(null);
    await expect(openProviderProfileLink(PROVIDER_ID)).resolves.toBe(
      "not_found",
    );
    expect(mode).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("reports a provider-only account instead of doing nothing", async () => {
    mode.mockResolvedValue("provider");
    await expect(openProviderProfileLink("glo-installs")).resolves.toBe(
      "no_client_hat",
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("reports a failed lookup rather than swallowing it", async () => {
    lookup.mockRejectedValue(new Error("offline"));
    await expect(openProviderProfileLink(PROVIDER_ID)).resolves.toBe("failed");
  });

  it("reports when the navigator isn't ready to take the link", async () => {
    ready.mockReturnValue(false);
    await expect(openProviderProfileLink("glo-installs")).resolves.toBe(
      "failed",
    );
    expect(navigate).not.toHaveBeenCalled();
  });
});
