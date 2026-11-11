import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ProviderStripePayments from '../components/ProviderStripePayments';
import { getConnectStatus, getProviderPayouts, getProviderFinance, getProviderRefundState, getProviderFeeEarnings, getProviderTipEarnings, getPayoutSchedule, setPayoutSchedule } from '../services/providerPaymentService';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn().mockResolvedValue({ type: 'dismiss' }) }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../services/providerPaymentService', () => ({
  getConnectStatus: jest.fn(), getProviderPayouts: jest.fn(), getProviderFinance: jest.fn(), getProviderFeeEarnings: jest.fn(), getProviderTipEarnings: jest.fn(),
  getConnectLink: jest.fn(), refundProviderBooking: jest.fn(), getProviderRefundState: jest.fn(),
  getPayoutSchedule: jest.fn(), setPayoutSchedule: jest.fn(),
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
  (getProviderFeeEarnings as jest.Mock).mockResolvedValue([]);
  (getProviderTipEarnings as jest.Mock).mockResolvedValue([]);
  (getConnectStatus as jest.Mock).mockResolvedValue({ connected: true, payoutsEnabled: true, detailsSubmitted: true });
  (getPayoutSchedule as jest.Mock).mockResolvedValue({ interval: 'monthly', weeklyDays: [], monthlyDays: [1] });
  (getProviderPayouts as jest.Mock).mockResolvedValue([{
    id: 'payment', booking_id: 'booking', gross_amount: 10000, platform_fee: 1000, payout_amount: 9000,
    currency: 'gbp', status: 'held', created_at: '2026-10-01T10:00:00Z', release_after: '2026-10-03T10:00:00Z',
    booking: { service_name_snapshot: 'Hair appointment', customer_name: 'Test client' }, refundRequestOpen: false,
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

test('names the bank payouts land in, and points to Manage to change it', async () => {
  (getConnectStatus as jest.Mock).mockResolvedValue({ connected: true, payoutsEnabled: true, detailsSubmitted: true,
    bankAccount: { bankName: 'BARCLAYS BANK PLC', last4: '6789' } });
  const ui = render(<ProviderStripePayments><Text>Deposit settings</Text></ProviderStripePayments>);
  await waitFor(() => expect(ui.getByText('Paid to BARCLAYS BANK PLC ••6789. Tap Manage to change it.')).toBeTruthy());
});

test('a provider chooses how often Stripe pays their bank; the release to Stripe stays at 24 hours', async () => {
  (setPayoutSchedule as jest.Mock).mockImplementation(async (choice: { interval: string; weeklyDay?: string; monthlyDay?: number }) => ({
    interval: choice.interval, weeklyDays: choice.weeklyDay ? [choice.weeklyDay] : [], monthlyDays: choice.monthlyDay ? [choice.monthlyDay] : [],
  }));
  const ui = render(<ProviderStripePayments />);
  await waitFor(() => expect(ui.getByText('£20.00')).toBeTruthy());
  fireEvent.press(ui.getByRole('tab', { name: 'Payouts' }));
  expect(ui.getByText('Your share is released to Stripe 24 hours after the appointment ends.')).toBeTruthy();
  expect(ui.getByText('Stripe pays your bank on the 1st of each month. Change this in Payment settings.')).toBeTruthy();
  fireEvent.press(ui.getByRole('tab', { name: 'Payment settings' }));
  expect(ui.getByRole('radio', { name: 'Monthly', selected: true })).toBeTruthy();
  expect(ui.getByRole('radio', { name: '1st', selected: true })).toBeTruthy();
  // Weekly starts on Monday, then any weekday can be picked.
  fireEvent.press(ui.getByText('Weekly'));
  await waitFor(() => expect(setPayoutSchedule).toHaveBeenCalledWith({ interval: 'weekly', weeklyDay: 'monday' }));
  fireEvent.press(await ui.findByText('Fri'));
  await waitFor(() => expect(setPayoutSchedule).toHaveBeenLastCalledWith({ interval: 'weekly', weeklyDay: 'friday' }));
  await waitFor(() => expect(ui.getByRole('radio', { name: 'Fri', selected: true })).toBeTruthy());
  fireEvent.press(ui.getByText('Daily'));
  await waitFor(() => expect(setPayoutSchedule).toHaveBeenLastCalledWith({ interval: 'daily' }));
  fireEvent.press(ui.getByRole('tab', { name: 'Payouts' }));
  expect(ui.getByText('Stripe pays your bank every working day. Change this in Payment settings.')).toBeTruthy();
});

test('a failed schedule change keeps the old choice and says why it failed', async () => {
  (setPayoutSchedule as jest.Mock).mockRejectedValue(new Error('offline'));
  const ui = render(<ProviderStripePayments />);
  await waitFor(() => expect(ui.getByText('£20.00')).toBeTruthy());
  fireEvent.press(ui.getByRole('tab', { name: 'Payment settings' }));
  fireEvent.press(ui.getByText('Daily'));
  // An offline failure says so; any other unexplained one gets the retry line.
  await waitFor(() => expect(ui.getByText('No internet connection. Please check your network and try again.')).toBeTruthy());
  expect(ui.getByRole('radio', { name: 'Monthly', selected: true })).toBeTruthy();
});

test('a schedule set in Stripe that the app does not offer is shown as it is, with nothing selected', async () => {
  (getPayoutSchedule as jest.Mock).mockResolvedValue({ interval: 'manual', weeklyDays: [], monthlyDays: [] });
  const ui = render(<ProviderStripePayments />);
  await waitFor(() => expect(ui.getByText('£20.00')).toBeTruthy());
  fireEvent.press(ui.getByRole('tab', { name: 'Payment settings' }));
  expect(ui.getByText(/set to manual in Stripe, so nothing is sent until you choose a schedule/)).toBeTruthy();
  expect(ui.queryByRole('radio', { selected: true })).toBeNull();
});

test('lists late and no-show fees with the provider\'s share and where the money is', async () => {
  (getProviderFeeEarnings as jest.Mock).mockResolvedValue([{
    id: 'fee', bookingId: 'booking', kind: 'no_show', amountPence: 2000, payoutPence: 1950, status: 'succeeded',
    payoutStatus: 'transferred', releaseAfter: null, chargedAt: '2026-10-01T10:00:00Z', openDispute: false,
    serviceName: 'Hair appointment', customerName: 'Test client',
  }]);
  const ui = render(<ProviderStripePayments><Text>Deposit settings</Text></ProviderStripePayments>);
  await waitFor(() => expect(ui.getByText('£20.00')).toBeTruthy());
  fireEvent.press(ui.getByRole('tab', { name: 'Booking payments' }));
  expect(ui.getByText('No-show fee · Hair appointment')).toBeTruthy();
  expect(ui.getByText('£19.50')).toBeTruthy();
  expect(ui.getByText('Released to Stripe')).toBeTruthy();
});

test('shows a tip inside its booking\'s payment card, not in a list of its own', async () => {
  (getProviderTipEarnings as jest.Mock).mockResolvedValue([{
    id: 'tip', bookingId: 'booking', amountPence: 1000, payoutPence: 1000, payoutStatus: 'transferred',
    releaseAfter: null, paidAt: '2026-10-21T10:00:00Z', serviceName: 'Hair appointment', customerName: 'Test client',
  }]);
  const ui = render(<ProviderStripePayments><Text>Deposit settings</Text></ProviderStripePayments>);
  await waitFor(() => expect(ui.getByText('£20.00')).toBeTruthy());
  fireEvent.press(ui.getByRole('tab', { name: 'Booking payments' }));
  await waitFor(() => expect(ui.getByText('Tip')).toBeTruthy());
  expect(ui.getByText('£10.00')).toBeTruthy();
  expect(ui.getByText('Paid out')).toBeTruthy();
  expect(ui.queryByText('Tip · Hair appointment')).toBeNull();
  expect(ui.queryByText('Tips')).toBeNull();
});

test('a tip whose booking payment is outside the list keeps its own section', async () => {
  (getProviderTipEarnings as jest.Mock).mockResolvedValue([{
    id: 'tip', bookingId: 'older-booking', amountPence: 1000, payoutPence: 1000, payoutStatus: 'transferred',
    releaseAfter: null, paidAt: '2026-10-21T10:00:00Z', serviceName: 'Hair appointment', customerName: 'Test client',
  }]);
  const ui = render(<ProviderStripePayments><Text>Deposit settings</Text></ProviderStripePayments>);
  await waitFor(() => expect(ui.getByText('£20.00')).toBeTruthy());
  fireEvent.press(ui.getByRole('tab', { name: 'Booking payments' }));
  await waitFor(() => expect(ui.getByText('Tip · Hair appointment')).toBeTruthy());
  expect(ui.getByText('Tips')).toBeTruthy();
  expect(ui.getByText('£10.00')).toBeTruthy();
});

test('before Stripe is set up there is no schedule to choose, so it says to set up Stripe first', async () => {
  (getPayoutSchedule as jest.Mock).mockResolvedValue(null);
  const ui = render(<ProviderStripePayments />);
  await waitFor(() => expect(ui.getByText('£20.00')).toBeTruthy());
  fireEvent.press(ui.getByRole('tab', { name: 'Payment settings' }));
  expect(ui.getByText('Set up your Stripe account to choose when you get paid.')).toBeTruthy();
  expect(ui.queryByText('Weekly')).toBeNull();
  expect(setPayoutSchedule).not.toHaveBeenCalled();
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

test('says a held payment is on hold while the client has a refund request open', async () => {
  (getProviderPayouts as jest.Mock).mockResolvedValue([{
    id: 'payment', booking_id: 'booking', gross_amount: 10000, platform_fee: 1000, payout_amount: 9000,
    currency: 'gbp', status: 'held', created_at: '2026-10-01T10:00:00Z', release_after: '2026-10-03T10:00:00Z',
    booking: { service_name_snapshot: 'Hair appointment', customer_name: 'Test client' }, refundRequestOpen: true,
  }]);
  const ui = render(<ProviderStripePayments><Text>Deposit settings</Text></ProviderStripePayments>);
  await waitFor(() => expect(ui.getByText('Test client · On hold · refund request')).toBeTruthy());
  fireEvent.press(ui.getByRole('tab', { name: 'Booking payments' }));
  fireEvent.press(ui.getByText('Hair appointment'));
  expect(ui.getByText(/on hold until that’s settled/)).toBeTruthy();
  expect(ui.queryByText(/Eligible for release from/)).toBeNull();
});
