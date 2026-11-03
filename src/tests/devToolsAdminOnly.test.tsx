import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import DevSettingsScreen from '../screens/shared/DevSettingsScreen';
import { TypedConfirmDialog, matchesConfirmWord } from '../components/TypedConfirmDialog';
import { isCervicedAdmin } from '../services/databaseService';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../components/ThemedBackground', () => ({ ThemedBackground: ({ children }: any) => children }));
jest.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDarkMode: false, themePreference: 'light', setDarkMode: jest.fn(), setThemePreference: jest.fn(),
    theme: { statusBar: 'dark-content' },
    palette: { bg: '#F5F1EC', card: '#FFFFFF', surface: '#EDE8E2', accent: '#5C4033', accentText: '#5C4033', onAccent: '#FFFFFF', text: '#000000', sub: '#7E6667', border: '#eee', sep: '#eee', iconBg: '#eee' },
  }),
}));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' }, hatState: { active: 'client', owned: { client: true, provider: false } }, logout: jest.fn() }),
}));
jest.mock('../contexts/BookingContext', () => ({ useBooking: () => ({ reloadBookings: jest.fn() }) }));
jest.mock('../services/databaseService', () => ({
  isCervicedAdmin: jest.fn(),
  clearSeenTours: jest.fn(), getCurrentUserStoredPushToken: jest.fn().mockResolvedValue(null),
  runDevReset: jest.fn(), invokeSendAccountEmail: jest.fn(),
}));
jest.mock('../services/pushNotificationService', () => ({ registerForPushNotifications: jest.fn(), unregisterPushToken: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

describe('Developer tools are for admins only', () => {
  test('a non-admin sees no tools, only a way back', async () => {
    (isCervicedAdmin as jest.Mock).mockResolvedValue(false);
    const goBack = jest.fn();
    const ui = render(<DevSettingsScreen navigation={{ goBack }} />);
    await waitFor(() => expect(ui.getByText('This screen is for admin accounts only.')).toBeTruthy());
    expect(ui.queryByText('Developer Settings')).toBeNull();
    fireEvent.press(ui.getByText('Go back'));
    expect(goBack).toHaveBeenCalled();
  });

  test('a failed admin check hides the tools too', async () => {
    (isCervicedAdmin as jest.Mock).mockRejectedValue(new Error('network'));
    const ui = render(<DevSettingsScreen navigation={{ goBack: jest.fn() }} />);
    await waitFor(() => expect(ui.getByText('This screen is for admin accounts only.')).toBeTruthy());
    expect(ui.queryByText('Developer Settings')).toBeNull();
  });

  test('an admin gets the tools', async () => {
    (isCervicedAdmin as jest.Mock).mockResolvedValue(true);
    const ui = render(<DevSettingsScreen navigation={{ goBack: jest.fn() }} />);
    await waitFor(() => expect(ui.getByText('Developer Settings')).toBeTruthy());
  });
});

describe('TypedConfirmDialog', () => {
  test('the word matches ignoring case and outer spaces only', () => {
    expect(matchesConfirmWord(' delete ', 'DELETE')).toBe(true);
    expect(matchesConfirmWord('DELET', 'DELETE')).toBe(false);
    expect(matchesConfirmWord('DELETE IT', 'DELETE')).toBe(false);
  });

  test('confirm does nothing until the word is typed', () => {
    const onConfirm = jest.fn();
    const ui = render(
      <TypedConfirmDialog
        request={{ title: 'Full Provider Reset', message: 'Deletes things.', word: 'DELETE', confirmLabel: 'Reset everything', onConfirm }}
        onCancel={jest.fn()}
      />,
    );
    fireEvent.press(ui.getByText('Reset everything'));
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.changeText(ui.getByLabelText('Type DELETE to confirm'), 'delete');
    fireEvent.press(ui.getByText('Reset everything'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
