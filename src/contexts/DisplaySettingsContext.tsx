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
import { setTextAppearance } from '../utils/textAppearanceStore';
import { setRegion as setRegionStore } from '../utils/regionStore';
import {
  type FontChoiceKey,
  clampTextScale,
  snapTextScaleToStep,
  isFontChoiceKey,
  isLanguageCode,
  isRegionCode,
  fontFamilyForChoice,
  DEFAULT_TEXT_SCALE,
  DEFAULT_FONT_CHOICE,
  DEFAULT_LANGUAGE,
  DEFAULT_REGION,
} from '../utils/displaySettings';

// On-device display preferences (text size, body font, language, region).
// Mirrors ThemeContext's persistence pattern exactly: one AsyncStorage key per
// field, loaded once on mount, written on change, with a memoized context value
// so consumers don't re-render unless a value they read actually changes.

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

const TEXT_SCALE_KEY = '@cerviced_text_scale';
const FONT_CHOICE_KEY = '@cerviced_font_choice';
const LANGUAGE_KEY = '@cerviced_language';
const REGION_KEY = '@cerviced_region';

export function DisplaySettingsProvider({ children }: { children: ReactNode }) {
  const [textScale, setTextScaleState] = useState<number>(DEFAULT_TEXT_SCALE);
  const [fontChoice, setFontChoiceState] = useState<FontChoiceKey>(DEFAULT_FONT_CHOICE);
  const [language, setLanguageState] = useState<string>(DEFAULT_LANGUAGE);
  const [region, setRegionState] = useState<string>(DEFAULT_REGION);

  // Load persisted preferences once on mount. Independent reads run together;
  // a corrupt/unknown stored value is ignored in favour of the default rather
  // than propagating into rendering.
  //
  // Restore persisted preferences after first paint. Startup must remain
  // usable if device storage is slow; values settle in once the read finishes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [scaleRaw, fontRaw, langRaw, regionRaw] = await Promise.all([
          AsyncStorage.getItem(TEXT_SCALE_KEY),
          AsyncStorage.getItem(FONT_CHOICE_KEY),
          AsyncStorage.getItem(LANGUAGE_KEY),
          AsyncStorage.getItem(REGION_KEY),
        ]);
        if (cancelled) return;
        const resolvedScale = scaleRaw !== null ? snapTextScaleToStep(Number(scaleRaw)) : DEFAULT_TEXT_SCALE;
        const resolvedFont = fontRaw !== null && isFontChoiceKey(fontRaw) ? fontRaw : DEFAULT_FONT_CHOICE;
        const resolvedLang = langRaw !== null && isLanguageCode(langRaw) ? langRaw : DEFAULT_LANGUAGE;
        const resolvedRegion = regionRaw !== null && isRegionCode(regionRaw) ? regionRaw : DEFAULT_REGION;
        setTextScaleState(resolvedScale);
        setFontChoiceState(resolvedFont);
        setLanguageState(resolvedLang);
        setRegionState(resolvedRegion);
        // Seed the stores the global Text wrapper / dateUtils read, before the
        // gate opens, so the first paint is already correct.
        setTextAppearance({ scale: resolvedScale, fontFamily: fontFamilyForChoice(resolvedFont) });
        setRegionStore(resolvedRegion);
      } catch (error) {
        logger.error('Failed to load display settings:', error);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Mirror the live text appearance into the module store the global Text
  // wrapper subscribes to (fontScaleClamp.ts). Runs on mount (seeding defaults)
  // and whenever size/font change or a persisted value loads — so the whole app
  // re-renders text without a restart.
  useEffect(() => {
    setTextAppearance({ scale: textScale, fontFamily: fontFamilyForChoice(fontChoice) });
  }, [textScale, fontChoice]);

  // Mirror region into the module store dateUtils reads, so newly-rendered
  // dates follow the selected region's order.
  useEffect(() => {
    setRegionStore(region);
  }, [region]);

  const setTextScale = useCallback((scale: number) => {
    const snapped = snapTextScaleToStep(clampTextScale(scale));
    setTextScaleState(snapped);
    AsyncStorage.setItem(TEXT_SCALE_KEY, String(snapped)).catch((error) => {
      logger.error('Failed to save text scale:', error);
    });
  }, []);

  const setFontChoice = useCallback((choice: FontChoiceKey) => {
    setFontChoiceState(choice);
    AsyncStorage.setItem(FONT_CHOICE_KEY, choice).catch((error) => {
      logger.error('Failed to save font choice:', error);
    });
  }, []);

  const setLanguage = useCallback((code: string) => {
    setLanguageState(code);
    AsyncStorage.setItem(LANGUAGE_KEY, code).catch((error) => {
      logger.error('Failed to save language:', error);
    });
  }, []);

  const setRegion = useCallback((code: string) => {
    setRegionState(code);
    AsyncStorage.setItem(REGION_KEY, code).catch((error) => {
      logger.error('Failed to save region:', error);
    });
  }, []);

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
