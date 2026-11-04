const UUID =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
const PROVIDER_PROFILE_LINK = new RegExp(
  `^cerviced://provider/(${UUID}|${SLUG})(?:[/?#]|$)`,
  "i",
);
// The link a provider puts in their Instagram bio. With the app installed it
// opens the profile in the app (universal links); without, the redirect at
// waitlist/open-profile.html sends them to the store.
const PROVIDER_WEB_LINK = new RegExp(
  `^https?://(?:www\\.)?cerviced\\.co/@(${SLUG})/?(?:[?#]|$)`,
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

/** The https link for sharing a profile: Instagram bios, WhatsApp, anywhere
 *  an app-scheme link wouldn't be tappable. www, not the bare domain: the
 *  bare domain redirects to www, and Apple won't follow a redirect when it
 *  checks which app the link belongs to. */
export function providerProfileWebLink(providerSlug: string): string {
  return `https://www.cerviced.co/@${providerSlug.trim().toLowerCase()}`;
}

/** Returns a provider slug or legacy provider UUID for an exact CERVICED QR/deep-link or web link. */
export function parseProviderProfileDeepLink(url: string): string | null {
  const trimmed = url.trim();
  const match = PROVIDER_PROFILE_LINK.exec(trimmed) ?? PROVIDER_WEB_LINK.exec(trimmed);
  return match?.[1]?.toLowerCase() ?? null;
}

/** Legacy printed QR codes contain UUIDs; newly generated ones contain slugs. */
export function isProviderProfileUuid(value: string): boolean {
  return PROVIDER_UUID.test(value);
}
