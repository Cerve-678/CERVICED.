import {
  candidateServices,
  hasServiceCriteria,
  priceRangeAcrossServices,
  serviceMatchesCriteria,
  type FilterableService,
} from '../utils/serviceFilterMatch';

const svc = (over: Partial<FilterableService> & { id: string }): FilterableService => ({
  price: 40, priceMax: null, audience: null, skinTones: [], ...over,
});

// One provider: a cheap men's trim and a dear women's braid.
const trim = svc({ id: 'trim', price: 20, audience: 'men' });
const braid = svc({ id: 'braid', price: 120, audience: 'women', skinTones: ['Deep'] });

it('needs ONE service to satisfy every filter, not each filter on a different service', () => {
  const cheapForWomen = { priceBucket: { min: 0, max: 30 }, audience: 'women' };
  expect([trim, braid].some(s => serviceMatchesCriteria(s, cheapForWomen))).toBe(false);
  expect(serviceMatchesCriteria(trim, { priceBucket: { min: 0, max: 30 }, audience: 'men' })).toBe(true);
  expect(serviceMatchesCriteria(braid, { audience: 'women', skinTone: 'deep' })).toBe(true);
  expect(serviceMatchesCriteria(braid, { audience: 'women', skinTone: 'Fair' })).toBe(false);
});

it('judges a "from £x to £y" service by overlap with the bucket', () => {
  const ranged = svc({ id: 'r', price: 25, priceMax: 70 });
  expect(serviceMatchesCriteria(ranged, { priceBucket: { min: 60, max: 100 } })).toBe(true);
  expect(serviceMatchesCriteria(ranged, { priceBucket: { min: 100, max: 9999 } })).toBe(false);
});

it('never treats an unpriced service as matching a price bucket', () => {
  expect(serviceMatchesCriteria(svc({ id: 'n', price: null }), { priceBucket: { min: 0, max: 30 } })).toBe(false);
});

it('an untagged service does not count for an audience', () => {
  expect(serviceMatchesCriteria(svc({ id: 'u' }), { audience: 'men' })).toBe(false);
});

it('with a typed query, judges only the services that matched it', () => {
  // Searching "braids": the cheap trim must not answer for the braid.
  const judged = candidateServices([trim, braid], new Set(['braid']));
  expect(judged).toEqual([braid]);
  expect(judged.some(s => serviceMatchesCriteria(s, { priceBucket: { min: 0, max: 30 } }))).toBe(false);
});

it('a provider matched by name alone is judged on their whole menu', () => {
  expect(candidateServices([trim, braid], undefined)).toEqual([trim, braid]);
  expect(candidateServices([trim, braid], new Set())).toEqual([trim, braid]);
});

it('ranges across only the services passed in, skipping unpriced ones', () => {
  expect(priceRangeAcrossServices([trim, svc({ id: 'r', price: 25, priceMax: 70 }), svc({ id: 'n', price: null })]))
    .toEqual({ min: 20, max: 70 });
  expect(priceRangeAcrossServices([])).toBeNull();
});

it('knows when no service-level filter is on', () => {
  expect(hasServiceCriteria({})).toBe(false);
  expect(hasServiceCriteria({ skinTone: 'Deep' })).toBe(true);
});
