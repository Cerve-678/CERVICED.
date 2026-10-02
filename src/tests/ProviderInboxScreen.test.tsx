import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import ProviderInboxScreen from '../screens/provider/ProviderInboxScreen';
import { getProviderConversations } from '../services/databaseService';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: any) => require('react').useEffect(callback, [callback]),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));
jest.mock('../contexts/ThemeContext', () => ({ useTheme: () => ({ isDarkMode: false }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
jest.mock('../components/AppDialog', () => ({ useAppDialog: () => ({ showToast: jest.fn(), DialogHost: () => null }) }));
jest.mock('../components/IslandPillTabBar', () => ({ FLOATING_TAB_BAR_CLEARANCE: 100 }));
jest.mock('../services/databaseService', () => ({
  getProviderConversations: jest.fn(),
  markConversationReadByProvider: jest.fn(async () => {}),
  sendConversationQuickReply: jest.fn(async () => {}),
}));

const conversations = [
  { id: 'enquiry-1', user_id: 'visitor', client: { name: 'Visitor' }, has_booking: false, unread_count_provider: 1, last_message: 'Do you offer braids?', last_message_at: null },
  { id: 'client-1', user_id: 'client', client: { name: 'Booked Client' }, has_booking: true, unread_count_provider: 0, last_message: 'See you tomorrow', last_message_at: null },
];
const navigation = { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  (getProviderConversations as jest.Mock).mockResolvedValue(conversations);
});

it('shows only messaging tabs and keeps enquiries separate from client messages', async () => {
  render(<ProviderInboxScreen navigation={navigation} route={{ params: {} }} />);
  await waitFor(() => expect(screen.getByText('Booked Client')).toBeTruthy());
  expect(screen.queryByText('Visitor')).toBeNull();
  expect(screen.queryByText('Pending')).toBeNull();
  expect(screen.queryByText('Completed')).toBeNull();
  fireEvent.press(screen.getByRole('tab', { name: 'General enquiries, 1 unread conversations' }));
  expect(screen.getByText('Visitor')).toBeTruthy();
  expect(screen.queryByText('Booked Client')).toBeNull();
  fireEvent.press(screen.getByText('Visitor'));
  expect(navigation.navigate).toHaveBeenCalledWith('ProviderConversation', {
    conversationId: 'enquiry-1', clientUserId: 'visitor', clientName: 'Visitor',
  });
});

it('opens the enquiry section for a generic notification about an unread enquiry', async () => {
  render(<ProviderInboxScreen navigation={navigation} route={{ params: { initialFilter: 'unread' } }} />);
  await waitFor(() => expect(screen.getByText('Visitor')).toBeTruthy());
  expect(screen.queryByText('Booked Client')).toBeNull();
});

it('shows a load failure instead of an empty or misclassified inbox', async () => {
  const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
  (getProviderConversations as jest.Mock).mockRejectedValue(new Error('Offline'));
  render(<ProviderInboxScreen navigation={navigation} route={{ params: {} }} />);
  await waitFor(() => expect(screen.getByText("Couldn't load your inbox")).toBeTruthy());
  expect(screen.queryByText('No client messages yet')).toBeNull();
  errorLog.mockRestore();
});
