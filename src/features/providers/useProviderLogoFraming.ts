import { useEffect, useReducer } from 'react';
import { getProviderLogoFramings, type ProviderLogoFramingEntry } from '../../services/databaseService';
import type { LogoFraming } from '../../types/database';
import { logger } from '../../utils/logger';

/**
 * How a provider framed their circle logo, for rows whose logo comes without
 * it: a booking's logo snapshot, a search result row, a cart item.
 *
 * Each row asks for its own provider, but asks made in the same tick go out as
 * ONE `.in('id', …)` query, so a list of 30 rows is one request, not 30.
 * Answers are kept for a few minutes.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEEP_MS = 5 * 60 * 1000;

const cache = new Map<string, { entry: ProviderLogoFramingEntry | null; at: number }>();
const queued = new Set<string>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

function flush(): void {
  timer = null;
  const ids = [...queued];
  queued.clear();
  if (ids.length === 0) return;
  getProviderLogoFramings(ids)
    .then(found => {
      const at = Date.now();
      for (const id of ids) cache.set(id, { entry: found[id] ?? null, at });
    })
    .catch(err => {
      // Rows just stay unframed; a later screen asks again.
      logger.error('[useProviderLogoFraming] framing load failed:', err);
    })
    .finally(() => listeners.forEach(l => l()));
}

function isFresh(id: string): boolean {
  const hit = cache.get(id);
  return !!hit && Date.now() - hit.at < KEEP_MS;
}

/**
 * The circle framing for `providerId`, but only while `uri` is still that
 * provider's current logo: a booking's snapshot of an older logo must not be
 * drawn with framing made for a newer one.
 */
export function useProviderLogoFraming(
  providerId: string | null | undefined,
  uri: string | null | undefined,
): LogoFraming | null {
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    listeners.add(rerender);
    return () => { listeners.delete(rerender); };
  }, []);

  useEffect(() => {
    if (!providerId || !UUID.test(providerId) || isFresh(providerId) || queued.has(providerId)) return;
    queued.add(providerId);
    timer ??= setTimeout(flush, 0);
  }, [providerId]);

  const entry = providerId ? cache.get(providerId)?.entry : null;
  return entry && uri && entry.logoUrl === uri ? entry.framing : null;
}
