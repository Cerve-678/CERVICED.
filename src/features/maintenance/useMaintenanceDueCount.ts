// src/features/maintenance/useMaintenanceDueCount.ts
//
// The "N due" badge on the Profile tab's Beauty Profile row. Re-read on every
// focus (the tab screen never unmounts). Counts exactly what the Maintenance
// card counts — countDueItems with the same upcoming-booking coverage — so the
// badge and the card can't disagree. A failed read shows no badge rather than
// a wrong one; it is logged, not surfaced.

import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getMaintenanceItems, getUpcomingMaintenanceCoverage } from '../../services/databaseService';
import { dateToYMD } from '../../utils/dateUtils';
import { logger } from '../../utils/logger';
import { countDueItems } from './presentation';

export function useMaintenanceDueCount(enabled: boolean): number {
  const [count, setCount] = useState(0);

  useFocusEffect(useCallback(() => {
    if (!enabled) { setCount(0); return; }
    let cancelled = false;
    Promise.all([getMaintenanceItems(), getUpcomingMaintenanceCoverage()])
      .then(([items, coverage]) => {
        if (cancelled) return;
        setCount(countDueItems(items, dateToYMD(new Date()), {
          serviceIds: new Set(coverage.serviceIds),
          providerIds: new Set(coverage.providerIds),
        }));
      })
      .catch(err => {
        if (cancelled) return;
        logger.warn('[Maintenance] due badge read failed:', err);
        setCount(0);
      });
    return () => { cancelled = true; };
  }, [enabled]));

  return count;
}
