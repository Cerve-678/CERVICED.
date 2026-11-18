// A provider tapping their logo on My Profile opens their profile as clients
// see it. That must read fresh, not the copy cached up to a minute before an
// edit, so the tap forgets the cached profile first.
let mockFromCalls = 0;
jest.mock('../lib/supabase', () => ({
  clearCachedReads: () => {},
  supabase: {
    from: () => {
      mockFromCalls += 1;
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'limit']) chain[method] = () => chain;
      // Not found: the cheapest answer the profile reads still cache.
      chain['single'] = () => Promise.resolve({ data: null, error: { code: 'PGRST116' } });
      return chain;
    },
  },
}));
import {
  forgetCachedProviderProfile,
  getProviderProfilePreviewBySlug,
} from '../services/databaseService';

beforeEach(() => { mockFromCalls = 0; });

it('serves a repeat open from the cache', async () => {
  await getProviderProfilePreviewBySlug('studio-a');
  await getProviderProfilePreviewBySlug('studio-a');
  expect(mockFromCalls).toBe(1);
});

it('reads the profile again once it has been forgotten', async () => {
  await getProviderProfilePreviewBySlug('studio-b');
  forgetCachedProviderProfile('studio-b');
  await getProviderProfilePreviewBySlug('studio-b');
  expect(mockFromCalls).toBe(2);
});

it('leaves other providers cached', async () => {
  await getProviderProfilePreviewBySlug('studio-c');
  forgetCachedProviderProfile('studio-d');
  await getProviderProfilePreviewBySlug('studio-c');
  expect(mockFromCalls).toBe(1);
});
