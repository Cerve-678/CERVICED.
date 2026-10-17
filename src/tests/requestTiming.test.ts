import { createCoalescingFetch, createTimedFetch, formatTimingLine, labelSupabaseRequest } from '../utils/requestTiming';

const BASE = 'https://abc.supabase.co';

describe('labelSupabaseRequest', () => {
  it('separates the getUser auth check from other auth calls', () => {
    expect(labelSupabaseRequest(`${BASE}/auth/v1/user`)).toEqual({ kind: 'auth-check', name: 'getUser' });
    expect(labelSupabaseRequest(`${BASE}/auth/v1/token?grant_type=refresh_token`)).toEqual({ kind: 'auth', name: 'token' });
  });

  it('names tables and RPCs without their query string', () => {
    expect(labelSupabaseRequest(`${BASE}/rest/v1/providers?user_id=eq.123&select=*`)).toEqual({ kind: 'table', name: 'providers' });
    expect(labelSupabaseRequest(`${BASE}/rest/v1/rpc/get_provider_terms`)).toEqual({ kind: 'rpc', name: 'get_provider_terms' });
  });

  it('names storage buckets and edge functions', () => {
    expect(labelSupabaseRequest(`${BASE}/storage/v1/object/public/portfolio/a.jpg`)).toEqual({ kind: 'storage', name: 'portfolio' });
    expect(labelSupabaseRequest(`${BASE}/functions/v1/send-email`)).toEqual({ kind: 'function', name: 'send-email' });
  });
});

describe('formatTimingLine', () => {
  it('flags slow requests and never includes ids from the URL', () => {
    const line = formatTimingLine('GET', labelSupabaseRequest(`${BASE}/rest/v1/bookings?id=eq.secret`), 950, 200);
    expect(line).toContain('SLOW');
    expect(line).toContain('table:bookings');
    expect(line).not.toContain('secret');
  });
});

describe('createTimedFetch', () => {
  it('reports one line per request and passes the response through', async () => {
    const response = { status: 200 } as Response;
    const lines: string[] = [];
    const timed = createTimedFetch((async () => response) as typeof fetch, (l) => lines.push(l));
    await expect(timed(`${BASE}/auth/v1/user`)).resolves.toBe(response);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('auth-check:getUser (200)');
  });

  it('reports and rethrows a failed request', async () => {
    const lines: string[] = [];
    const timed = createTimedFetch((async () => { throw new Error('offline'); }) as typeof fetch, (l) => lines.push(l));
    await expect(timed(`${BASE}/rest/v1/notifications`)).rejects.toThrow('offline');
    expect(lines[0]).toContain('(failed)');
  });
});

describe('createCoalescingFetch', () => {
  it('shares simultaneous identical reads while giving callers independent bodies', async () => {
    const baseFetch = jest.fn(async () => new Response(JSON.stringify({ ok: true })));
    const coalesced = createCoalescingFetch(baseFetch as typeof fetch);

    const [first, second] = await Promise.all([
      coalesced(`${BASE}/rest/v1/providers?select=id`),
      coalesced(`${BASE}/rest/v1/providers?select=id`),
    ]);

    expect(baseFetch).toHaveBeenCalledTimes(1);
    await expect(first.json()).resolves.toEqual({ ok: true });
    await expect(second.json()).resolves.toEqual({ ok: true });
  });

  it('does not coalesce writes', async () => {
    const baseFetch = jest.fn(async () => new Response(null, { status: 204 }));
    const coalesced = createCoalescingFetch(baseFetch as typeof fetch);

    await Promise.all([
      coalesced(`${BASE}/rest/v1/users`, { method: 'PATCH' }),
      coalesced(`${BASE}/rest/v1/users`, { method: 'PATCH' }),
    ]);

    expect(baseFetch).toHaveBeenCalledTimes(2);
  });
});
