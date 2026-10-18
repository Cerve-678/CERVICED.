import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ProviderStripePayments from '../components/ProviderStripePayments';
import { getConnectStatus, getProviderPayouts, getProviderFinance, getProviderFeeEarnings, getPayoutHoldDays, setPayoutHoldDays, getPaymentArrivalEstimate } from '../services/providerPaymentService';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn().mockResolvedValue({ type: 'dismiss' }) }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../services/providerPaymentService', () => ({
  getConnectStatus: jest.fn(), getProviderPayouts: jest.fn(), getProviderFinance: jest.fn(), getProviderFeeEarnings: jest.fn(),
  getConnectLink: jest.fn(), refundProviderBooking: jest.fn(),
  getPayoutHoldDays: jest.fn(), setPayoutHoldDays: jest.fn(), getPaymentArrivalEstimate: jest.fn(),
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
  (getConnectStatus as jest.Mock).mockResolvedValue({ connected: true, payoutsEnabled: true, detailsSubmitted: true });
  (getPayoutHoldDays as jest.Mock).mockResolvedValue(1);
  (getPaymentArrivalEstimate as jest.Mock).mockResolvedValue({ status: 'held', releaseAfter: '2026-10-03T10:00:00Z', availableOn: Date.parse('2026-10-06T00:00:00Z') / 1000, schedule: { interval: 'daily', weeklyAnchor: null, monthlyAnchor: null } });
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

test('names the bank payouts land in, and points to Manage to change it', async () => {
  (getConnectStatus as jest.Mock).mockResolvedValue({ connected: true, payoutsEnabled: true, detailsSubmitted: true,
    bankAccount: { bankName: 'BARCLAYS BANK PLC', last4: '6789' } });
  const ui = render(<ProviderStripePayments><Text>Deposit settings</Text></ProviderStripePayments>);
  await waitFor(() => expect(ui.getByText('Paid to BARCLAYS BANK PLC ••6789. Tap Manage to change it.')).toBeTruthy());
});

test('a provider can choose how long after the appointment their share is released', async () => {
  // Like the server: once saved, the refresh after the change reads the new value back.
  (setPayoutHoldDays as jest.Mock).mockImplementation(async (days: number) => {
    (getPayoutHoldDays as jest.Mock).mockResolvedValue(days);
    return days;
  });
  const ui = render(<ProviderStripePayments />);
  await waitFor(() => expect(ui.getByText('£20.00')).toBeTruthy());
  // The choice lives in Payment settings; Payouts says what's set and where to change it.
  fireEvent.press(ui.getByRole('tab', { name: 'Payouts' }));
  expect(ui.getByText(/released to Stripe 24 hours after the appointment ends\. Change this in Payment settings\./)).toBeTruthy();
  expect(ui.queryByText('7 days')).toBeNull();
  fireEvent.press(ui.getByRole('tab', { name: 'Payment settings' }));
  fireEvent.press(ui.getByText('7 days'));
  await waitFor(() => expect(setPayoutHoldDays).toHaveBeenCalledWith(7));
  await waitFor(() => expect(ui.getByRole('radio', { name: '7 days', selected: true })).toBeTruthy());
  fireEvent.press(ui.getByRole('tab', { name: 'Payouts' }));
  expect(ui.getByText(/released to Stripe 7 days after the appointment ends/)).toBeTruthy();
});

test('a failed timing change keeps the old choice and says why it failed', async () => {
  (setPayoutHoldDays as jest.Mock).mockRejectedValue(new Error('offline'));
  const ui = render(<ProviderStripePayments />);
  await waitFor(() => expect(ui.getByText('£20.00')).toBeTruthy());
  fireEvent.press(ui.getByRole('tab', { name: 'Payment settings' }));
  fireEvent.press(ui.getByText('30 days'));
  // An offline failure says so; any other unexplained one gets the retry line.
  await waitFor(() => expect(ui.getByText('No internet connection. Please check your network and try again.')).toBeTruthy());
  expect(ui.getByRole('radio', { name: '24 hours', selected: true })).toBeTruthy();
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

test('an account with no professional profile is told to finish setting one up, not offered a choice that cannot save', async () => {
  (getPayoutHoldDays as jest.Mock).mockResolvedValue(null);
  const ui = render(<ProviderStripePayments />);
  await waitFor(() => expect(ui.getByText('£20.00')).toBeTruthy());
  fireEvent.press(ui.getByRole('tab', { name: 'Payment settings' }));
  expect(ui.getByText('Finish setting up your professional profile to choose when you get paid.')).toBeTruthy();
  expect(ui.queryByText('7 days')).toBeNull();
  expect(setPayoutHoldDays).not.toHaveBeenCalled();
});

test("shows the server's own reason when it refuses a timing change", async () => {
  (setPayoutHoldDays as jest.Mock).mockRejectedValue({ code: 'P0001', message: 'Only a professional account can change payout timing.' });
  const ui = render(<ProviderStripePayments />);
  await waitFor(() => expect(ui.getByText('£20.00')).toBeTruthy());
  fireEvent.press(ui.getByRole('tab', { name: 'Payment settings' }));
  fireEvent.press(ui.getByText('7 days'));
  await waitFor(() => expect(ui.getByText('Only a professional account can change payout timing.')).toBeTruthy());
});

test('opening a booking payment shows when it reaches Stripe and roughly when it reaches the bank', async () => {
  const ui = render(<ProviderStripePayments />);
  await waitFor(() => expect(ui.getByText('£20.00')).toBeTruthy());
  fireEvent.press(ui.getByRole('tab', { name: 'Booking payments' }));
  expect(getPaymentArrivalEstimate).not.toHaveBeenCalled();
  fireEvent.press(ui.getByText('Hair appointment'));
  // Held until 3 Oct, but Stripe's date for the client's payment is Tue 6 Oct: the later one wins.
  await waitFor(() => expect(ui.getByText(/Stripe balance (from|since) Tue 6 Oct.*bank around Wed 7 Oct/)).toBeTruthy());
  expect(getPaymentArrivalEstimate).toHaveBeenCalledWith('payment');
});

test('a bank date that fails to load says so and retries on the next open', async () => {
  (getPaymentArrivalEstimate as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  const ui = render(<ProviderStripePayments />);
  await waitFor(() => expect(ui.getByText('£20.00')).toBeTruthy());
  fireEvent.press(ui.getByRole('tab', { name: 'Booking payments' }));
  fireEvent.press(ui.getByText('Hair appointment'));
  await waitFor(() => expect(ui.getByText(/couldn’t load/)).toBeTruthy());
  fireEvent.press(ui.getByText('Hair appointment'));
  fireEvent.press(ui.getByText('Hair appointment'));
  await waitFor(() => expect(ui.getByText(/bank around Wed 7 Oct/)).toBeTruthy());
});
