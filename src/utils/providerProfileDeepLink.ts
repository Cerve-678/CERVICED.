const UUID =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const PROVIDER_PROFILE_LINK = new RegExp(
  `^cerviced://provider/(${UUID})(?:[/?#]|$)`,
  "i",
);

/** A QR-safe link for one public CERVICED provider profile. */
export function providerProfileDeepLink(providerId: string): string {
  return `cerviced://provider/${providerId}`;
}

/** Returns a provider id only for the exact CERVICED QR/deep-link shape. */
export function parseProviderProfileDeepLink(url: string): string | null {
  const match = PROVIDER_PROFILE_LINK.exec(url.trim());
  return match?.[1]?.toLowerCase() ?? null;
}
