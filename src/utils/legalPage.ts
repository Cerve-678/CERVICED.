import * as WebBrowser from 'expo-web-browser';
import { logger } from './logger';

// The public Terms & Policies page (waitlist/legal/index.html, served by
// Vercel from main). It is the only copy of the Terms: every "Terms" link in
// the app (sign-in, settings, checkout, a provider agreeing at publish, the
// Terms-changed notice) opens a section of it.
export const LEGAL_PAGE_URL = 'https://www.cerviced.co/legal';

export type LegalSection = 'terms' | 'provider-terms' | 'privacy';

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
