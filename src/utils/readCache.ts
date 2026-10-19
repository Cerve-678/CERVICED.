// src/utils/readCache.ts
// A short-lived memory of recent Supabase table reads, so moving between
// screens doesn't re-ask the server for rows it sent seconds ago.
//
// Why this exists: every screen loads its own data on mount and on focus, and
// a screen waits for the slowest of its requests. On this project's API a
// typical read takes a few hundred ms but roughly one in ten takes several
// seconds, so a screen that sends ten reads usually hits one of the slow ones.
// Answering a repeat read from memory removes it from that lottery.
//
// What keeps it from serving stale data:
//  - Only GET/HEAD reads of the tables in CACHEABLE_TABLES are kept: public
//    browse data, a provider's own schedule, reviews, saved providers, the
//    unread count. Anything not listed, including bookings (status, payment
//    and released-address state that webhooks and crons change), payments,
//    payouts, fees and holds, always goes to the server. A new table is
//    uncached until someone decides otherwise.
//  - RPCs, Auth, Storage and Edge Functions are never cached.
//  - Any write sent through the same client (insert/update/delete, an RPC
//    that isn't a plain `get_` read, a storage upload, an Edge Function call)
//    forgets everything, both when it starts and when it finishes. A read
//    that was in flight across a write is not kept either. Analytics inserts
//    that no screen reads back are the exception (ANALYTICS_ONLY_WRITES).
//  - The owner clears it on every Realtime event and on sign-in/out, so a
//    change made by someone else that a screen is subscribed to is never
//    answered from memory. Anything else is at most `ttlMs` old.
//  - Entries are keyed by method, URL and headers, so two signed-in users
//    (different Authorization headers) never share an entry.
//  - Replies over MAX_CACHED_RESPONSE_BYTES aren't kept, and expired entries
//    are swept on every insert, so memory stays small on low-end phones.

type Fetch = typeof fetch;

/** Tables whose reads may be answered from memory. Read-mostly data that
 *  only changes through a write from this phone, through a Realtime event a
 *  screen listens to, or slowly enough that 30 seconds doesn't matter. */
const CACHEABLE_TABLES = new Set([
  'providers',
  'services',
  'service_images',
  'service_add_ons',
  'portfolio_items',
  'provider_specialties',
  'provider_availability',
  'provider_availability_windows',
  'provider_availability_overrides',
  'provider_blocked_dates',
  'reviews',
  'bookmarks',
  'provider_follows',
  'notifications',
  'users',
  'maintenance_items',
  'maintenance_settings',
]);

/** Inserts into tables no screen reads back (search and interaction logs,
 *  profile-view counters read only through an uncached RPC). They don't
 *  change anything a cached read returns, so they don't clear the cache.
 *  Without this, Search's per-query log would wipe the results it just got. */
const ANALYTICS_ONLY_WRITES = new Set([
  '/rest/v1/search_events',
  '/rest/v1/user_interactions',
  '/rest/v1/rpc/record_provider_stat',
]);

/** A reply larger than this isn't kept. Content-Length is only present on
 *  some replies; when it's missing the entry is kept, and the entry cap
 *  bounds the total. */
export const MAX_CACHED_RESPONSE_BYTES = 256 * 1024;

export interface ReadCacheOptions {
  ttlMs: number;
  maxEntries: number;
  now?: () => number;
  /** Dev logging hook, called once per read answered from memory. */
  onHit?: (method: string, url: string) => void;
}

export interface ReadCache {
  fetch: Fetch;
  /** Forget every remembered read. Safe to call at any time. */
  clear: () => void;
}

interface Entry {
  response: Response;
  storedAt: number;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  return (init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
}

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

/** Same key shape as the in-flight coalescer: headers decide which rows a
 *  user can see and how PostgREST shapes the response. */
export function readRequestKey(input: RequestInfo | URL, init?: RequestInit): string {
  const headers = new Headers(init?.headers ?? (typeof input === 'object' && 'headers' in input ? input.headers : undefined));
  const headerKey = Array.from(headers.entries())
    .map(([name, value]) => [name.toLowerCase(), value] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return `${requestMethod(input, init)} ${requestUrl(input)} ${JSON.stringify(headerKey)}`;
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.split('?')[0] ?? url;
  }
}

/** A table read this cache may answer from memory. */
export function isCacheableRead(method: string, url: string): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  const table = pathOf(url).match(/\/rest\/v1\/([^/]+)$/)?.[1];
  return table !== undefined && CACHEABLE_TABLES.has(table);
}

/** A request that may change data, so every remembered read is forgotten.
 *  RPCs are POSTs whether or not they write. Every `get_` RPC this app calls
 *  is a plain read (`get_or_create_*` is not, so it still counts as a write);
 *  a new `get_` function that writes must not be named that way, or must be
 *  given another name here. */
export function isWriteRequest(method: string, url: string): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  const path = pathOf(url);
  if (ANALYTICS_ONLY_WRITES.has(path.replace(/^.*(\/rest\/v1\/)/, '$1'))) return false;
  const rpc = path.match(/\/rest\/v1\/rpc\/([^/]+)$/)?.[1];
  if (rpc && rpc.startsWith('get_') && !rpc.startsWith('get_or_create_')) return false;
  return true;
}

function tooLargeToKeep(response: Response): boolean {
  const length = Number(response.headers.get('content-length'));
  return Number.isFinite(length) && length > MAX_CACHED_RESPONSE_BYTES;
}

export function createReadCache(baseFetch: Fetch, options: ReadCacheOptions): ReadCache {
  const { ttlMs, maxEntries } = options;
  const now = options.now ?? Date.now;
  const entries = new Map<string, Entry>();
  // Bumped by every clear. A read only gets remembered if no clear happened
  // while it was on the wire, so a reply that may predate a write is dropped.
  let generation = 0;

  const clear = () => {
    generation += 1;
    entries.clear();
  };

  const cachedFetch: Fetch = async (input, init) => {
    const method = requestMethod(input, init);
    const url = requestUrl(input);

    if (isWriteRequest(method, url)) {
      clear();
      try {
        return await baseFetch(input, init);
      } finally {
        clear();
      }
    }

    if (!isCacheableRead(method, url)) return baseFetch(input, init);

    const key = readRequestKey(input, init);
    const hit = entries.get(key);
    if (hit) {
      if (now() - hit.storedAt < ttlMs) {
        options.onHit?.(method, url);
        // Each caller parses its own body, so hand out a fresh copy and keep
        // the stored one unread.
        return hit.response.clone();
      }
      entries.delete(key);
    }

    const startedAt = generation;
    const response = await baseFetch(input, init);
    if (response.ok && generation === startedAt && !tooLargeToKeep(response)) {
      const storedAt = now();
      // Sweep anything already expired: keys include the Authorization
      // header, so a token refresh would otherwise leave old entries behind
      // until the cap pushed them out.
      for (const [entryKey, entry] of entries) {
        if (storedAt - entry.storedAt >= ttlMs) entries.delete(entryKey);
      }
      entries.delete(key);
      entries.set(key, { response: response.clone(), storedAt });
      if (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
    }
    return response;
  };

  return { fetch: cachedFetch, clear };
}
