import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { FullMemberConversion } from '../features/providers/FullMemberConversion';
import { fetchGoLiveStatus } from '../features/providers/goLiveStatus';

const mockBecomeFullMember = jest.fn();
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ becomeFullMember: mockBecomeFullMember }),
}));
jest.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({ isDarkMode: false, palette: { accent: '#5C4033', onAccent: '#FFFFFF' } }),
}));
jest.mock('../features/providers/goLiveStatus', () => ({
  ...jest.requireActual('../features/providers/goLiveStatus'),
  fetchGoLiveStatus: jest.fn(),
}));
jest.mock('../utils/bottomSafeGap', () => ({ useSystemBottomInset: () => 0 }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../components/TabIcon', () => () => null);
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));
jest.mock('../utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() }, reportError: jest.fn() }));

const notLive = {
  scheduleSet: true, servicesSet: false, addressSet: false, profileCompleteSet: true,
  policiesSet: false, paymentSet: true, brandingSet: true, isLive: false,
};

describe('FullMemberConversion', () => {
  // Real timers with Reduce Motion on: the screen's short pacing (about 120ms
  // a step) keeps each test around a second. Fake timers hang the runner
  // after the suite here.
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    mockBecomeFullMember.mockReset();
    (fetchGoLiveStatus as jest.Mock).mockReset();
  });

  it('runs the switch once, ticks through, and lands on what is left to go live', async () => {
    mockBecomeFullMember.mockResolvedValue(undefined);
    (fetchGoLiveStatus as jest.Mock).mockResolvedValue(notLive);
    const onFinish = jest.fn();
    const screen = render(<FullMemberConversion onFinish={onFinish} onCancel={jest.fn()} onPhaseChange={jest.fn()} />);

    expect(screen.getByText('Turning on bookings in CERVICED')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('You can now')).toBeTruthy(), { timeout: 4000 });

    expect(mockBecomeFullMember).toHaveBeenCalledTimes(1);
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('NOT ON SEARCH YET')).toBeTruthy();
    fireEvent.press(screen.getByText('Finish going live'));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('does not tick ahead of the server', async () => {
    mockBecomeFullMember.mockReturnValue(new Promise(() => {}));
    const screen = render(<FullMemberConversion onFinish={jest.fn()} onCancel={jest.fn()} onPhaseChange={jest.fn()} />);
    await act(async () => { await new Promise(r => setTimeout(r, 1500)); });
    expect(screen.getByText('1 OF 7')).toBeTruthy();
    expect(screen.queryByText('You can now')).toBeNull();
  });

  it('shows the failure, and Try again runs the switch again', async () => {
    mockBecomeFullMember.mockRejectedValueOnce(new Error('Network request failed')).mockResolvedValue(undefined);
    (fetchGoLiveStatus as jest.Mock).mockResolvedValue(notLive);
    const screen = render(<FullMemberConversion onFinish={jest.fn()} onCancel={jest.fn()} onPhaseChange={jest.fn()} />);
    await waitFor(() => expect(screen.getByText("We couldn't finish switching you over.")).toBeTruthy());
    expect(screen.getByText('No internet connection. Please check your network and try again.')).toBeTruthy();
    fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(screen.getByText('You can now')).toBeTruthy(), { timeout: 4000 });
    expect(mockBecomeFullMember).toHaveBeenCalledTimes(2);
  });
});
