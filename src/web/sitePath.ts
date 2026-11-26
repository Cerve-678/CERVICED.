/**
 * Which page of the website an address asks for. The site's own pages (Home,
 * About, Legal) are static HTML that Vercel serves before this app loads, so
 * the app only ever sees a provider's page and the developer previews.
 */

/** A provider's public handle: providers.slug, as in www.cerviced.co/@handle.
 *  Every live slug is lowercase letters, digits, ".", "_" and "-". */
const HANDLE_PATTERN = /^[a-z0-9._-]{1,64}$/;

export type SitePage =
  | { kind: 'provider'; handle: string }
  | { kind: 'pageStylePreview'; styleKey: string | null }
  | { kind: 'notFound' };

/** Turns `location.pathname` (and `location.search`, for the preview) into a page.
 *  `/@Halo.Lash/` and `/@halo.lash` are the same provider. The preview is
 *  only reachable in a development build: `devPreview` is `__DEV__`. */
export function parseSitePath(pathname: string, search: string, devPreview: boolean): SitePage {
  let path: string;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return { kind: 'notFound' };
  }
  path = path.replace(/\/+$/, '');

  if (path.startsWith('/@')) {
    const handle = path.slice(2).toLowerCase();
    return HANDLE_PATTERN.test(handle) ? { kind: 'provider', handle } : { kind: 'notFound' };
  }

  if (devPreview && path === '/_dev/page-styles') {
    const styleKey = new URLSearchParams(search).get('style');
    return { kind: 'pageStylePreview', styleKey: styleKey && styleKey.length > 0 ? styleKey : null };
  }

  return { kind: 'notFound' };
}
