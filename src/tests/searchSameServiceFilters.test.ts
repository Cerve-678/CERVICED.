import fs from 'fs';
import path from 'path';

/**
 * Price, audience and "Available now" used to be judged per PROVIDER, each on
 * its own, so a provider could pass all three on three different services.
 * They are now judged against one service, and the card shows that service.
 * (The matching rules themselves are pinned in serviceFilterMatch.test.ts.)
 */

const mockRpc = jest.fn();
const mockRows: { data: unknown; error: unknown }[] = [];
const mockSelectCalls: string[][] = [];

jest.mock('../lib/supabase', () => {
  const chain = () => {
    const self: Record<string, unknown> = {};
    for (const method of ['eq', 'in', 'limit']) {
      self[method] = (...args: unknown[]) => {
        if (method === 'in') mockSelectCalls.push(args[1] as string[]);
        return self;
      };
    }
    self['then'] = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(mockRows.shift() ?? { data: [], error: null }).then(resolve, reject);
    return self;
  };
  return {
    supabase: {
      rpc: (...args: unknown[]) => mockRpc(...args),
      from: () => ({ select: () => chain() }),
    },
  };
});

import { getSearchableServices, getServicesAvailability } from '../services/databaseService';

const read = (...parts: string[]): string =>
  fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

describe('getSearchableServices', () => {
  beforeEach(() => { mockRows.length = 0; mockSelectCalls.length = 0; });

  it('returns one row per service, not per-provider aggregates', async () => {
    mockRows.push({
      data: [
        { id: 's1', provider_id: 'p1', name: 'Silk press', price: 45, price_max: null, duration_minutes: 90, audience: 'women' },
        { id: 's2', provider_id: 'p1', name: 'Fade', price: 20, price_max: 30, duration_minutes: null, audience: 'men' },
      ],
      error: null,
    });

    const services = await getSearchableServices(['p1']);

    expect(services).toEqual([
      { id: 's1', providerId: 'p1', name: 'Silk press', price: 45, priceMax: null, durationMinutes: 90, audience: 'women' },
      // A missing duration falls back to the app's hour default rather than 0.
      { id: 's2', providerId: 'p1', name: 'Fade', price: 20, priceMax: 30, durationMinutes: 60, audience: 'men' },
    ]);
  });

  it('never reads a missing price as free', async () => {
    mockRows.push({
      data: [{ id: 's1', provider_id: 'p1', name: 'X', price: null, price_max: null, duration_minutes: 30, audience: null }],
      error: null,
    });
    expect(await getSearchableServices(['p1'])).toEqual([]);
  });

  it('splits a large result set into chunks so no provider is silently cut off by the row cap', async () => {
    const ids = Array.from({ length: 95 }, (_, i) => `p${i}`);

    await getSearchableServices(ids);

    // 95 providers -> 3 queries of at most 40, together covering every provider.
    expect(mockSelectCalls).toHaveLength(3);
    expect(mockSelectCalls.every(chunk => chunk.length <= 40)).toBe(true);
    expect(mockSelectCalls.flat().sort()).toEqual([...ids].sort());
  });

  it('throws if any chunk fails, instead of returning a partial list', async () => {
    mockRows.push({ data: [], error: null }, { data: null, error: { message: 'boom' } });

    await expect(getSearchableServices(Array.from({ length: 60 }, (_, i) => `p${i}`))).rejects.toMatchObject({ message: 'boom' });
  });

  it('throws when a page reaches the row cap rather than returning a possibly-truncated list', async () => {
    mockRows.push({
      data: Array.from({ length: 1000 }, (_, i) => ({
        id: `s${i}`, provider_id: 'p1', name: 'X', price: 10, price_max: null, duration_minutes: 30, audience: null,
      })),
      error: null,
    });

    await expect(getSearchableServices(['p1'])).rejects.toThrow(/row cap/);
  });

  it('makes no query for an empty provider list', async () => {
    expect(await getSearchableServices([])).toEqual([]);
    expect(mockSelectCalls).toHaveLength(0);
  });
});

describe('getServicesAvailability', () => {
  beforeEach(() => { mockRpc.mockReset(); });

  it('maps the RPC rows to per-service availability', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { service_id: 's1', has_slot: true, next_available: '2026-09-28' },
        { service_id: 's2', has_slot: false, next_available: null },
      ],
      error: null,
    });

    const result = await getServicesAvailability(['s1', 's2']);

    expect(mockRpc).toHaveBeenCalledWith('get_services_availability', { p_service_ids: ['s1', 's2'] });
    expect(result.get('s1')).toEqual({ hasSlot: true, nextAvailable: '2026-09-28' });
    expect(result.get('s2')).toEqual({ hasSlot: false, nextAvailable: null });
  });

  it('answers every requested id, so an unbookable service is "no slot", not "not asked yet"', async () => {
    mockRpc.mockResolvedValue({
      data: [{ service_id: 's1', has_slot: true, next_available: '2026-09-28' }],
      error: null,
    });

    const result = await getServicesAvailability(['s1', 'gone']);

    expect(result.get('gone')).toEqual({ hasSlot: false, nextAvailable: null });
  });

  it('chunks past the database limit of 300 services per call', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    await getServicesAvailability(Array.from({ length: 650 }, (_, i) => `s${i}`));

    expect(mockRpc).toHaveBeenCalledTimes(3);
  });

  it('throws when the RPC fails so the screen can say it could not check', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('rpc failed') });

    await expect(getServicesAvailability(['s1'])).rejects.toThrow('rpc failed');
  });
});

describe('SearchScreen judges the filters against one service', () => {
  const source = read('screens', 'client', 'SearchScreen.tsx');

  it('no longer decides price, audience or availability per provider', () => {
    // The old provider-level paths.
    expect(source).not.toContain('audienceMatchIds');
    expect(source).not.toContain("p.availability === 'available' || p.availability === 'limited'");
    expect(source).not.toContain('priceRangeMatchesBucket(resolveProviderPriceRange');
    expect(source).toContain('pickMatchingService(services, serviceCriteria)');
  });

  it('asks about availability only for services that already pass the other filters', () => {
    expect(source).toContain('serviceMatchesCriteria(service, baseServiceCriteria)');
    expect(source).toContain('getServicesAvailability(availabilityMissingIds)');
  });

  it('keeps availability answers across filter changes and only asks for what is missing', () => {
    expect(source).toContain('availabilityCandidateIds.filter(id => !serviceAvailability.has(id))');
    expect(source).toContain('new Map([...prev, ...answered])');
    // A refire used to null the map, blanking the grid on every price/audience tap.
    expect(source).not.toContain('setServiceAvailability(null)');
  });

  it('shows the matched service\'s own price and name on the card', () => {
    expect(source).toContain('priceRange: serviceRange(service)');
    expect(source).toContain('provider.matchedService?.name ?? provider.service');
  });

  it('Book Now opens the matched service; tapping the card body only opens the profile', () => {
    expect(source).toContain('onBookPress={() => openProvider(item, item.matchedService?.id)}');
    expect(source).toContain('onPress={() => openProvider(item)}');
  });
});
