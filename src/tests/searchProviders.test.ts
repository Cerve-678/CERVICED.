const mockResponses: { data: unknown; error: unknown }[] = [];
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
  },
}));
import { searchProviders, searchServices } from '../services/databaseService';

beforeEach(() => { mockResponses.length = 0; mockCalls.length = 0; });
it('ranks exact provider and service names before broad category results, before truncation', async () => {
  mockResponses.push(
    { data: [{ provider_id: 'service', name: 'Nails' }], error: null },
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
it('searches the full client-facing service copy', async () => {
  mockResponses.push(
    { data: [], error: null },
    { data: [], error: null },
  );
  await searchProviders('bridal');
  const serviceFilter = mockCalls.find(c => c.method === 'or')?.args[0];
  expect(serviceFilter).toBe(
    'name.ilike.%bridal%,description.ilike.%bridal%,category_name.ilike.%bridal%,category_description.ilike.%bridal%',
  );
});
it('returns the matching service names so Search can show them on provider cards', async () => {
  mockResponses.push(
    { data: [{ provider_id: 'provider-1', name: 'Bridal Glam' }], error: null },
    { data: [], error: null },
    { data: [{ id: 'provider-1', display_name: 'Glam Studio' }], error: null },
  );
  const [result] = await searchProviders('bridal');
  expect(result?.matched_service_names).toEqual(['Bridal Glam']);
});
it('returns photo-backed service results separately from provider cards', async () => {
  mockResponses.push({
    data: [{
      id: 'service-1',
      name: 'Bridal Glam',
      service_images: [{ url: 'https://example.com/bridal.jpg', sort_order: 0 }],
      provider: { slug: 'glam-studio', display_name: 'Glam Studio' },
    }],
    error: null,
  });
  const results = await searchServices('bridal');
  expect(results[0]?.name).toBe('Bridal Glam');
  expect(results[0]?.service_images[0]?.url).toBe('https://example.com/bridal.jpg');
});
it('surfaces a failed lookup instead of reporting no matches', async () => {
  const error = { message: 'Connection lost' };
  mockResponses.push({ data: null, error });
  await expect(searchProviders('nails')).rejects.toEqual(error);
});
it('does not turn wildcard-only input into a match-all query', async () => {
  expect(await searchProviders('%_*')).toEqual([]);
  expect(mockCalls).toEqual([]);
});
it('uses the place itself for a location-only query', async () => {
  await searchProviders('near Manchester');
  const filters = mockCalls.filter(c => c.method === 'or').map(c => c.args[0]);
  expect(filters).toContain('display_name.ilike.%Manchester%,about_text.ilike.%Manchester%,location_text.ilike.%Manchester%');
});
