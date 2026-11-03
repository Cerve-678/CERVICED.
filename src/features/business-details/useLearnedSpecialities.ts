// src/features/business-details/useLearnedSpecialities.ts
import { useEffect, useMemo, useState } from 'react';
import { getSpecialityUses } from '../../services/databaseService';
import { learnSpecialities, type SpecialityUse } from '../../utils/learnedSpecialities';
import { logger } from '../../utils/logger';

// One read per app session: this is a suggestion list, it needn't be up to the minute.
let cachedUses: Promise<SpecialityUse[]> | null = null;

/** Adds what providers have taught the app to a screen's speciality options.
 *  If the read fails the screen just keeps its curated list. */
export function useSpecialityOptionsWithLearned(
  options: readonly string[],
  categories: readonly string[],
): string[] {
  const [uses, setUses] = useState<SpecialityUse[]>([]);

  useEffect(() => {
    let active = true;
    cachedUses ??= getSpecialityUses();
    cachedUses
      .then(rows => { if (active) setUses(rows); })
      .catch(err => {
        cachedUses = null;
        logger.error('[Specialities] learned terms failed to load:', err);
      });
    return () => { active = false; };
  }, []);

  return useMemo(
    () => [...options, ...learnSpecialities(uses, options, categories)],
    [options, uses, categories],
  );
}
