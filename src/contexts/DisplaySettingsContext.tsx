import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import { useAuth } from './AuthContext';
import { setTextAppearance } from '../utils/textAppearanceStore';
import { setRegion as setRegionStore } from '../utils/regionStore';
import {
  type FontChoiceKey,
  type DisplaySettingField,
  type DisplaySettingsValues,
  clampTextScale,
  snapTextScaleToStep,
  fontFamilyForChoice,
  displaySettingStorageKey,
  resolveStoredDisplaySettings,
  DISPLAY_SETTING_FIELDS,
  LEGACY_DISPLAY_SETTING_KEYS,
  DEFAULT_DISPLAY_SETTINGS,
} from '../utils/displaySettings';

// Display preferences (text size, body font, language, region), kept on-device
// per account: each value is stored under the signed-in account's id, reloaded
// whenever the account changes, and back to the defaults when signed out, so
// one person's choice never changes another account on the same phone. The
// context value is memoized so consumers don't re-render unless a value they
// read actually changes.

interface DisplaySettingsContextType {
  /** Text-size multiplier, one of the discrete steps in displaySettings.ts. */
  textScale: number;
  /** Chosen body-font key. */
  fontChoice: FontChoiceKey;
  /** Resolved RN fontFamily for the chosen font (undefined = system default). */
  fontFamily: string | undefined;
  /** Chosen language code. The i18n layer (src/i18n/) reads this as the active
   *  locale, so changing it re-renders translated UI live. */
  language: string;
  /** Chosen region code. Drives numeric date order app-wide (via regionStore);
   *  currency stays GBP regardless. */
  region: string;

  setTextScale: (scale: number) => void;
  setFontChoice: (choice: FontChoiceKey) => void;
  setLanguage: (code: string) => void;
  setRegion: (code: string) => void;
}

const DisplaySettingsContext = createContext<DisplaySettingsContextType | undefined>(undefined);

/**
 * Read an account's settings in one storage call. A setting the account has
 * never saved takes over the old device-wide value once, and that key is then
 * removed so no second account on the phone inherits it too.
 */
async function loadAccountDisplaySettings(userId: string): Promise<DisplaySettingsValues> {
  const accountKeys = DISPLAY_SETTING_FIELDS.map((field) => displaySettingStorageKey(field, userId));
  const legacyKeys = DISPLAY_SETTING_FIELDS.map((field) => LEGACY_DISPLAY_SETTING_KEYS[field]);
  const stored = await AsyncStorage.multiGet([...accountKeys, ...legacyKeys]);

  const raw = {} as Record<DisplaySettingField, string | null>;
  const adopted: [string, string][] = [];
  const retired: string[] = [];
  DISPLAY_SETTING_FIELDS.forEach((field, i) => {
    const accountRaw = stored[i]?.[1] ?? null;
    const legacyRaw = stored[DISPLAY_SETTING_FIELDS.length + i]?.[1] ?? null;
    if (accountRaw === null && legacyRaw !== null) {
      adopted.push([accountKeys[i]!, legacyRaw]);
      retired.push(legacyKeys[i]!);
    }
    raw[field] = accountRaw ?? legacyRaw;
  });

  if (adopted.length > 0) {
    await AsyncStorage.multiSet(adopted);
    await AsyncStorage.multiRemove(retired);
  }
  return resolveStoredDisplaySettings(raw);
}

export function DisplaySettingsProvider({ children }: { children: ReactNode }) {
  const { user, session } = useAuth();
  const userId = user?.id ?? session?.user?.id ?? null;
  const [textScale, setTextScaleState] = useState<number>(DEFAULT_DISPLAY_SETTINGS.textScale);
  const [fontChoice, setFontChoiceState] = useState<FontChoiceKey>(DEFAULT_DISPLAY_SETTINGS.fontChoice);
  const [language, setLanguageState] = useState<string>(DEFAULT_DISPLAY_SETTINGS.language);
  const [region, setRegionState] = useState<string>(DEFAULT_DISPLAY_SETTINGS.region);

  // Settings follow the signed-in account. Switching accounts always passes
  // through signed-out, which resets to the defaults, so one account's choices
  // never show on another's screens while the read is in flight.
  useEffect(() => {
    const apply = (values: DisplaySettingsValues) => {
      setTextScaleState(values.textScale);
      setFontChoiceState(values.fontChoice);
      setLanguageState(values.language);
      setRegionState(values.region);
    };
    if (!userId) {
      apply(DEFAULT_DISPLAY_SETTINGS);
      return;
    }
    let cancelled = false;
    loadAccountDisplaySettings(userId)
      .then((values) => { if (!cancelled) apply(values); })
      .catch((error) => { logger.error('Failed to load display settings:', error); });
    return () => { cancelled = true; };
  }, [userId]);

  // Mirror the live text appearance into the module store the global Text
  // wrapper subscribes to (fontScaleClamp.ts). Runs on mount (seeding defaults)
  // and whenever size/font change or an account's values load — so the whole
  // app re-renders text without a restart.
  useEffect(() => {
    setTextAppearance({ scale: textScale, fontFamily: fontFamilyForChoice(fontChoice) });
  }, [textScale, fontChoice]);

  // Mirror region into the module store dateUtils reads, so newly-rendered
  // dates follow the selected region's order.
  useEffect(() => {
    setRegionStore(region);
  }, [region]);

  // Display settings are only reachable signed in; with no account there is
  // nowhere to keep a change, so it lasts until the next sign-in.
  const persist = useCallback((field: DisplaySettingField, value: string) => {
    if (!userId) return;
    AsyncStorage.setItem(displaySettingStorageKey(field, userId), value).catch((error) => {
      logger.error(`Failed to save ${field}:`, error);
    });
  }, [userId]);

  const setTextScale = useCallback((scale: number) => {
    const snapped = snapTextScaleToStep(clampTextScale(scale));
    setTextScaleState(snapped);
    persist('textScale', String(snapped));
  }, [persist]);

  const setFontChoice = useCallback((choice: FontChoiceKey) => {
    setFontChoiceState(choice);
    persist('fontChoice', choice);
  }, [persist]);

  const setLanguage = useCallback((code: string) => {
    setLanguageState(code);
    persist('language', code);
  }, [persist]);

  const setRegion = useCallback((code: string) => {
    setRegionState(code);
    persist('region', code);
  }, [persist]);

  const value = useMemo<DisplaySettingsContextType>(
    () => ({
      textScale,
      fontChoice,
      fontFamily: fontFamilyForChoice(fontChoice),
      language,
      region,
      setTextScale,
      setFontChoice,
      setLanguage,
      setRegion,
    }),
    [textScale, fontChoice, language, region, setTextScale, setFontChoice, setLanguage, setRegion],
  );

  return (
    <DisplaySettingsContext.Provider value={value}>
      {children}
    </DisplaySettingsContext.Provider>
  );
}

export function useDisplaySettings(): DisplaySettingsContextType {
  const context = useContext(DisplaySettingsContext);
  if (context === undefined) {
    throw new Error('useDisplaySettings must be used within a DisplaySettingsProvider');
  }
  return context;
}
