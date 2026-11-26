/**
 * The website's copy of the app's fonts. The app waits for every font in
 * APP_FONTS before it draws (useFonts in App.tsx). A web page can't: that is
 * ~70 files, several MB, on someone's phone data, for a page that uses two or
 * three of them. So the site only declares each one as an @font-face, and the
 * browser downloads a font the first time something on the page is drawn in
 * it. `font-display: swap` shows the text at once in a fallback and swaps the
 * real font in when it arrives.
 */
import { Asset } from 'expo-asset';
import type { FontSource } from 'expo-font';
import { APP_FONTS } from '../constants/appFonts';

const STYLE_ELEMENT_ID = 'cerviced-app-fonts';

/** A bundled font's served address, or null for a source this can't place. */
function fontUri(source: FontSource): string | null {
  if (typeof source === 'string') return source.length > 0 ? source : null;
  if (typeof source === 'number') return Asset.fromModule(source).uri || null;
  return null;
}

/** One @font-face rule per font, named exactly as the app names it. */
export function fontFaceCss(fonts: Record<string, FontSource>, uriOf: (source: FontSource) => string | null): string {
  return Object.entries(fonts)
    .map(([family, source]) => {
      const uri = uriOf(source);
      if (!uri) return '';
      return `@font-face{font-family:${JSON.stringify(family)};src:url(${JSON.stringify(uri)});font-display:swap;}`;
    })
    .filter((rule) => rule.length > 0)
    .join('\n');
}

/** Adds the rules to the page once. Safe to call more than once. */
export function declareAppFontsForBrowser(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ELEMENT_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = fontFaceCss(APP_FONTS, fontUri);
  document.head.appendChild(style);
}
