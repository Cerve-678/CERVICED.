import * as WebBrowser from 'expo-web-browser';
import { logger } from './logger';

// The public Terms & Policies page (waitlist/legal/index.html, served by
// Vercel from main). The sign-in screens link to its sections so the words
// "Terms of Service" and "Privacy Policy" open the real text.
export const LEGAL_PAGE_URL = 'https://www.cerviced.co/legal';

export type LegalSection = 'terms' | 'privacy';

export function legalPageUrl(section: LegalSection): string {
  return `${LEGAL_PAGE_URL}#${section}`;
}

/** Opens a section of the legal page in the in-app browser sheet. */
export function openLegalPage(section: LegalSection): void {
  WebBrowser.openBrowserAsync(legalPageUrl(section), {
    dismissButtonStyle: 'done',
    showTitle: true,
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
  }).catch(error => logger.error('Could not open the legal page', error));
}
