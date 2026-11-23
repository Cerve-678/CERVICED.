/**
 * The website's app: what www.cerviced.co serves for a provider's page
 * (/@handle). Home, About and Legal are static HTML in waitlist/ and never
 * reach this. App.web.tsx renders this in place of the phone app's App.tsx,
 * so the browser bundle holds only the site, not the app's screens.
 */
import React, { useMemo } from 'react';
import { VisitorDisplaySettingsProvider } from '../contexts/DisplaySettingsContext';
import { parseSitePath } from './sitePath';
import { SiteMessagePage } from './SiteMessagePage';
import { PageStylePreview } from './dev/PageStylePreview';
import { ProviderWebPage } from './ProviderWebPage';
import { declareAppFontsForBrowser } from './webFonts';

// Before the first render, so the page's fonts are declared before any text is drawn.
declareAppFontsForBrowser();

export default function SiteApp() {
  return (
    <VisitorDisplaySettingsProvider>
      <SitePage />
    </VisitorDisplaySettingsProvider>
  );
}

function SitePage() {
  const page = useMemo(
    () => parseSitePath(window.location.pathname, window.location.search, __DEV__),
    [],
  );

  switch (page.kind) {
    case 'provider':
      return <ProviderWebPage handle={page.handle} />;
    case 'pageStylePreview':
      return <PageStylePreview styleKey={page.styleKey} />;
    case 'notFound':
      return <SiteMessagePage title="Page not found" body="We couldn't find that page." />;
  }
}
