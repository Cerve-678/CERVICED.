import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AdminMoneyScreen from '../screens/shared/AdminMoneyScreen';
import { adminDeclineRefundRequest, getAdminMoneyOverview, refundProviderBooking } from '../services/databaseService';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined), selectionAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined), ImpactFeedbackStyle: {}, NotificationFeedbackType: {},
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../components/ThemedBackground', () => ({ ThemedBackground: ({ children }: any) => children }));
jest.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDarkMode: false, theme: { statusBar: 'dark-content' },
    palette: { bg: '#F5F1EC', card: '#FFFFFF', surface: '#EDE8E2', accent: '#5C4033', accentText: '#5C4033', onAccent: '#FFFFFF', text: '#000000', sub: '#7E6667', border: '#eee', sep: '#eee' },
  }),
}));
jest.mock('../components/AppDialog', () => ({
  useAppDialog: () => ({ showAlert: jest.fn(), showConfirm: jest.fn(), DialogHost: () => null }),
}));
jest.mock('../services/databaseService', () => ({
  getAdminMoneyOverview: jest.fn(), adminRetryPayout: jest.fn(), adminDeclineRefundRequest: jest.fn(), refundProviderBooking: jest.fn(),
}));
jest.mock('../utils/logger', () => ({ logger: { error: jest.fn() } }));

const overview = {
  failed_count: 1, owed_count: 1, refunds_count: 1,
  failed: [{ payout_id: 'p1', booking_id: 'b1', provider_id: 'pr1', provider_name: 'Lash Lab', amount_pence: 4500, status: 'failed', attempt_count: 4, failure_cause: 'platform_balance', last_failed_at: null, next_try_at: null, service_name: 'Lash lift', booking_date: '2026-10-18' }],
  owed: [{ shortfall_id: 's1', provider_id: 'pr2', provider_name: 'Brow Bar', owed_pence: 1850, source: 'refund', created_at: '2026-10-20T09:00:00Z', service_name: null }],
  refunds: [{ request_id: 'r1', booking_id: 'b9', status: 'under_review', reason: 'The provider cancelled', message: 'They never came', provider_note: 'Service was done as booked', created_at: '2026-10-20T09:00:00Z', passed_to_cerviced_at: '2026-10-21T09:00:00Z', client_name: 'Amy', provider_name: 'Lash Lab', service_name: 'Lash lift', booking_date: '2026-10-18', paid_pence: 6000, refunded_pence: 0 }],
};

beforeEach(() => {
  jest.clearAllMocks();
  (getAdminMoneyOverview as jest.Mock).mockResolvedValue(overview);
});

test('shows the three lists and counts', async () => {
  const ui = render(<AdminMoneyScreen navigation={{ goBack: jest.fn() }} />);
  await waitFor(() => expect(ui.getByText('Lash Lab')).toBeTruthy());
  expect(ui.getByText('TRY PAYMENT AGAIN NOW')).toBeTruthy();
  fireEvent.press(ui.getByRole('tab', { name: /OWED/ }));
  expect(ui.getByText('Brow Bar')).toBeTruthy();
  expect(ui.getByText('£18.50')).toBeTruthy();
  fireEvent.press(ui.getByRole('tab', { name: /REFUNDS/ }));
  expect(ui.getByText('NEEDS YOU')).toBeTruthy();
});

test('a decline needs a note, and approving the full amount sends a full refund', async () => {
  (refundProviderBooking as jest.Mock).mockResolvedValue(true);
  const ui = render(<AdminMoneyScreen navigation={{ goBack: jest.fn() }} />);
  await waitFor(() => expect(ui.getByText('Lash Lab')).toBeTruthy());
  fireEvent.press(ui.getByRole('tab', { name: /REFUNDS/ }));
  fireEvent.press(ui.getByText('REVIEW'));
  expect(ui.getByText('Service was done as booked')).toBeTruthy();
  fireEvent.press(ui.getByText('DECLINE'));
  expect(adminDeclineRefundRequest).not.toHaveBeenCalled();
  fireEvent.press(ui.getByText('REFUND £60.00'));
  await waitFor(() => expect(refundProviderBooking).toHaveBeenCalledTimes(1));
  const call = (refundProviderBooking as jest.Mock).mock.calls[0][0];
  expect(call.bookingId).toBe('b9');
  expect(call.amountPence).toBeUndefined();
});
