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
import { searchProviders } from '../services/databaseService';

beforeEach(() => { mockResponses.length = 0; mockCalls.length = 0; });
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
it('does not turn wildcard-only input into a match-all query', async () => {
  expect(await searchProviders('%_*')).toEqual([]);
  expect(mockCalls).toEqual([]);
});
it('uses the place itself for a location-only query', async () => {
  await searchProviders('near Manchester');
  const filters = mockCalls.filter(c => c.method === 'or').map(c => c.args[0]);
  expect(filters).toContain('display_name.ilike.%Manchester%,about_text.ilike.%Manchester%,location_text.ilike.%Manchester%');
});
