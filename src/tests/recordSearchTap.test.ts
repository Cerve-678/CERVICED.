import { recordSearchTap } from '../services/databaseService';

const mockRpc = jest.fn(async () => ({ error: null as { message: string } | null }));
jest.mock('../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...(args as [])) } }));

beforeEach(() => mockRpc.mockClear());

// search_services_ranked ranks by the service words alone, so a tap has to be
// keyed the same way or "nails in london" never counts towards "nails".
it('teaches the service words, without the place or the budget', async () => {
  await recordSearchTap('nails in london under £30', 'p1', 's1', ['infills in leeds']);
  expect(mockRpc).toHaveBeenCalledWith('record_search_tap', {
    p_query: 'nails',
    p_provider_id: 'p1',
    p_service_id: 's1',
    p_earlier_queries: ['infills'],
  });
});

it('has nothing to teach from a search that was only a place', async () => {
  await recordSearchTap('hackney', 'p1', null, []);
  expect(mockRpc).not.toHaveBeenCalled();
});

it('throws on failure so the caller decides how to degrade', async () => {
  mockRpc.mockResolvedValueOnce({ error: { message: 'nope' } });
  await expect(recordSearchTap('nails', 'p1', null, [])).rejects.toEqual({ message: 'nope' });
});
