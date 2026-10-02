import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import HomeScreen from '../screens/client/HomeScreen';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ navigate: jest.fn() }),
  useIsFocused: () => true,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock('../contexts/ThemeContext', () => ({
  useEnterpriseTheme: () => ({ isDarkMode: false, theme: {} }),
  useTheme: () => ({
    isDarkMode: false,
    palette: new Proxy({}, { get: () => '#1A1815' }),
    theme: {},
  }),
}));
jest.mock('../components/LocationModal', () => () => null);
jest.mock('../services/clientLocationService', () => ({
  resolveClientLocation: jest.fn(async () => ({ coords: null })),
}));

jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('../contexts/BookingContext', () => {
  const value = { bookings: [] };
  return { useBooking: () => value };
});
jest.mock('../stores/useBookmarkStore', () => {
  const value = { bookmarkedIds: [], loadBookmarks: jest.fn(() => new Promise(() => {})) };
  return { useBookmarkStore: () => value };
});
jest.mock('../services/userLearningService', () => ({
  __esModule: true,
  default: {
    getOrderedServiceCategories: jest.fn(() => new Promise(() => {})),
    getPersonalizedProviders: jest.fn(() => new Promise(() => {})),
    initialize: jest.fn(() => new Promise(() => {})),
    setUserProfile: jest.fn(),
  },
}));
jest.mock('../services/databaseService', () => ({
  getActivePromotions: jest.fn(() => new Promise(() => {})),
  getNewProviders: jest.fn(() => new Promise(() => {})),
  getOwnProviderIds: jest.fn(async () => []),
  getProviders: jest.fn(async () => [{ id: 'salon-1', slug: 'test-salon', display_name: 'Test Salon', service_category: 'HAIR' }]),
  getTopRatedProviders: jest.fn(() => new Promise(() => {})),
  getTrendingProviders: jest.fn(() => new Promise(() => {})),
  getDiscoverServices: jest.fn(() => new Promise(() => {})),
  getProviderIdsByServiceAudience: jest.fn(() => new Promise(() => {})),
  getUnreadNotificationCount: jest.fn(() => new Promise(() => {})),
  prefetchProviderBySlug: jest.fn(),
}));

describe('HomeScreen', () => {
  it('renders the client home entry point', async () => {
    render(<HomeScreen />);

    expect(screen.getByText('CERVICED')).toBeTruthy();
    expect(screen.getByText('CHOOSE YOUR SERVICE')).toBeTruthy();
    // Personalisation stays pending; the provider rails must still populate.
    await waitFor(() => expect(screen.getAllByText('Test Salon').length).toBeGreaterThan(0));
  });
});
