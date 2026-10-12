import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ProviderPayoutSummaryCard from '../components/ProviderPayoutSummaryCard';
import { getProviderPayouts, getProviderFinance } from '../services/providerPaymentService';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-blur', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return { BlurView: View };
});
// Run the focus effect once on mount, as a focused screen would.
jest.mock('@react-navigation/native', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (effect: () => void) => require('react').useEffect(effect, [effect]),
}));
jest.mock('../services/providerPaymentService', () => ({
  getProviderPayouts: jest.fn(), getProviderFinance: jest.fn(),
}));

const props = {
  cardBg: '#fff', blurIntensity: 25, blurTint: 'light' as const, borderColor: '#eee',
  textColor: '#111', subTextColor: '#888', accentColor: '#AF9197',
};

beforeEach(() => {
  jest.clearAllMocks();
  (getProviderPayouts as jest.Mock).mockResolvedValue([
    { id: 'a', booking_id: 'b1', payout_amount: 4500, gross_amount: 5000, platform_fee: 500, currency: 'gbp', status: 'held', release_after: '', created_at: '' },
    { id: 'b', booking_id: 'b2', payout_amount: 3000, gross_amount: 3300, platform_fee: 300, currency: 'gbp', status: 'held', release_after: '', created_at: '' },
    { id: 'c', booking_id: 'b3', payout_amount: 9999, gross_amount: 9999, platform_fee: 0, currency: 'gbp', status: 'transferred', release_after: '', created_at: '' },
  ]);
  (getProviderFinance as jest.Mock).mockResolvedValue({
    connected: true, livemode: true, hasMore: false,
    available: [{ amount: 2000, currency: 'gbp' }], pending: [],
    payouts: [{ id: 'po', amount: 1200, currency: 'gbp', status: 'in_transit', arrivalDate: 1791021600, created: 0, automatic: true }],
  });
});

test('shows the Stripe balance, the held total and the next bank payout, and opens Payments', async () => {
  const onOpenPayments = jest.fn();
  const ui = render(<ProviderPayoutSummaryCard {...props} onOpenPayments={onOpenPayments} />);
  await waitFor(() => expect(ui.getByText('£20.00')).toBeTruthy());
  // Only held rows count towards "held" — the transferred one has already left.
  expect(ui.getByText('£75.00')).toBeTruthy();
  expect(ui.getByText(/Next to your bank: £12\.00/)).toBeTruthy();
  fireEvent.press(ui.getByRole('button', { name: 'Payouts. Open Payments.' }));
  expect(onOpenPayments).toHaveBeenCalledTimes(1);
});

test('asks a provider with no Stripe account to set up payouts', async () => {
  (getProviderFinance as jest.Mock).mockResolvedValue({ connected: false, livemode: true, available: [], pending: [], payouts: [], hasMore: false });
  (getProviderPayouts as jest.Mock).mockResolvedValue([]);
  const ui = render(<ProviderPayoutSummaryCard {...props} onOpenPayments={jest.fn()} />);
  await waitFor(() => expect(ui.getByText('Set up payouts')).toBeTruthy());
});

test('says so plainly when nothing could load', async () => {
  (getProviderFinance as jest.Mock).mockRejectedValue(new Error('offline'));
  (getProviderPayouts as jest.Mock).mockRejectedValue(new Error('offline'));
  const ui = render(<ProviderPayoutSummaryCard {...props} onOpenPayments={jest.fn()} />);
  await waitFor(() => expect(ui.getByText("Payouts couldn't load. Tap to open Payments.")).toBeTruthy());
});
