import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ProviderStripePayments from '../components/ProviderStripePayments';
import { getConnectStatus, getProviderPayouts, getProviderFinance, getProviderRefundState } from '../services/providerPaymentService';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn().mockResolvedValue({ type: 'dismiss' }) }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../services/providerPaymentService', () => ({
  getConnectStatus: jest.fn(), getProviderPayouts: jest.fn(), getProviderFinance: jest.fn(),
  getConnectLink: jest.fn(), refundProviderBooking: jest.fn(), getProviderRefundState: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({ isDarkMode: false, palette: { accent: '#5C4033', onAccent: '#FFFFFF', text: '#1C1A18', secondaryText: '#8A8680', card: '#FFFFFF', border: '#eeeeee' } }),
}));
jest.mock('../features/business-details/BusinessDetailsKit', () => {
  // Jest factories need local imports because mocks are hoisted.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View, Text } = require('react-native');
  return {
    useBusinessPalette: () => ({ bg: '#F5F1EC', card: '#FFFFFF', surface: '#EDE8E2', accent: '#5C4033', accentText: '#5C4033', text: '#1C1A18', sub: '#8A8680', border: '#eeeeee' }),
    Card: ({ title, sub, children }: any) => <View><Text>{title}</Text><Text>{sub}</Text>{children}</View>,
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  (getConnectStatus as jest.Mock).mockResolvedValue({ connected: true, payoutsEnabled: true, detailsSubmitted: true });
  (getProviderPayouts as jest.Mock).mockResolvedValue([{
    id: 'payment', booking_id: 'booking', gross_amount: 10000, platform_fee: 1000, payout_amount: 9000,
    currency: 'gbp', status: 'held', created_at: '2026-10-01T10:00:00Z', release_after: '2026-10-03T10:00:00Z',
    booking: { service_name_snapshot: 'Hair appointment', customer_name: 'Test client' },
  }]);
  (getProviderFinance as jest.Mock).mockResolvedValue({ connected: true, livemode: false,
    available: [{ amount: 2000, currency: 'gbp' }], pending: [{ amount: 500, currency: 'gbp' }],
    payouts: [{ id: 'po_test', amount: 1200, currency: 'gbp', status: 'in_transit', arrivalDate: 1791021600, created: 1790848800, automatic: true }], hasMore: false,
  });
});

test('keeps booking release, Stripe balance and bank payouts distinct across four sections', async () => {
  const ui = render(<ProviderStripePayments><Text>Deposit settings</Text></ProviderStripePayments>);
  await waitFor(() => expect(ui.getByText('£20.00')).toBeTruthy());
  expect(ui.getByText('Test mode · no real money moves')).toBeTruthy();
  expect(ui.getByText('Your payout account is connected')).toBeTruthy();
  expect(ui.queryByText('Deposit settings')).toBeNull();
  fireEvent.press(ui.getByRole('tab', { name: 'Booking payments' }));
  fireEvent.press(ui.getByText('Hair appointment'));
  // The provider must never see CERVICED's fee or the client's fee-inclusive total — only their own share.
  expect(ui.queryByText('Platform fee')).toBeNull();
  expect(ui.queryByText('Client paid')).toBeNull();
  expect(ui.queryByText('£10.00')).toBeNull();
  expect(ui.queryByText('£100.00')).toBeNull();
  expect(ui.getAllByText('£90.00').length).toBeGreaterThan(0);
  expect(ui.getByText(/This is not a bank arrival date/)).toBeTruthy();
  fireEvent.press(ui.getByRole('tab', { name: 'Payouts' }));
  expect(ui.getByText('£12.00')).toBeTruthy();
  expect(ui.getByText('On the way')).toBeTruthy();
  fireEvent.press(ui.getByRole('tab', { name: 'Payment settings' }));
  expect(ui.getByText('Deposit settings')).toBeTruthy();
  // The payout account lives on Overview only — Settings must not repeat it.
  expect(ui.queryByText('Your payout account is connected')).toBeNull();
});

test('a booking history failure does not hide connected account settings or Stripe balance', async () => {
  (getProviderPayouts as jest.Mock).mockRejectedValue(new Error('offline'));
  const ui = render(<ProviderStripePayments />);
  await waitFor(() => expect(ui.getByText('£20.00')).toBeTruthy());
  expect(ui.getByText(/Booking payments could not load/)).toBeTruthy();
  expect(ui.getByRole('button', { name: /Manage payout account/ })).toBeTruthy();
});

test('"Your setup" tiles summarise the settings and open them', async () => {
  const ui = render(<ProviderStripePayments setup={{ deposit: 'Optional · 20%', inPerson: 'Card, Cash' }}><Text>Deposit settings</Text></ProviderStripePayments>);
  await waitFor(() => expect(ui.getByText('£20.00')).toBeTruthy());
  expect(ui.getByText('Optional · 20%')).toBeTruthy();
  fireEvent.press(ui.getByRole('button', { name: /In person: Card, Cash/ }));
  expect(ui.getByText('Deposit settings')).toBeTruthy();
});

test('failed finance request never shows a fabricated zero balance', async () => {
  (getProviderFinance as jest.Mock).mockRejectedValue(new Error('offline'));
  const ui = render(<ProviderStripePayments />);
  await waitFor(() => expect(ui.getByText(/Balances and bank payouts could not load/)).toBeTruthy());
  expect(ui.queryByText('£0.00')).toBeNull();
});

test('Refund client opens the in-app refund sheet with full and partial options, not a system alert', async () => {
  const { Alert } = jest.requireActual('react-native');
  const alertSpy = jest.spyOn(Alert, 'alert');
  (getProviderRefundState as jest.Mock).mockResolvedValue({ sharePence: 9000, heldPence: 9000, anyRefunded: false, policySettlement: null });
  const ui = render(<ProviderStripePayments />);
  await waitFor(() => expect(ui.getByText('£20.00')).toBeTruthy());
  fireEvent.press(ui.getByRole('tab', { name: 'Booking payments' }));
  fireEvent.press(ui.getByText('Hair appointment'));
  fireEvent.press(ui.getByText('Refund client'));
  await waitFor(() => expect(ui.getByText('Full refund')).toBeTruthy());
  expect(ui.getByText('Issue a refund')).toBeTruthy();
  expect(ui.getByText('Partial refund')).toBeTruthy();
  expect(getProviderRefundState).toHaveBeenCalledWith('booking');
  expect(alertSpy).not.toHaveBeenCalled();
});

test('before Stripe is set up, the dashboard is just the connect card — Payment settings still works', async () => {
  (getConnectStatus as jest.Mock).mockResolvedValue({ connected: false, payoutsEnabled: false, detailsSubmitted: false });
  (getProviderFinance as jest.Mock).mockResolvedValue({ connected: false, livemode: false, available: [], pending: [], payouts: [], hasMore: false });
  (getProviderPayouts as jest.Mock).mockResolvedValue([]);
  const ui = render(<ProviderStripePayments><Text>Deposit settings</Text></ProviderStripePayments>);
  await waitFor(() => expect(ui.getByText('Connect with Stripe')).toBeTruthy());
  expect(ui.queryByText('AVAILABLE IN STRIPE')).toBeNull();
  expect(ui.queryByText('Recent booking activity')).toBeNull();
  expect(ui.queryByRole('tab', { name: 'Booking payments' })).toBeNull();
  expect(ui.queryByRole('tab', { name: 'Payouts' })).toBeNull();
  fireEvent.press(ui.getByRole('tab', { name: 'Payment settings' }));
  expect(ui.getByText('Deposit settings')).toBeTruthy();
});

test('a half-finished Stripe setup offers to continue rather than start again', async () => {
  (getConnectStatus as jest.Mock).mockResolvedValue({ connected: true, payoutsEnabled: false, detailsSubmitted: false, requirementsDue: 3 });
  const ui = render(<ProviderStripePayments />);
  await waitFor(() => expect(ui.getByText('Continue with Stripe')).toBeTruthy());
  expect(ui.queryByText('AVAILABLE IN STRIPE')).toBeNull();
});
