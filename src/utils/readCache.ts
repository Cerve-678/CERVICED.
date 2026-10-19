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
//  - Only GET/HEAD reads of /rest/v1/ tables are kept, never RPCs, Auth,
//    Storage or Edge Functions, and never the money/slot-hold tables below.
//  - Any write sent through the same client (insert/update/delete, an RPC
//    that isn't a plain `get_` read, a storage upload, an Edge Function call)
//    forgets everything, both when it starts and when it finishes. A read
//    that was in flight across a write is not kept either.
//  - The owner clears it on every Realtime event and on sign-in/out, so a
//    change made by someone else that a screen is subscribed to is never
//    answered from memory. Anything else is at most `ttlMs` old.
//  - Entries are keyed by method, URL and headers, so two signed-in users
//    (different Authorization headers) never share an entry.

type Fetch = typeof fetch;

/** Tables whose reads must always go to the server: payments, payouts,
 *  refunds and checkout slot holds change from webhooks and crons, and a
 *  stale answer there is worse than a slow one. */
const NEVER_CACHE_TABLE = /(payment|payout|stripe|refund|fee_charge|hold|checkout)/i;

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
  if (!table || table === 'rpc') return false;
  return !NEVER_CACHE_TABLE.test(table);
}

/** A request that may change data, so every remembered read is forgotten.
 *  RPCs are POSTs whether or not they write; the `get_` ones in this app are
 *  plain reads (`get_or_create_*` is not, so it still counts as a write). */
export function isWriteRequest(method: string, url: string): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  const rpc = pathOf(url).match(/\/rest\/v1\/rpc\/([^/]+)$/)?.[1];
  if (rpc && rpc.startsWith('get_') && !rpc.startsWith('get_or_create_')) return false;
  return true;
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
    if (response.ok && generation === startedAt) {
      entries.delete(key);
      entries.set(key, { response: response.clone(), storedAt: now() });
      if (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
    }
    return response;
  };

  return { fetch: cachedFetch, clear };
}
