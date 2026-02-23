// src/navigation/types.ts
import { NavigatorScreenParams } from '@react-navigation/native';
import { StackScreenProps } from '@react-navigation/stack';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

// ============================================================================
// STACK PARAM LISTS
// ============================================================================

// Root Stack
export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<TabParamList>;
  DevSettings: undefined;
  SearchScreen: undefined;
  ProviderProfile: { providerId: string; source?: string };
};
// Home Stack
export type HomeStackParamList = {
  HomeMain: undefined;
  ProviderProfile: { providerId: string; source?: string };
  Search: { initialQuery?: string; category?: string };
  Bookings: { openBookingId?: string; openReschedule?: boolean } | undefined;
  BookmarkedProviders: undefined;
  Notifications: undefined;
  CartMain: undefined;
};

// Explore Stack
export type ExploreStackParamList = {
  ExploreMain: { category?: string };
  ProviderProfile: { providerId: string; source?: string };
  Search: { initialQuery?: string; category?: string };
  BookmarkedProviders: undefined;
  CartMain: undefined;
};

// Becca Stack
export type BeccaStackParamList = {
  BeccaMain: { conversationId?: string };
  ProviderProfile: { providerId: string; source?: string };
  Notifications: undefined;
  Bookings: { openBookingId?: string; openReschedule?: boolean } | undefined;
  CartMain: undefined;
};

// Cart Stack
export type CartStackParamList = {
  CartMain: undefined;
  ProviderProfile: { providerId: string; source?: string };
  Bookings: { openBookingId?: string; openReschedule?: boolean } | undefined;
  Notifications: undefined;
};

// Profile Stack
export type ProfileStackParamList = {
  ProfileMain: undefined;
  ProviderProfile: { providerId: string; source?: string };
  Bookings: { openBookingId?: string; openReschedule?: boolean } | undefined;
  BookmarkedProviders: undefined;
  Notifications: undefined;
  CartMain: undefined;
};

// Tab Navigator
export type TabParamList = {
  Becca: NavigatorScreenParams<BeccaStackParamList>;
  Explore: NavigatorScreenParams<ExploreStackParamList>;
  Home: NavigatorScreenParams<HomeStackParamList>;
  Cart: NavigatorScreenParams<CartStackParamList>;
  Profile: NavigatorScreenParams<ProfileStackParamList>;
};

// ============================================================================
// COMPOSITE SCREEN PROPS (for type-safe navigation across stacks and tabs)
// ============================================================================

export type HomeScreenProps<T extends keyof HomeStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, T>,
  CompositeScreenProps<
    BottomTabScreenProps<TabParamList>,
    StackScreenProps<RootStackParamList>
  >
>;

export type ExploreScreenProps<T extends keyof ExploreStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<ExploreStackParamList, T>,
  CompositeScreenProps<
    BottomTabScreenProps<TabParamList>,
    StackScreenProps<RootStackParamList>
  >
>;

export type BeccaScreenProps<T extends keyof BeccaStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<BeccaStackParamList, T>,
  CompositeScreenProps<
    BottomTabScreenProps<TabParamList>,
    StackScreenProps<RootStackParamList>
  >
>;

export type CartScreenProps<T extends keyof CartStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<CartStackParamList, T>,
  CompositeScreenProps<
    BottomTabScreenProps<TabParamList>,
    StackScreenProps<RootStackParamList>
  >
>;

export type ProfileScreenProps<T extends keyof ProfileStackParamList> = CompositeScreenProps<
  NativeStackScreenProps<ProfileStackParamList, T>,
  CompositeScreenProps<
    BottomTabScreenProps<TabParamList>,
    StackScreenProps<RootStackParamList>
  >
>;

// ============================================================================
// LEGACY SUPPORT (for backwards compatibility)
// ============================================================================

export type CartMainScreenProps = CartScreenProps<'CartMain'>;

// ============================================================================
// PROVIDER ID MAPPING
// ============================================================================

export const PROVIDER_ID_MAP: Record<string, string> = {
  'JENNIFER': 'hair-by-jennifer',
  'Hair by Jennifer': 'hair-by-jennifer',
  'KATHRINE': 'styled-by-kathrine',
  'Styled by Kathrine': 'styled-by-kathrine',
  'DIVANA': 'diva-nails',
  'Diva Nails': 'diva-nails',
  'JANA': 'jana-aesthetics',
  'Jana Aesthetics': 'jana-aesthetics',
  'HER BROWS': 'her-brows',
  'Her Brows': 'her-brows',
  'KIKI': 'kiki-nails',
  'Kiki Nails': 'kiki-nails',
  'MYA': 'makeup-by-mya',
  'Makeup by Mya': 'makeup-by-mya',
  'VIKKI': 'vikki-laid',
  'Vikki Laid': 'vikki-laid',
  'LASHED': 'your-lashed',
  'Your Lashed': 'your-lashed',
  'styled-by-kathrine': 'styled-by-kathrine',
  'hair-by-jennifer': 'hair-by-jennifer',
  'diva-nails': 'diva-nails',
  'makeup-by-mya': 'makeup-by-mya',
  'your-lashed': 'your-lashed',
  'vikki-laid': 'vikki-laid',
  'kiki-nails': 'kiki-nails',
  'jana-aesthetics': 'jana-aesthetics',
  'her-brows': 'her-brows',
};

export const getProviderIdFromName = (providerName: string): string => {
  const directMapping = PROVIDER_ID_MAP[providerName];
  if (directMapping) return directMapping;
  
  return providerName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
};

export const getProviderDisplayName = (providerId: string): string => {
  for (const [displayName, id] of Object.entries(PROVIDER_ID_MAP)) {
    if (id === providerId) {
      return displayName;
    }
  }
  
  return providerId
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export const NAVIGATION_SOURCES = {
  HOME: 'home',
  EXPLORE: 'explore', 
  BECCA: 'becca',
  CART: 'cart',
  PROFILE: 'profile',
} as const;

export type NavigationSource = typeof NAVIGATION_SOURCES[keyof typeof NAVIGATION_SOURCES];

export const isValidProviderId = (id: string): boolean => {
  return Object.values(PROVIDER_ID_MAP).includes(id) || /^[a-z0-9-]+$/.test(id);
};