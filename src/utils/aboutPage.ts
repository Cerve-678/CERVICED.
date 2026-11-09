import * as WebBrowser from 'expo-web-browser';
import { logger } from './logger';

// The public About page (waitlist/about/index.html, served by Vercel from
// main). It replaced the in-app About screen on 2026-11-08, so it is the only
// copy of the About text: the About rows in Profile, Provider Account and the
// Help Centre all open it.
export const ABOUT_PAGE_URL = 'https://www.cerviced.co/about';

/** Opens the About page in the in-app browser sheet. */
export function openAboutPage(): void {
  WebBrowser.openBrowserAsync(ABOUT_PAGE_URL, {
    dismissButtonStyle: 'done',
    showTitle: true,
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
  }).catch(error => logger.error('Could not open the About page', error));
}
