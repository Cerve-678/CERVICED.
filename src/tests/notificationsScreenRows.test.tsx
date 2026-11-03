import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import NotificationsScreen from '../screens/shared/NotificationsScreen';
import { getMyNotifications } from '../services/databaseService';

jest.mock('../services/databaseService', () => ({
  getMyNotifications: jest.fn(),
  getUnreadNotificationCount: jest.fn().mockResolvedValue(0),
  markNotificationRead: jest.fn().mockResolvedValue(undefined),
  markAllNotificationsRead: jest.fn().mockResolvedValue(undefined),
  deleteNotification: jest.fn().mockResolvedValue(undefined),
  getBookingWithAddOnsById: jest.fn(),
  getProviderBasicById: jest.fn(),
  subscribeToNotificationChanges: jest.fn(() => () => {}),
  forgetCachedReads: jest.fn(),
}));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user' },
    hatState: { active: 'provider', owned: { client: false, provider: true } },
    myBookingMode: 'platform',
  }),
}));
jest.mock('../contexts/ThemeContext', () => {
  const palette = {
    bg: '#F5F1EC', surface: '#EDE8E2', card: '#FFFFFF', accent: '#5C4033', accentText: '#5C4033',
    accentDim: 'rgba(92,64,51,0.12)', onAccent: '#FFFFFF', text: '#000000', sub: '#7E6667',
    border: 'rgba(126,102,103,0.14)', sep: 'rgba(126,102,103,0.08)',
  };
  return { useTheme: () => ({ theme: { statusBar: 'dark-content' }, isDarkMode: false, palette }) };
});
jest.mock('../contexts/FontContext', () => ({
  useFont: () => ({ textStyles: { button: {}, body: {}, caption: {}, h3: {} } }),
}));
jest.mock('../components/ThemedBackground', () => ({
  ThemedBackground: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../components/SafeArea', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../components/SlidingTabs', () => () => null);
jest.mock('../components/IconLibrary', () => ({ BellIcon: () => null }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-notifications', () => ({ setBadgeCountAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));
jest.mock('@react-navigation/native', () => ({
  CommonActions: { goBack: jest.fn() },
  NavigationContext: jest.requireActual('react').createContext(undefined),
}));
jest.mock('../navigation/rootNavigate', () => ({
  navigateNested: jest.fn(),
  navigateTab: jest.fn(),
  navigateAfterDismiss: jest.fn(),
}));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { forwardRef } = jest.requireActual('react');
  return { __esModule: true, default: forwardRef(({ children }: { children: React.ReactNode }, _ref: unknown) => children) };
});
jest.mock('react-native-gesture-handler', () => {
  const { TouchableOpacity } = jest.requireActual('react-native');
  return { TouchableOpacity };
});
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View },
    Extrapolation: { CLAMP: 'clamp' },
    interpolate: () => 1,
    useAnimatedStyle: () => ({}),
  };
});

const row = (over: Record<string, unknown>) => ({
  id: 'id',
  type: 'announcement',
  title: 'Title',
  message: 'Message',
  created_at: new Date().toISOString(),
  is_read: false,
  priority: 'medium',
  is_actionable: true,
  booking_id: null,
  provider_id: null,
  metadata: null,
  ...over,
});

const navigation = { canGoBack: () => true, goBack: jest.fn(), dispatch: jest.fn(), navigate: jest.fn() };
const renderScreen = () => render(<NotificationsScreen navigation={navigation as never} route={{} as never} />);

test('a tip row says View tip and no longer offers Read More', async () => {
  (getMyNotifications as jest.Mock).mockResolvedValue([
    row({ id: 'tip', type: 'tip_received', title: 'You received a tip', message: 'A tip was left.' }),
  ]);
  const ui = renderScreen();
  await waitFor(() => expect(ui.getByText('View tip')).toBeTruthy());
  expect(ui.queryByText('Read More')).toBeNull();
  expect(ui.getByText('Today')).toBeTruthy();
});

test('a tip pop-up leads with no big figure and keeps the View Booking button', async () => {
  (getMyNotifications as jest.Mock).mockResolvedValue([
    row({ id: 'tip', type: 'tip_received', title: 'You received a tip', message: 'A £8.00 tip was left.' }),
  ]);
  const ui = renderScreen();
  await waitFor(() => expect(ui.getByText('You received a tip')).toBeTruthy());
  fireEvent.press(ui.getByText('You received a tip'));
  await waitFor(() => expect(ui.getByText('View Booking')).toBeTruthy());
  expect(ui.queryByText('£8.00')).toBeNull();
});

test('a failed payout shows its figure on the row and in the pop-up', async () => {
  (getMyNotifications as jest.Mock).mockResolvedValue([
    row({ id: 'payout', type: 'payout_failed', title: "Your bank didn't accept £112.40", message: 'Check your bank details.' }),
  ]);
  const ui = renderScreen();
  await waitFor(() => expect(ui.getByText('£112.40')).toBeTruthy());
  fireEvent.press(ui.getByText('£112.40'));
  await waitFor(() => expect(ui.getByText('Open Payments')).toBeTruthy());
  expect(ui.getAllByText('£112.40')).toHaveLength(2);
});

test('a whole month fully booked opens the certificate pop-up', async () => {
  (getMyNotifications as jest.Mock).mockResolvedValue([
    row({ id: 'month', type: 'schedule_fully_booked', title: "You're Fully Booked!", message: 'November is fully booked.', metadata: { kind: 'fully_booked_certificate' } }),
  ]);
  const ui = renderScreen();
  await waitFor(() => expect(ui.getByText("You're Fully Booked!")).toBeTruthy());
  fireEvent.press(ui.getByText("You're Fully Booked!"));
  await waitFor(() => expect(ui.getByText('View Certificate')).toBeTruthy());
  expect(ui.getByText('Milestone')).toBeTruthy();
});

test('a shorter fully booked run promises no certificate', async () => {
  (getMyNotifications as jest.Mock).mockResolvedValue([
    row({ id: 'short', type: 'schedule_fully_booked', title: "You're Fully Booked!", message: 'Every slot is booked.', metadata: { kind: 'fully_booked' } }),
  ]);
  const ui = renderScreen();
  await waitFor(() => expect(ui.getByText("You're Fully Booked!")).toBeTruthy());
  fireEvent.press(ui.getByText("You're Fully Booked!"));
  await waitFor(() => expect(ui.getByText('Open My Profile')).toBeTruthy());
  expect(ui.queryByText('View Certificate')).toBeNull();
});
