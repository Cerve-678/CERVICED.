import React from 'react';
import { render, screen } from '@testing-library/react-native';
import HomeScreen from '../screens/client/HomeScreen';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ navigate: jest.fn() }),
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

jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('../contexts/BookingContext', () => ({ useBooking: () => ({ bookings: [] }) }));
jest.mock('../stores/useBookmarkStore', () => ({
  useBookmarkStore: () => ({ bookmarkedIds: [], loadBookmarks: jest.fn(() => new Promise(() => {})) }),
}));
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
  getProviders: jest.fn(() => new Promise(() => {})),
  getTopRatedProviders: jest.fn(() => new Promise(() => {})),
  getUnreadNotificationCount: jest.fn(() => new Promise(() => {})),
}));

describe('HomeScreen', () => {
  it('renders the client home entry point', () => {
    render(<HomeScreen />);

    expect(screen.getByText('CERVICED')).toBeTruthy();
    expect(screen.getByText('CHOOSE YOUR SERVICE')).toBeTruthy();
  });
});
