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
  {
    id: 'trending',
    title: 'TRENDING THIS WEEK',
    dataKey: 'trending',
    cardStyle: 'provider',
    showWhen: (_u, data) => (data.trending?.length ?? 0) > 0,
  },
];
