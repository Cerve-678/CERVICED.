const UUID =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
const PROVIDER_PROFILE_LINK = new RegExp(
  `^cerviced://provider/(${UUID}|${SLUG})(?:[/?#]|$)`,
  "i",
);
const PROVIDER_UUID = new RegExp(`^${UUID}$`, "i");

/** A QR-safe link for one public CERVICED provider profile.
 *
 * QR codes now carry the public slug. It is already what the profile screen
 * consumes, so scanning does not need an extra UUID-to-slug database lookup.
 */
export function providerProfileDeepLink(providerSlug: string): string {
  return `cerviced://provider/${providerSlug.trim().toLowerCase()}`;
}

/** Returns a provider slug or legacy provider UUID for an exact CERVICED QR/deep-link. */
export function parseProviderProfileDeepLink(url: string): string | null {
  const match = PROVIDER_PROFILE_LINK.exec(url.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

/** Legacy printed QR codes contain UUIDs; newly generated ones contain slugs. */
export function isProviderProfileUuid(value: string): boolean {
  return PROVIDER_UUID.test(value);
}
