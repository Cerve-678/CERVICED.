const UUID =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
const PROVIDER_PROFILE_LINK = new RegExp(
  `^cerviced://provider/(${UUID}|${SLUG})(?:[/?#]|$)`,
  "i",
);
const PROVIDER_UUID = new RegExp(`^${UUID}$`, "i");

/** The provider's page on the website, www.cerviced.co/@handle: what their
 *  profile QR holds and what Share sends. It opens in any phone's browser,
 *  with or without the app. www, because the bare domain redirects there. */
export function providerWebPageUrl(providerSlug: string): string {
  return `https://www.cerviced.co/@${providerSlug.trim().toLowerCase()}`;
}

/** The provider slug or legacy UUID in an app link, cerviced://provider/<key>.
 *  Profile QRs no longer make these, but ones already printed still open the
 *  profile in the app (RootNavigation). */
export function parseProviderProfileDeepLink(url: string): string | null {
  const match = PROVIDER_PROFILE_LINK.exec(url.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

/** Legacy printed QR codes contain UUIDs; newer ones contain slugs. */
export function isProviderProfileUuid(value: string): boolean {
  return PROVIDER_UUID.test(value);
}
