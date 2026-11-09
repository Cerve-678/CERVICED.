// src/features/beauty-profile/useFigurePrefs.ts
//
// Which outline the client picked for the body map, and whether due dots
// show on its pins. A look-and-feel choice kept on this phone, per account:
// nothing about it is shared or needed anywhere else. Cleared at sign-out.

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../../utils/logger';
import {
  DEFAULT_FIGURE_PREFS,
  figurePrefsStorageKey,
  parseFigurePrefs,
  type FigurePrefs,
} from './bodyMap';

export function useFigurePrefs(userId: string | null): [FigurePrefs, (next: FigurePrefs) => void] {
  const [prefs, setPrefs] = useState<FigurePrefs>(DEFAULT_FIGURE_PREFS);

  useEffect(() => {
    let alive = true;
    setPrefs(DEFAULT_FIGURE_PREFS);
    if (!userId) return;
    AsyncStorage.getItem(figurePrefsStorageKey(userId))
      .then((raw) => {
        if (alive && raw) setPrefs(parseFigurePrefs(JSON.parse(raw)));
      })
      .catch((err: unknown) => logger.warn('[beauty-map] could not read figure choice', err));
    return () => { alive = false; };
  }, [userId]);

  const save = useCallback((next: FigurePrefs) => {
    setPrefs(next);
    if (!userId) return;
    AsyncStorage.setItem(figurePrefsStorageKey(userId), JSON.stringify(next)).catch((err: unknown) =>
      logger.warn('[beauty-map] could not save figure choice', err),
    );
  }, [userId]);

  return [prefs, save];
}
