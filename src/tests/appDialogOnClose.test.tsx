import React from 'react';
import { act, fireEvent, render, renderHook } from '@testing-library/react-native';
import { useAppDialog } from '../components/AppDialog';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined), selectionAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined), ImpactFeedbackStyle: {}, NotificationFeedbackType: {},
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDarkMode: false, theme: { statusBar: 'dark-content' },
    palette: { bg: '#F5F1EC', card: '#FFFFFF', surface: '#EDE8E2', accent: '#5C4033', accentText: '#5C4033', onAccent: '#FFFFFF', text: '#000000', secondaryText: '#7E6667', sub: '#7E6667', border: '#eee', sep: '#eee' },
  }),
}));

// The Cart waits on a dialog's answer ("Pay here" or not). A dialog closed
// without a button (backdrop, Android back, replaced) must still answer, or
// the Cart would be stuck reserving.
describe('useAppDialog onClose', () => {
  it('runs after the pressed button, once', () => {
    const { result } = renderHook(() => useAppDialog());
    const order: string[] = [];
    act(() => {
      result.current.showConfirm('Title', 'Message', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Pay here', onPress: () => order.push('pay') },
      ], 'sheet', () => order.push('closed'));
    });
    const { DialogHost } = result.current;
    const screen = render(<DialogHost />);
    act(() => { fireEvent.press(screen.getByText('Pay here')); });
    expect(order).toEqual(['pay', 'closed']);
  });

  it('runs when the dialog is closed without pressing a button', () => {
    const { result } = renderHook(() => useAppDialog());
    const onClose = jest.fn();
    act(() => {
      result.current.showConfirm('Title', 'Message', [{ text: 'Not now', style: 'cancel' }], 'sheet', onClose);
    });
    const { DialogHost } = result.current;
    const screen = render(<DialogHost />);
    act(() => { fireEvent.press(screen.getByText('Not now')); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('runs when another dialog replaces it', () => {
    const { result } = renderHook(() => useAppDialog());
    const onClose = jest.fn();
    act(() => {
      result.current.showConfirm('First', undefined, [{ text: 'OK' }], 'sheet', onClose);
    });
    act(() => { result.current.showAlert('Second'); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
