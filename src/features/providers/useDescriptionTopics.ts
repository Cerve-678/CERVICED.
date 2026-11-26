// src/features/providers/useDescriptionTopics.ts
import { useEffect, useMemo, useState } from 'react';
import { getLiveServiceDescriptions } from '../../services/databaseService';
import { learnDescriptionTopics, type LiveServiceDescription } from './descriptionTopics';
import { logger } from '../../utils/logger';

// One read per app session: a hint, it needn't be up to the minute.
let cachedRows: Promise<LiveServiceDescription[]> | null = null;

/** What other providers mention for services like this one. Empty if the read
 *  fails: the editor just doesn't show the hint. */
export function useDescriptionTopics(serviceName: string, description: string, ownProviderId?: string | null): string[] {
  const [rows, setRows] = useState<LiveServiceDescription[]>([]);

  useEffect(() => {
    let active = true;
    cachedRows ??= getLiveServiceDescriptions();
    cachedRows
      .then(r => { if (active) setRows(r); })
      .catch(err => {
        cachedRows = null;
        logger.error('[Services] description topics failed to load:', err);
      });
    return () => { active = false; };
  }, []);

  return useMemo(
    () => learnDescriptionTopics(rows, serviceName, description, ownProviderId),
    [rows, serviceName, description, ownProviderId],
  );
}
