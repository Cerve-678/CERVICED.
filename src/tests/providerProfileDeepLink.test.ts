import {
  isProviderProfileUuid,
  parseProviderProfileDeepLink,
  providerProfileDeepLink,
  providerProfileWebLink,
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

  it("builds and reads back the cerviced.co/@handle link for an Instagram bio", () => {
    expect(providerProfileWebLink("Glo-Installs ")).toBe("https://www.cerviced.co/@glo-installs");
    expect(parseProviderProfileDeepLink("https://cerviced.co/@glo-installs")).toBe(PROVIDER_SLUG);
    expect(parseProviderProfileDeepLink("https://www.cerviced.co/@glo-installs/?igsh=abc")).toBe(PROVIDER_SLUG);
    expect(parseProviderProfileDeepLink("https://cerviced.co/legal")).toBeNull();
    expect(parseProviderProfileDeepLink("https://cerviced.co.evil.com/@glo-installs")).toBeNull();
    expect(parseProviderProfileDeepLink("https://cerviced.co/@glo-installs/extra")).toBeNull();
  });

  it("identifies only legacy UUID targets for lookup", () => {
    expect(isProviderProfileUuid(PROVIDER_ID)).toBe(true);
    expect(isProviderProfileUuid(PROVIDER_SLUG)).toBe(false);
  });
});
