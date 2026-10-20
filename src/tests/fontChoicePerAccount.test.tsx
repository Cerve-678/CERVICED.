import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { DisplaySettingsProvider, useDisplaySettings } from '../contexts/DisplaySettingsContext';
import {
  fontChoiceStorageKey,
  resolveStoredFontChoice,
  LEGACY_FONT_CHOICE_KEY,
  DEFAULT_FONT_CHOICE,
} from '../utils/displaySettings';

let mockUserId: string | null = null;
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUserId ? { id: mockUserId } : null, session: null }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <DisplaySettingsProvider>{children}</DisplaySettingsProvider>
);

beforeEach(async () => {
  mockUserId = null;
  await AsyncStorage.clear();
});

describe('font choice storage helpers', () => {
  it('keys the font by account', () => {
    expect(fontChoiceStorageKey('a')).not.toBe(fontChoiceStorageKey('b'));
  });

  it('reads a missing or retired value as the default', () => {
    expect(resolveStoredFontChoice(null)).toBe(DEFAULT_FONT_CHOICE);
    expect(resolveStoredFontChoice('comic-sans')).toBe(DEFAULT_FONT_CHOICE);
    expect(resolveStoredFontChoice('prata')).toBe('prata');
  });
});

describe('font choice is per account', () => {
  it("one account's font does not reach another account on the same phone", async () => {
    mockUserId = 'account-a';
    const { result, rerender } = renderHook(() => useDisplaySettings(), { wrapper });
    act(() => result.current.setFontChoice('prata'));
    await waitFor(() =>
      expect(AsyncStorage.getItem(fontChoiceStorageKey('account-a'))).resolves.toBe('prata'),
    );

    mockUserId = null;
    rerender({});
    await waitFor(() => expect(result.current.fontChoice).toBe(DEFAULT_FONT_CHOICE));

    mockUserId = 'account-b';
    rerender({});
    await waitFor(() => expect(result.current.fontChoice).toBe(DEFAULT_FONT_CHOICE));

    mockUserId = null;
    rerender({});
    mockUserId = 'account-a';
    rerender({});
    await waitFor(() => expect(result.current.fontChoice).toBe('prata'));
  });

  it('hands an old device-wide choice to the first account only', async () => {
    await AsyncStorage.setItem(LEGACY_FONT_CHOICE_KEY, 'bakbak');

    mockUserId = 'account-a';
    const { result, rerender } = renderHook(() => useDisplaySettings(), { wrapper });
    await waitFor(() => expect(result.current.fontChoice).toBe('bakbak'));
    expect(await AsyncStorage.getItem(LEGACY_FONT_CHOICE_KEY)).toBeNull();

    mockUserId = null;
    rerender({});
    mockUserId = 'account-b';
    rerender({});
    await waitFor(() => expect(result.current.fontChoice).toBe(DEFAULT_FONT_CHOICE));
  });
});
