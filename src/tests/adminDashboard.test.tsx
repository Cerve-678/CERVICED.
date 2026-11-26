import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AdminDashboardScreen from '../screens/shared/AdminDashboardScreen';
import { getAdminDashboardOverview } from '../services/databaseService';
import { buildProblemRows, describeDelta, formatCount, pounds, weekLabel } from '../features/admin/dashboardPresentation';
import type { AdminDashboardOverview } from '../types/adminDashboard';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined), selectionAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: {},
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@expo/vector-icons', () => ({ Ionicons: Object.assign(() => null, { glyphMap: {} }) }));
jest.mock('../components/ThemedBackground', () => ({ ThemedBackground: ({ children }: any) => children }));
jest.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDarkMode: false, theme: { statusBar: 'dark-content' },
    palette: { bg: '#F5F1EC', card: '#FFFFFF', surface: '#EDE8E2', accent: '#5C4033', accentText: '#5C4033', onAccent: '#FFFFFF', text: '#000000', sub: '#7E6667', border: '#eee', sep: '#eee' },
  }),
}));
jest.mock('../services/databaseService', () => ({ getAdminDashboardOverview: jest.fn() }));
jest.mock('../utils/logger', () => ({ logger: { error: jest.fn() } }));

const problems: AdminDashboardOverview['problems'] = {
  jobs_failed_24h: 110,
  jobs_failing: [{ name: 'expire-waitlist-holds', count: 53 }, { name: 'expire-cart-holds', count: 13 }],
  payouts_failed: 0, emails_failing: 2, checkouts_abandoned: 8, support_open: 0, refunds_open: 1, refunds_need_you: 1,
};

const overview: AdminDashboardOverview = {
  period_days: 30,
  generated_at: '2026-11-03T11:52:00Z',
  accounts: { total: 12, new: 4, new_prev: 1, clients_total: 6, clients_new: 0, clients_new_prev: 2, active: 9, deleted: 3 },
  providers: { total: 11, new: 4, new_prev: 0, live: 11, not_live: 0, link_only: 1, listings_unclaimed: 1, claims_pending: 0 },
  weekly: Array.from({ length: 12 }, (_, i) => ({
    week_start: new Date(Date.UTC(2026, 7, 17 + i * 7)).toISOString().slice(0, 10),
    accounts: i === 11 ? 2 : i % 3, providers: i === 10 ? 3 : 0,
  })),
  bookings: { made: 32, made_prev: 56, completed: 24, cancelled: 2, upcoming: 17 },
  money: { paid_in_pence: 160981, paid_in_prev_pence: 197380, fees_pence: 8131, refunded_pence: 15325 },
  problems,
};

beforeEach(() => {
  jest.clearAllMocks();
  (getAdminDashboardOverview as jest.Mock).mockResolvedValue(overview);
});

describe('dashboard wording', () => {
  test('a delta says which way, by how much, and whether that is good', () => {
    expect(describeDelta(4, 1, 30)).toEqual({ text: '▲ 3 on the 30 days before', tone: 'good' });
    expect(describeDelta(32, 56, 7)).toEqual({ text: '▼ 24 on the 7 days before', tone: 'bad' });
    expect(describeDelta(5, 2, 30, { upIsGood: false }).tone).toBe('bad');
    expect(describeDelta(3, 3, 90)).toEqual({ text: 'Same as the 90 days before', tone: 'flat' });
  });

  test('counts compact past ten thousand', () => {
    expect(formatCount(1284)).toBe('1,284');
    expect(formatCount(12900)).toBe('12.9K');
    expect(formatCount(1_200_000)).toBe('1.2M');
  });

  test('money shows thousands and drops empty pence', () => {
    expect(pounds(160981)).toBe('£1,609.81');
    expect(pounds(8000)).toBe('£80');
    expect(pounds(0)).toBe('£0');
  });

  test('a week is labelled by its Monday without the weekday', () => {
    expect(weekLabel('2026-11-02')).toBe('2 Nov');
  });

  test('problems list worst first, and zero rows stay visible as all clear', () => {
    const rows = buildProblemRows(problems);
    expect(rows.map(r => r.id)).toEqual(['jobs', 'emails', 'refunds', 'payouts', 'support']);
    expect(rows[0]).toMatchObject({ severity: 'critical', count: 110, detail: 'expire-waitlist-holds (53), expire-cart-holds (13)' });
    expect(rows.find(r => r.id === 'refunds')).toMatchObject({ target: 'money', severity: 'warning' });
    expect(rows.find(r => r.id === 'payouts')).toMatchObject({ severity: 'good', target: null, detail: null });
  });
});

describe('AdminDashboardScreen', () => {
  test('shows growth, problems and the way into Money and developer tools', async () => {
    const navigate = jest.fn();
    const ui = render(<AdminDashboardScreen navigation={{ goBack: jest.fn(), navigate }} />);
    await waitFor(() => expect(ui.getByText('New sign-ups')).toBeTruthy());
    expect(getAdminDashboardOverview).toHaveBeenCalledWith(30);
    expect(ui.getByText('▲ 3 on the 30 days before')).toBeTruthy();
    expect(ui.getByText('£1,609.81')).toBeTruthy();
    expect(ui.getByText('3 accounts were deleted in this period.')).toBeTruthy();
    expect(ui.getByText('Background jobs that failed, last 24 hours')).toBeTruthy();

    fireEvent.press(ui.getByText('Developer tools'));
    expect(navigate).toHaveBeenCalledWith('DevSettings');
    fireEvent.press(ui.getByText('Refund requests passed to CERVICED'));
    expect(navigate).toHaveBeenCalledWith('AdminMoney');
  });

  test('changing the period asks the server for that period', async () => {
    const ui = render(<AdminDashboardScreen navigation={{ goBack: jest.fn(), navigate: jest.fn() }} />);
    await waitFor(() => expect(ui.getByText('New sign-ups')).toBeTruthy());
    fireEvent.press(ui.getByRole('tab', { name: '7 DAYS' }));
    await waitFor(() => expect(getAdminDashboardOverview).toHaveBeenLastCalledWith(7));
  });

  test('a failed load says so and can be retried', async () => {
    (getAdminDashboardOverview as jest.Mock).mockRejectedValueOnce(new Error('Only CERVICED admins can see this.'));
    const ui = render(<AdminDashboardScreen navigation={{ goBack: jest.fn(), navigate: jest.fn() }} />);
    await waitFor(() => expect(ui.getByText("Couldn't load the dashboard.")).toBeTruthy());
    fireEvent.press(ui.getByText('Try again'));
    await waitFor(() => expect(ui.getByText('New sign-ups')).toBeTruthy());
  });
});
