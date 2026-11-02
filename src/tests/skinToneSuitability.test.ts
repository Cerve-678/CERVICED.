import { SKIN_TONES, matchesSkinTone } from '../constants/skinTones';
import { getProviderServiceFacets } from '../services/databaseService';

const mockIn = jest.fn();
const mockEq = jest.fn();
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => {
      const chain = {
        eq: (...args: unknown[]) => { mockEq(...args); return chain; },
        in: (...args: unknown[]) => mockIn(...args),
      };
      return chain;
    } }),
  },
}));

beforeEach(() => { mockIn.mockReset(); mockEq.mockReset(); });

it('does not claim suitability when a provider has not specified it', () => {
  for (const tone of SKIN_TONES) {
    expect(matchesSkinTone(null, tone)).toBe(false);
    expect(matchesSkinTone([], tone)).toBe(false);
    expect(matchesSkinTone(SKIN_TONES, tone)).toBe(true);
  }
  expect(matchesSkinTone(['Deep', 'Rich'], 'deep')).toBe(true);
  expect(matchesSkinTone(['Deep', 'Rich'], 'Fair')).toBe(false);
});

it('keeps each service\'s tones, price and audience together, per provider', async () => {
  mockIn.mockResolvedValue({ error: null, data: [
    { id: 's1', provider_id: 'one', price: 20, price_max: 35, audience: 'women', skin_tones_suitable: ['Deep'] },
    { id: 's2', provider_id: 'one', price: 50, price_max: null, audience: 'everyone', skin_tones_suitable: ['Deep', 'Rich'] },
    { id: 's3', provider_id: 'two', price: 10, price_max: null, audience: null, skin_tones_suitable: null },
  ] });
  const facets = await getProviderServiceFacets(['one', 'two']);
  expect(facets.services.get('one')).toEqual([
    { id: 's1', price: 20, priceMax: 35, audience: 'women', skinTones: ['Deep'] },
    { id: 's2', price: 50, priceMax: null, audience: 'everyone', skinTones: ['Deep', 'Rich'] },
  ]);
  expect(facets.services.get('two')).toEqual([
    { id: 's3', price: 10, priceMax: null, audience: null, skinTones: [] },
  ]);
  expect(facets.priceRanges.get('one')).toEqual({ min: 20, max: 50 });
  expect(mockEq).toHaveBeenCalledWith('is_active', true);
  expect(mockEq).toHaveBeenCalledWith('providers.has_gone_live', true);
  expect(mockEq).toHaveBeenCalledWith('providers.is_active', true);
});

it('returns empty facets without querying when no providers are displayed', async () => {
  const facets = await getProviderServiceFacets([]);
  expect(facets.services.size).toBe(0);
  expect(mockIn).not.toHaveBeenCalled();
});
