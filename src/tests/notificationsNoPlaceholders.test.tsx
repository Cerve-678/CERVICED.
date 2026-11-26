import React from 'react';
import { render, screen } from '@testing-library/react-native';

jest.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDarkMode: false,
    palette: new Proxy({}, { get: () => '#3F1E36' }),
    theme: { statusBar: 'dark-content' },
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../services/databaseService', () => ({
  DEFAULT_NOTIF_PREFS: {
    bookingConfirm: true,
    bookingReminder: true,
    bookingUpdates: true,
    maintenanceReminders: false,
    promotions: false,
    newProviders: true,
    weeklySummary: false,
  },
  getNotificationPreferences: jest.fn(),
  saveNotificationPreferences: jest.fn(() => Promise.resolve()),
}));

import NotificationsSettingsScreen from '../screens/client/NotificationsSettingsScreen';
import { DEFAULT_NOTIF_PREFS, getNotificationPreferences } from '../services/databaseService';

// App Review (guideline 2.1) treats a visible "Coming soon" feature as an
// unfinished app, so settings list only what's built. When CERVICED Wrapped
// ships it arrives as a real switch in DISCOVER, not as a placeholder row.
describe('client Notifications: nothing unbuilt', () => {
  it('shows no Coming soon placeholder, and one switch per real preference', async () => {
    (getNotificationPreferences as jest.Mock).mockResolvedValue(DEFAULT_NOTIF_PREFS);
    render(<NotificationsSettingsScreen navigation={{ goBack: () => {} }} />);

    expect(await screen.findByText('DISCOVER')).toBeTruthy();
    expect(screen.queryByText('COMING UP')).toBeNull();
    expect(screen.queryByText('Coming soon')).toBeNull();
    expect(screen.queryByText('CERVICED Wrapped')).toBeNull();
    expect(screen.UNSAFE_getAllByType(require('react-native').Switch)).toHaveLength(
      Object.keys(DEFAULT_NOTIF_PREFS).length,
    );
  });
});
