// src/config/homeSections.ts
// Phase 5.3 — Config-driven home section definitions.
// Currently used for showWhen guards; full data-driven rendering is a future pass.

export type CardStyle = 'brand' | 'provider' | 'round' | 'offer';

export interface HomeSectionConfig {
  id:            string;
  title:         string;
  dataKey:       string;           // key in the home data object (providersData.*)
  cardStyle:     CardStyle;
  showWhen?:     (user: any, data: any) => boolean;
  viewAllRoute?: string;
  maxCollapsed?: number;
}

export const HOME_SECTIONS: HomeSectionConfig[] = [
  {
    id: 'your-providers',
    title: 'YOUR PROVIDERS',
    dataKey: 'yourProviders',
    cardStyle: 'brand',
    viewAllRoute: 'BookmarkedProviders',
    showWhen: (_u, data) => (data.yourProviders?.length ?? 0) > 0,
  },
  {
    id: 'recommended',
    title: 'RECOMMENDED FOR YOU',
    dataKey: 'recommended',
    cardStyle: 'brand',
    maxCollapsed: 7,
  },
  {
    id: 'trending',
    title: 'TRENDING THIS WEEK',
    dataKey: 'trending',
    cardStyle: 'provider',
    showWhen: (_u, data) => (data.trending?.length ?? 0) > 0,
  },
  {
    id: 'new-providers',
    title: 'NEW ON CERVICED',
    dataKey: 'newProviders',
    cardStyle: 'brand',
    showWhen: (_u, data) => (data.newProviders?.length ?? 0) > 0,
  },
  {
    id: 'top-rated',
    title: 'TOP RATED',
    dataKey: 'topRated',
    cardStyle: 'provider',
    showWhen: (_u, data) => (data.topRated?.length ?? 0) > 0,
  },
  {
    id: 'male-services',
    title: 'MALE SERVICES',
    // maleProviders is providers with service_category === 'MALE' widened by
    // any provider with at least one service tagged services.audience ===
    // 'men' — see HomeScreen.tsx's maleServiceProviderIds. Not gated here on
    // that widening directly since data.maleProviders already reflects it.
    //
    // showWhen no longer decides whether the section renders at all — a
    // provider who's tagged a service for this audience should still be
    // discoverable by every client, not just ones who happen to match its
    // gender. It now decides POSITION: true = the section's normal early
    // slot (relevant to this viewer, or gender/interests unknown), false =
    // pushed to the bottom of the feed, just above Book Again (present, but
    // deprioritized rather than hidden). See HomeScreen.tsx's
    // maleSectionRelevant / hasMaleSectionData.
    dataKey: 'maleProviders',
    cardStyle: 'brand',
    showWhen: (user, data) => {
      if (!(data.maleProviders?.length)) return false;
      if (user?.gender === 'male') return true;
      if (user?.service_interests?.includes('MALE')) return true;
      return !user?.gender;
    },
  },
  {
    id: 'kids-services',
    title: 'KIDS SERVICES',
    // Same "position, not visibility" meaning as male-services above.
    dataKey: 'kidsProviders',
    cardStyle: 'brand',
    showWhen: (user, data) => {
      if (!(data.kidsProviders?.length)) return false;
      if (user?.has_kids) return true;
      if (user?.service_interests?.includes('KIDS')) return true;
      return user?.has_kids === null || user?.has_kids === undefined;
    },
  },
  {
    id: 'recently-viewed',
    title: 'RECENTLY VIEWED',
    dataKey: 'recentlyViewed',
    cardStyle: 'round',
    showWhen: (_u, data) => (data.recentlyViewed?.length ?? 0) > 0,
  },
];
