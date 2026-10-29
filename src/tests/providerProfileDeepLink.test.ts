import {
  parseProviderProfileDeepLink,
  providerProfileDeepLink,
} from "../utils/providerProfileDeepLink";

const PROVIDER_ID = "d631959b-468c-4a94-a4d3-df69bf4c5687";

describe("provider profile QR deep links", () => {
  it("builds the app-scheme URL encoded by a provider QR", () => {
    expect(providerProfileDeepLink(PROVIDER_ID)).toBe(
      `cerviced://provider/${PROVIDER_ID}`,
    );
  });

  it("accepts only an exact provider UUID route", () => {
    expect(
      parseProviderProfileDeepLink(`cerviced://provider/${PROVIDER_ID}`),
    ).toBe(PROVIDER_ID);
    expect(
      parseProviderProfileDeepLink(
        `CERVICED://provider/${PROVIDER_ID}?source=qr`,
      ),
    ).toBe(PROVIDER_ID);
    expect(
      parseProviderProfileDeepLink("cerviced://stripe-redirect"),
    ).toBeNull();
    expect(
      parseProviderProfileDeepLink("cerviced://provider/not-a-provider"),
    ).toBeNull();
    expect(
      parseProviderProfileDeepLink(`cerviced://providers/${PROVIDER_ID}`),
    ).toBeNull();
  });
});
