import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { DisplaySettingsProvider, useDisplaySettings } from '../contexts/DisplaySettingsContext';
import {
  displaySettingStorageKey,
  resolveStoredDisplaySettings,
  LEGACY_DISPLAY_SETTING_KEYS,
  DEFAULT_DISPLAY_SETTINGS,
} from '../utils/displaySettings';

let mockUserId: string | null = null;
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUserId ? { id: mockUserId } : null, session: null }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <DisplaySettingsProvider>{children}</DisplaySettingsProvider>
);

function settingsOf(current: ReturnType<typeof useDisplaySettings>) {
  const { textScale, fontChoice, language, region } = current;
  return { textScale, fontChoice, language, region };
}

beforeEach(async () => {
  mockUserId = null;
  await AsyncStorage.clear();
});

describe('display settings storage helpers', () => {
  it('keys every setting by account', () => {
    expect(displaySettingStorageKey('textScale', 'a')).not.toBe(displaySettingStorageKey('textScale', 'b'));
    expect(displaySettingStorageKey('language', 'a')).not.toBe(displaySettingStorageKey('region', 'a'));
  });

  it('reads missing, corrupt or retired values as the defaults', () => {
    expect(resolveStoredDisplaySettings({ textScale: null, fontChoice: null, language: null, region: null }))
      .toEqual(DEFAULT_DISPLAY_SETTINGS);
    expect(resolveStoredDisplaySettings({ textScale: 'big', fontChoice: 'comic-sans', language: 'xx', region: 'ZZ' }))
      .toEqual(DEFAULT_DISPLAY_SETTINGS);
    expect(resolveStoredDisplaySettings({ textScale: '1.3', fontChoice: 'prata', language: 'fr', region: 'US' }))
      .toEqual({ textScale: 1.3, fontChoice: 'prata', language: 'fr', region: 'US' });
  });
});

describe('display settings are per account', () => {
  it("one account's choices do not reach another account on the same phone", async () => {
    mockUserId = 'account-a';
    const { result, rerender } = renderHook(() => useDisplaySettings(), { wrapper });
    act(() => {
      result.current.setTextScale(1.3);
      result.current.setFontChoice('prata');
      result.current.setLanguage('fr');
      result.current.setRegion('US');
    });
    await waitFor(() =>
      expect(AsyncStorage.getItem(displaySettingStorageKey('region', 'account-a'))).resolves.toBe('US'),
    );

    mockUserId = null;
    rerender({});
    await waitFor(() => expect(settingsOf(result.current)).toEqual(DEFAULT_DISPLAY_SETTINGS));

    mockUserId = 'account-b';
    rerender({});
    await waitFor(() => expect(settingsOf(result.current)).toEqual(DEFAULT_DISPLAY_SETTINGS));

    mockUserId = null;
    rerender({});
    mockUserId = 'account-a';
    rerender({});
    await waitFor(() =>
      expect(settingsOf(result.current)).toEqual({ textScale: 1.3, fontChoice: 'prata', language: 'fr', region: 'US' }),
    );
  });

  it('hands old device-wide choices to the first account only', async () => {
    await AsyncStorage.multiSet([
      [LEGACY_DISPLAY_SETTING_KEYS.textScale, '1.15'],
      [LEGACY_DISPLAY_SETTING_KEYS.fontChoice, 'bakbak'],
      [LEGACY_DISPLAY_SETTING_KEYS.language, 'es'],
    ]);

    mockUserId = 'account-a';
    const { result, rerender } = renderHook(() => useDisplaySettings(), { wrapper });
    await waitFor(() =>
      expect(settingsOf(result.current)).toEqual({ textScale: 1.15, fontChoice: 'bakbak', language: 'es', region: 'GB' }),
    );
    expect(await AsyncStorage.getItem(LEGACY_DISPLAY_SETTING_KEYS.fontChoice)).toBeNull();
    expect(await AsyncStorage.getItem(LEGACY_DISPLAY_SETTING_KEYS.textScale)).toBeNull();

    mockUserId = null;
    rerender({});
    mockUserId = 'account-b';
    rerender({});
    await waitFor(() => expect(settingsOf(result.current)).toEqual(DEFAULT_DISPLAY_SETTINGS));
  });
});
