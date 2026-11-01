import {
  isProviderProfileUuid,
  parseProviderProfileDeepLink,
  providerProfileDeepLink,
} from "../utils/providerProfileDeepLink";

const PROVIDER_ID = "d631959b-468c-4a94-a4d3-df69bf4c5687";
const PROVIDER_SLUG = "glo-installs";

describe("provider profile QR deep links", () => {
  it("builds the public-slug app-scheme URL encoded by a new provider QR", () => {
    expect(providerProfileDeepLink(PROVIDER_SLUG)).toBe(
      `cerviced://provider/${PROVIDER_SLUG}`,
    );
  });

  it("accepts an exact public slug or legacy provider UUID route", () => {
    expect(
      parseProviderProfileDeepLink(`cerviced://provider/${PROVIDER_ID}`),
    ).toBe(PROVIDER_ID);
    expect(
      parseProviderProfileDeepLink(`cerviced://provider/${PROVIDER_SLUG}`),
    ).toBe(PROVIDER_SLUG);
    expect(
      parseProviderProfileDeepLink(
        `CERVICED://provider/${PROVIDER_ID}?source=qr`,
      ),
    ).toBe(PROVIDER_ID);
    expect(
      parseProviderProfileDeepLink("cerviced://stripe-redirect"),
    ).toBeNull();
    expect(
      parseProviderProfileDeepLink("cerviced://provider/not_a_provider"),
    ).toBeNull();
    expect(
      parseProviderProfileDeepLink(`cerviced://providers/${PROVIDER_ID}`),
    ).toBeNull();
  });

  it("identifies only legacy UUID targets for lookup", () => {
    expect(isProviderProfileUuid(PROVIDER_ID)).toBe(true);
    expect(isProviderProfileUuid(PROVIDER_SLUG)).toBe(false);
  });
});
