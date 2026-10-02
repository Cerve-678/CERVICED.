import { useEffect, useState } from 'react';
import { useDisplaySettings } from '../contexts/DisplaySettingsContext';
import { getCachedTranslation, translateDynamic } from '../services/dynamicTranslationService';

/**
 * Live translation of a single piece of provider-WRITTEN content (a bio, a
 * service name, a note) into the active language.
 *
 * Never blocks first paint: it returns the cached-or-original text synchronously
 * and, if a translation is needed and not already cached, fetches it in an
 * effect and swaps it in when it arrives. When the feature is off (the default
 * — no flag / no API key) or the target is English, translateDynamic returns
 * the original synchronously, so this simply renders the original with no
 * network call. Not for legal/health copy — that is held in English through the
 * static do-not-translate guard, not routed through a paid API.
 */
export function useDynamicTranslation(text: string): string {
  const { language } = useDisplaySettings();
  const [value, setValue] = useState<string>(() => getCachedTranslation(text, language) ?? text);

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedTranslation(text, language);
    // Reset to cache-or-original immediately when the inputs change, so a stale
    // previous translation never lingers on new text or a new language.
    setValue(cached ?? text);
    if (cached !== undefined || language === 'en' || !text.trim()) return;

    translateDynamic(text, language)
      .then((translated) => {
        if (!cancelled) setValue(translated);
      })
      .catch(() => {
        /* translateDynamic already degrades to the original; nothing to do. */
      });

    return () => {
      cancelled = true;
    };
  }, [text, language]);

  return value;
}
