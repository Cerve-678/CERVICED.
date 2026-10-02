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

it('combines explicit service tones per provider without losing prices or audiences', async () => {
  mockIn.mockResolvedValue({ error: null, data: [
    { provider_id: 'one', price: 20, price_max: 35, audience: 'women', skin_tones_suitable: ['Deep'] },
    { provider_id: 'one', price: 50, price_max: null, audience: 'everyone', skin_tones_suitable: ['Deep', 'Rich'] },
    { provider_id: 'two', price: 10, price_max: null, audience: null, skin_tones_suitable: null },
  ] });
  const facets = await getProviderServiceFacets(['one', 'two']);
  expect([...facets.skinTones.get('one')!]).toEqual(['Deep', 'Rich']);
  expect(facets.skinTones.has('two')).toBe(false);
  expect(facets.priceRanges.get('one')).toEqual({ min: 20, max: 50 });
  expect([...facets.audiences.get('one')!]).toEqual(['women', 'everyone']);
  expect(mockEq).toHaveBeenCalledWith('is_active', true);
  expect(mockEq).toHaveBeenCalledWith('providers.has_gone_live', true);
  expect(mockEq).toHaveBeenCalledWith('providers.is_active', true);
});

it('returns empty facets without querying when no providers are displayed', async () => {
  const facets = await getProviderServiceFacets([]);
  expect(facets.skinTones.size).toBe(0);
  expect(mockIn).not.toHaveBeenCalled();
});
