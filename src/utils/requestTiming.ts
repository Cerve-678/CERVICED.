// src/utils/requestTiming.ts
// Dev-only timer around every Supabase network request, so "this screen is
// slow" can be answered with numbers: which requests a screen makes, in what
// order, and how long each one takes. Auth checks (`/auth/v1/user`) are
// labelled separately because they are a round trip that comes before the
// real query rather than being the query itself.
//
// Only the request's kind and table/function name are logged. Query strings
// are dropped on purpose: PostgREST filters carry ids and values
// (`?user_id=eq.…`) that have no business in a log.

export type RequestKind = 'auth-check' | 'auth' | 'table' | 'rpc' | 'storage' | 'function' | 'other';

export interface RequestLabel {
  kind: RequestKind;
  name: string;
}

/** Requests at or above this many ms are marked SLOW in the log. */
export const SLOW_REQUEST_MS = 800;

export function labelSupabaseRequest(url: string): RequestLabel {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url.split('?')[0] ?? url;
  }
  if (path.endsWith('/auth/v1/user')) return { kind: 'auth-check', name: 'getUser' };
  if (path.includes('/auth/v1/')) return { kind: 'auth', name: path.split('/auth/v1/')[1] ?? path };
  const rpc = path.match(/\/rest\/v1\/rpc\/([^/]+)/);
  if (rpc) return { kind: 'rpc', name: rpc[1]! };
  const table = path.match(/\/rest\/v1\/([^/]+)/);
  if (table) return { kind: 'table', name: table[1]! };
  const bucket = path.match(/\/storage\/v1\/object\/(?:public\/|sign\/)?([^/]+)/);
  if (bucket) return { kind: 'storage', name: bucket[1]! };
  const fn = path.match(/\/functions\/v1\/([^/]+)/);
  if (fn) return { kind: 'function', name: fn[1]! };
  return { kind: 'other', name: path };
}

export function formatTimingLine(
  method: string,
  label: RequestLabel,
  ms: number,
  status: number | 'failed',
): string {
  const slow = ms >= SLOW_REQUEST_MS ? ' SLOW' : '';
  return `[timing] ${String(Math.round(ms)).padStart(5)}ms${slow} ${method.padEnd(6)} ${label.kind}:${label.name} (${status})`;
}

type Fetch = typeof fetch;

/** Wraps `baseFetch` so every request reports one timing line via `report`. */
export function createTimedFetch(baseFetch: Fetch, report: (line: string) => void): Fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET');
    const label = labelSupabaseRequest(url);
    const started = Date.now();
    try {
      const response = await baseFetch(input, init);
      report(formatTimingLine(method, label, Date.now() - started, response.status));
      return response;
    } catch (error) {
      report(formatTimingLine(method, label, Date.now() - started, 'failed'));
      throw error;
    }
  };
}
