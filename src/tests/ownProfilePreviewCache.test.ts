// A provider tapping their logo on My Profile opens their profile as clients
// see it. The tap reads the profile fresh first (not the copy cached up to a
// minute before an edit), and the page then draws that copy on its first
// frame instead of flashing a loading skeleton.
let mockFromCalls = 0;
let mockFound = false;
jest.mock('../lib/supabase', () => ({
  clearCachedReads: () => {},
  supabase: {
    from: () => {
      mockFromCalls += 1;
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'limit']) chain[method] = () => chain;
      chain['single'] = () => Promise.resolve(
        mockFound
          ? { data: { id: `p-${mockFromCalls}`, display_name: 'Studio', services: [], provider_specialties: [] }, error: null }
          : { data: null, error: { code: 'PGRST116' } },
      );
      return chain;
    },
  },
}));
import {
  getProviderProfilePreviewBySlug,
  peekCachedProviderProfile,
  refreshCachedProviderProfile,
} from '../services/databaseService';

beforeEach(() => { mockFromCalls = 0; mockFound = false; });

it('serves a repeat open from the cache', async () => {
  await getProviderProfilePreviewBySlug('studio-a');
  await getProviderProfilePreviewBySlug('studio-a');
  expect(mockFromCalls).toBe(1);
});

it('reads the profile again when refreshed, and caches the fresh copy', async () => {
  mockFound = true;
  await getProviderProfilePreviewBySlug('studio-b');
  expect(peekCachedProviderProfile('studio-b')?.id).toBe('p-1');
  await refreshCachedProviderProfile('studio-b');
  expect(mockFromCalls).toBe(2);
  expect(peekCachedProviderProfile('studio-b')?.id).toBe('p-2');
  // The open after the refresh is served from it.
  await getProviderProfilePreviewBySlug('studio-b');
  expect(mockFromCalls).toBe(2);
});

it('peeks nothing for an uncached or not-found profile', async () => {
  expect(peekCachedProviderProfile('studio-c')).toBeUndefined();
  await getProviderProfilePreviewBySlug('studio-c');
  expect(peekCachedProviderProfile('studio-c')).toBeUndefined();
});
