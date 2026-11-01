const mockResponses: { data: unknown; error: unknown }[] = [];
const mockRpcResponses: { data: unknown; error: unknown }[] = [];
const mockCalls: { method: string; args: unknown[] }[] = [];
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: () => {
      const result = mockResponses.shift() ?? { data: [], error: null };
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'or', 'limit', 'overlaps', 'in', 'order']) {
        chain[method] = (...args: unknown[]) => { mockCalls.push({ method, args }); return chain; };
      }
      chain['then'] = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
      return chain;
    },
    rpc: (...args: unknown[]) => {
      mockCalls.push({ method: 'rpc', args });
      return Promise.resolve(mockRpcResponses.shift() ?? { data: [], error: null });
    },
  },
}));
import { searchProviders, searchProvidersAndServices } from '../services/databaseService';

const rankedRow = (providerId: string, serviceId: string, rank: number, corrected: string | null = null) => ({
  service_id: serviceId, provider_id: providerId, provider_slug: providerId, provider_name: providerId,
  provider_logo_url: null, provider_location: 'London', booking_mode: 'instant',
  service_name: 'Classic French', service_description: 'Short white French tips', menu_heading: 'French tips',
  service_category: 'NAILS', price: 30, price_max: null, duration_minutes: 60, rank, corrected_query: corrected,
});

beforeEach(() => { mockResponses.length = 0; mockRpcResponses.length = 0; mockCalls.length = 0; });
it('ranks exact names then services before broad category results, before truncation', async () => {
  mockResponses.push(
    { data: [{ provider_id: 'service' }], error: null },
    { data: [{ id: 'exact' }], error: null },
    { data: [{ id: 'broad' }], error: null },
    { data: [
      { id: 'broad', display_name: 'Featured salon' },
      { id: 'service', display_name: 'Local studio' },
      { id: 'exact', display_name: 'Nails' },
    ], error: null },
  );
  expect((await searchProviders('nails', undefined, 2)).map(p => p.id)).toEqual(['exact', 'service']);
});
it('surfaces a failed lookup instead of reporting no matches', async () => {
  const error = { message: 'Connection lost' };
  mockResponses.push({ data: null, error });
  await expect(searchProviders('nails')).rejects.toEqual(error);
});
it('surfaces a failed service search instead of reporting no matches', async () => {
  const error = { message: 'function search_services_ranked does not exist' };
  mockRpcResponses.push({ data: null, error });
  await expect(searchProvidersAndServices('french')).rejects.toEqual(error);
});
it('does not turn wildcard-only input into a match-all query', async () => {
  expect(await searchProviders('%_*')).toEqual([]);
  expect(mockCalls).toEqual([]);
});
it('uses the place itself for a location-only query', async () => {
  await searchProviders('near Manchester');
  const filters = mockCalls.filter(c => c.method === 'or').map(c => c.args[0]);
  expect(filters).toContain('display_name.ilike.%Manchester%,about_text.ilike.%Manchester%,location_text.ilike.%Manchester%');
  // No service words to rank, so the service search isn't asked.
  expect(mockCalls.some(c => c.method === 'rpc')).toBe(false);
});
it('finds a provider only the typo-tolerant service search matched, and returns its services', async () => {
  // "frsnch" matches nothing by substring; only the ranked search reads it as "french".
  mockResponses.push(
    { data: [], error: null },
    { data: [], error: null },
    { data: [{ id: 'studio', display_name: 'Nails Studio' }], error: null },
  );
  mockRpcResponses.push({ data: [rankedRow('studio', 'svc-1', 1, 'french')], error: null });

  const result = await searchProvidersAndServices('frsnch');
  expect(result.providers.map(p => p.id)).toEqual(['studio']);
  expect(result.services.map(s => s.serviceId)).toEqual(['svc-1']);
  expect(result.services[0]).toMatchObject({ providerSlug: 'studio', description: 'Short white French tips', isLinkOnly: false });
  expect(result.correctedQuery).toBe('french');
});
it('sends the service words, category chip and place to the service search', async () => {
  await searchProvidersAndServices('gel nails in Manchester', 'NAILS');
  const rpc = mockCalls.find(c => c.method === 'rpc');
  expect(rpc?.args[0]).toBe('search_services_ranked');
  expect(rpc?.args[1]).toMatchObject({
    p_query: 'gel nails',
    p_category: 'NAILS',
    p_locations: ['Manchester'],
    p_max_price: null,
  });
});
it('sends a typed budget as a price ceiling, not as search words', async () => {
  await searchProvidersAndServices('makeup artists for £70');
  const rpc = mockCalls.find(c => c.method === 'rpc');
  expect(rpc?.args[1]).toMatchObject({ p_query: 'makeup artists', p_max_price: 70 });
});
it('orders service matches by how well their best service matched', async () => {
  mockResponses.push(
    { data: [], error: null },
    { data: [], error: null },
    { data: [], error: null },
    { data: [
      { id: 'weak', display_name: 'A' },
      { id: 'strong', display_name: 'B' },
    ], error: null },
  );
  mockRpcResponses.push({ data: [rankedRow('strong', 's1', 1), rankedRow('weak', 's2', 0.5)], error: null });
  expect((await searchProviders('acrylic nails')).map(p => p.id)).toEqual(['strong', 'weak']);
});
