import { getProviderServiceFacets } from '../services/databaseService';

// The services read is built first, then provider_specialties, so the two
// .in() calls resolve in that order.
const mockIn = jest.fn();
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => {
      const chain = {
        eq: () => chain,
        in: (...args: unknown[]) => mockIn(...args),
      };
      return chain;
    } }),
  },
}));

beforeEach(() => { mockIn.mockReset(); });

it('gives the Search card only the business specialities, never service tags or names', async () => {
  mockIn
    .mockResolvedValueOnce({ error: null, data: [
      { id: 's1', provider_id: 'one', price: 40, name: 'Knotless braids', tags: ['protective'], technique_tags: ['feed-in'] },
    ] })
    .mockResolvedValueOnce({ error: null, data: [
      { provider_id: 'one', specialty: 'Knotless braids' },
      { provider_id: 'one', specialty: ' Silk press ' },
      { provider_id: 'one', specialty: 'silk press' },
      { provider_id: 'two', specialty: '' },
    ] });

  const facets = await getProviderServiceFacets(['one', 'two']);

  expect(facets.specialities.get('one')).toEqual(['Knotless braids', 'Silk press']);
  expect(facets.specialities.has('two')).toBe(false);
  // The filter still matches on tags and offers them as options.
  expect(facets.specialityLabels.get('one')).toEqual(new Set(['protective', 'feed-in', 'Knotless braids', 'Silk press', 'silk press']));
});
