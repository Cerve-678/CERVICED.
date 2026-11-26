import {
  isProviderProfileUuid,
  parseProviderProfileDeepLink,
  providerWebPageUrl,
} from "../utils/providerProfileLink";

const PROVIDER_ID = "d631959b-468c-4a94-a4d3-df69bf4c5687";
const PROVIDER_SLUG = "glo-installs";

describe("provider profile links", () => {
  it("points the profile QR and Share at the provider's page on the website", () => {
    expect(providerWebPageUrl(PROVIDER_SLUG)).toBe("https://www.cerviced.co/@glo-installs");
    expect(providerWebPageUrl("  Halo.Lash ")).toBe("https://www.cerviced.co/@halo.lash");
  });

  it("still opens app links from QR codes printed before, by slug or legacy UUID", () => {
    expect(parseProviderProfileDeepLink(`cerviced://provider/${PROVIDER_ID}`)).toBe(PROVIDER_ID);
    expect(parseProviderProfileDeepLink(`cerviced://provider/${PROVIDER_SLUG}`)).toBe(PROVIDER_SLUG);
    expect(parseProviderProfileDeepLink(`CERVICED://provider/${PROVIDER_ID}?source=qr`)).toBe(PROVIDER_ID);
    expect(parseProviderProfileDeepLink("cerviced://stripe-redirect")).toBeNull();
    expect(parseProviderProfileDeepLink("cerviced://provider/not_a_provider")).toBeNull();
    expect(parseProviderProfileDeepLink(`cerviced://providers/${PROVIDER_ID}`)).toBeNull();
  });

  it("identifies only legacy UUID targets for lookup", () => {
    expect(isProviderProfileUuid(PROVIDER_ID)).toBe(true);
    expect(isProviderProfileUuid(PROVIDER_SLUG)).toBe(false);
  });
});
