import { createReadCache, isCacheableRead, isWriteRequest } from '../utils/readCache';

const BASE = 'https://example.supabase.co';
const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

function fakeServer() {
  let version = 0;
  const calls: string[] = [];
  const fetchImpl = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    if ((init?.method ?? 'GET') !== 'GET') version += 1;
    return new Response(JSON.stringify({ version }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

async function body(response: Response): Promise<{ version: number }> {
  return (await response.json()) as { version: number };
}

describe('readCache', () => {
  it('answers a repeat table read from memory, with a body every caller can read', async () => {
    const server = fakeServer();
    const cache = createReadCache(server.fetchImpl, { ttlMs: 30_000, maxEntries: 10 });
    const url = `${BASE}/rest/v1/providers?select=*`;

    const first = await cache.fetch(url, auth('a'));
    const second = await cache.fetch(url, auth('a'));
    const third = await cache.fetch(url, auth('a'));

    expect(server.calls).toHaveLength(1);
    expect(await body(first)).toEqual({ version: 0 });
    expect(await body(second)).toEqual({ version: 0 });
    expect(await body(third)).toEqual({ version: 0 });
  });

  it('forgets every read after a write, so the next read sees the change', async () => {
    const server = fakeServer();
    const cache = createReadCache(server.fetchImpl, { ttlMs: 30_000, maxEntries: 10 });
    const url = `${BASE}/rest/v1/services?provider_id=eq.1`;

    await cache.fetch(url, auth('a'));
    await cache.fetch(`${BASE}/rest/v1/services?id=eq.9`, { ...auth('a'), method: 'PATCH' });
    const after = await cache.fetch(url, auth('a'));

    expect(await body(after)).toEqual({ version: 1 });
    expect(server.calls).toHaveLength(3);
  });

  it('does not keep a read that was on the wire while a write happened', async () => {
    let releaseRead: (r: Response) => void = () => {};
    const calls: string[] = [];
    const fetchImpl = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init?.method ?? 'GET');
      if ((init?.method ?? 'GET') === 'GET') {
        return new Promise<Response>(resolve => { releaseRead = resolve; });
      }
      return Promise.resolve(new Response('{}', { status: 201 }));
    }) as unknown as typeof fetch;
    const cache = createReadCache(fetchImpl, { ttlMs: 30_000, maxEntries: 10 });
    const url = `${BASE}/rest/v1/bookings?user_id=eq.1`;

    const pending = cache.fetch(url, auth('a'));
    await cache.fetch(`${BASE}/rest/v1/bookings`, { ...auth('a'), method: 'POST' });
    releaseRead(new Response('{"stale":true}', { status: 200 }));
    await pending;

    // The pre-write answer must not be remembered: this read goes out again.
    void cache.fetch(url, auth('a'));
    expect(calls.filter(method => method === 'GET')).toHaveLength(2);
  });

  it('keeps separate entries for separate signed-in users', async () => {
    const server = fakeServer();
    const cache = createReadCache(server.fetchImpl, { ttlMs: 30_000, maxEntries: 10 });
    const url = `${BASE}/rest/v1/notifications?select=id`;

    await cache.fetch(url, auth('a'));
    await cache.fetch(url, auth('b'));

    expect(server.calls).toHaveLength(2);
  });

  it('goes back to the server once an entry is older than the TTL, or after clear()', async () => {
    const server = fakeServer();
    let now = 1_000;
    const cache = createReadCache(server.fetchImpl, { ttlMs: 30_000, maxEntries: 10, now: () => now });
    const url = `${BASE}/rest/v1/reviews?provider_id=eq.1`;

    await cache.fetch(url, auth('a'));
    now += 29_999;
    await cache.fetch(url, auth('a'));
    expect(server.calls).toHaveLength(1);

    now += 1;
    await cache.fetch(url, auth('a'));
    expect(server.calls).toHaveLength(2);

    cache.clear();
    await cache.fetch(url, auth('a'));
    expect(server.calls).toHaveLength(3);
  });

  it('never remembers a failed read', async () => {
    const fetchImpl = jest.fn(async () => new Response('{}', { status: 503 })) as unknown as typeof fetch;
    const cache = createReadCache(fetchImpl, { ttlMs: 30_000, maxEntries: 10 });
    const url = `${BASE}/rest/v1/providers?select=*`;

    await cache.fetch(url, auth('a'));
    await cache.fetch(url, auth('a'));

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('drops the oldest entry when full', async () => {
    const server = fakeServer();
    const cache = createReadCache(server.fetchImpl, { ttlMs: 30_000, maxEntries: 2 });

    await cache.fetch(`${BASE}/rest/v1/a`, auth('a'));
    await cache.fetch(`${BASE}/rest/v1/b`, auth('a'));
    await cache.fetch(`${BASE}/rest/v1/c`, auth('a'));
    await cache.fetch(`${BASE}/rest/v1/a`, auth('a'));

    expect(server.calls).toHaveLength(4);
  });
});

describe('isCacheableRead', () => {
  it('only covers plain table reads', () => {
    expect(isCacheableRead('GET', `${BASE}/rest/v1/providers?select=*`)).toBe(true);
    expect(isCacheableRead('HEAD', `${BASE}/rest/v1/notifications?select=id`)).toBe(true);
    expect(isCacheableRead('POST', `${BASE}/rest/v1/providers`)).toBe(false);
    expect(isCacheableRead('POST', `${BASE}/rest/v1/rpc/get_provider_busy_spans`)).toBe(false);
    expect(isCacheableRead('GET', `${BASE}/auth/v1/user`)).toBe(false);
    expect(isCacheableRead('GET', `${BASE}/storage/v1/object/public/logos/a.png`)).toBe(false);
  });

  it('never covers money or slot-hold tables', () => {
    for (const table of ['provider_payouts', 'booking_fee_charges', 'refund_requests', 'client_stripe_customers', 'booking_holds', 'payment_events']) {
      expect(isCacheableRead('GET', `${BASE}/rest/v1/${table}?select=*`)).toBe(false);
    }
  });
});

describe('isWriteRequest', () => {
  it('treats every non-read as a write except plain get_ RPCs', () => {
    expect(isWriteRequest('GET', `${BASE}/rest/v1/providers`)).toBe(false);
    expect(isWriteRequest('POST', `${BASE}/rest/v1/rpc/get_my_provider_daily_stats`)).toBe(false);
    expect(isWriteRequest('POST', `${BASE}/rest/v1/rpc/get_or_create_provider_conversation`)).toBe(true);
    expect(isWriteRequest('POST', `${BASE}/rest/v1/rpc/record_provider_stat`)).toBe(true);
    expect(isWriteRequest('PATCH', `${BASE}/rest/v1/bookings?id=eq.1`)).toBe(true);
    expect(isWriteRequest('POST', `${BASE}/functions/v1/create-payment-intent`)).toBe(true);
    expect(isWriteRequest('POST', `${BASE}/storage/v1/object/logos/a.png`)).toBe(true);
  });
});
