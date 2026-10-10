import * as WebBrowser from "expo-web-browser";

/**
 * A provider's external booking link (Fresha, Treatwell, Acuity, …) as a URL
 * the in-app browser can actually load, or null if it can't be one.
 *
 * Providers type this themselves, so "fresha.com/a/studio" with no scheme is
 * normal input — it gets https:// rather than failing. Anything that already
 * names a different scheme (mailto:, javascript:, a custom app scheme) is
 * refused: this link is only ever a booking web page.
 */
export function normalizeExternalBookingUrl(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Opens a provider's external booking page inside the app (SFSafariViewController
 * / Chrome Custom Tabs) rather than kicking the client out to their browser, so
 * closing it lands them back on the provider's profile.
 *
 * Only for external booking — contact links (phone, email, WhatsApp, Instagram,
 * website) deliberately keep opening in their own apps via Linking.
 *
 * Throws if the link isn't a usable web address or the browser can't open.
 */
export async function openExternalBookingPage(raw: string): Promise<void> {
  const url = normalizeExternalBookingUrl(raw);
  if (!url) throw new Error(`Invalid external booking URL: ${raw}`);
  await WebBrowser.openBrowserAsync(url, {
    dismissButtonStyle: "done",
    showTitle: true,
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
  });
}
