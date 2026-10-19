import { AppState } from "react-native";
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

/** Their booking link as people read it: "fresha.com/a/studio", without
 *  https://, www. or a trailing slash. Null if it isn't a usable link. */
export function displayExternalBookingUrl(raw: string | null | undefined): string | null {
  const url = normalizeExternalBookingUrl(raw);
  if (!url) return null;
  const { hostname, pathname, search } = new URL(url);
  return `${hostname.replace(/^www\./, '')}${pathname === '/' ? '' : pathname.replace(/\/$/, '')}${search}`;
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
 *
 * Resolves when the page is CLOSED on iOS (`type: 'cancel' | 'dismiss'`).
 * Android's Custom Tab resolves as soon as it OPENS (`type: 'opened'`), so a
 * caller that needs "the client came back" waits for the app to be active
 * again there instead — see waitUntilBackFromBrowser.
 */
export async function openExternalBookingPage(raw: string): Promise<WebBrowser.WebBrowserResult> {
  const url = normalizeExternalBookingUrl(raw);
  if (!url) throw new Error(`Invalid external booking URL: ${raw}`);
  return WebBrowser.openBrowserAsync(url, {
    dismissButtonStyle: "done",
    showTitle: true,
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
  });
}

/**
 * Resolves once the client is back in CERVICED after their booking page
 * closes. On iOS the browser result already means that; on Android the
 * Custom Tab result arrives at open time, so wait for the app to come back
 * to the foreground.
 */
export function waitUntilBackFromBrowser(result: WebBrowser.WebBrowserResult): Promise<void> {
  if (result.type !== 'opened') return Promise.resolve();
  return new Promise(resolve => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        subscription.remove();
        resolve();
      }
    });
  });
}
