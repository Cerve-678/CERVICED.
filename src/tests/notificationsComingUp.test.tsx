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

describe('client Notifications: Coming up', () => {
  it('shows CERVICED Wrapped as coming soon, with no switch of its own', async () => {
    (getNotificationPreferences as jest.Mock).mockResolvedValue(DEFAULT_NOTIF_PREFS);
    render(<NotificationsSettingsScreen navigation={{ goBack: () => {} }} />);

    expect(await screen.findByText('COMING UP')).toBeTruthy();
    expect(screen.getByText('CERVICED Wrapped')).toBeTruthy();
    expect(screen.getByText('Coming soon')).toBeTruthy();
    // One switch per real preference; Wrapped adds none.
    expect(screen.UNSAFE_getAllByType(require('react-native').Switch)).toHaveLength(
      Object.keys(DEFAULT_NOTIF_PREFS).length,
    );
  });

  it('keeps Coming up hidden while the settings are still loading', () => {
    (getNotificationPreferences as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<NotificationsSettingsScreen navigation={{ goBack: () => {} }} />);

    expect(screen.queryByText('CERVICED Wrapped')).toBeNull();
  });
});
