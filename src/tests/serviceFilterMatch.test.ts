import {
  hasServiceCriteria,
  pickMatchingService,
  priceRangeAcrossServices,
  serviceMatchesCriteria,
  serviceRange,
  type FilterableService,
} from '../utils/serviceFilterMatch';

const svc = (over: Partial<FilterableService> & { id: string }): FilterableService => ({
  price: 50, priceMax: null, audience: null, ...over,
});

const under60 = { min: 25, max: 60 };

describe('one service must satisfy every filter', () => {
  // The exact shape of the bug: this provider passes each filter, but on a
  // DIFFERENT service each time, so no single service is what the client asked for.
  const provider = [
    svc({ id: 'cheap-women', price: 30, audience: 'women' }),
    svc({ id: 'pricey-men', price: 120, audience: 'men' }),
  ];

  it('does not match a provider whose cheap service and men\'s service are different services', () => {
    expect(pickMatchingService(provider, { priceBucket: under60, audience: 'men' })).toBeNull();
  });

  it('matches when one service is both cheap and for men', () => {
    const withBoth = [...provider, svc({ id: 'cheap-men', price: 45, audience: 'men' })];
    expect(pickMatchingService(withBoth, { priceBucket: under60, audience: 'men' })?.id).toBe('cheap-men');
  });

  it('requires the SAME service to have a free slot, not any of the provider\'s services', () => {
    const cheapMen = svc({ id: 'cheap-men', price: 45, audience: 'men' });
    const otherMen = svc({ id: 'other-men', price: 200, audience: 'men' });
    const criteria = {
      priceBucket: under60,
      audience: 'men',
      // Only the expensive service has a slot this week.
      availableServiceIds: new Set(['other-men']),
    };
    expect(pickMatchingService([cheapMen, otherMen], criteria)).toBeNull();
    expect(pickMatchingService([cheapMen, otherMen], {
      ...criteria, availableServiceIds: new Set(['cheap-men']),
    })?.id).toBe('cheap-men');
  });
});

describe('serviceMatchesCriteria', () => {
  it('matches everything when no criterion is set', () => {
    expect(serviceMatchesCriteria(svc({ id: 'a' }), {})).toBe(true);
  });

  it('judges price on the service\'s own range, overlapping the bucket', () => {
    // "from £40 to £90" overlaps £25-£60 at the bottom, so it is in that bucket.
    expect(serviceMatchesCriteria(svc({ id: 'a', price: 40, priceMax: 90 }), { priceBucket: under60 })).toBe(true);
    expect(serviceMatchesCriteria(svc({ id: 'a', price: 61 }), { priceBucket: under60 })).toBe(false);
    expect(serviceMatchesCriteria(svc({ id: 'a', price: 60 }), { priceBucket: under60 })).toBe(true);
  });

  it('needs the exact audience tag, and an untagged service does not match', () => {
    expect(serviceMatchesCriteria(svc({ id: 'a', audience: 'men' }), { audience: 'men' })).toBe(true);
    expect(serviceMatchesCriteria(svc({ id: 'a', audience: 'women' }), { audience: 'men' })).toBe(false);
    expect(serviceMatchesCriteria(svc({ id: 'a', audience: null }), { audience: 'men' })).toBe(false);
  });

  it('treats a service missing from the available set as not available', () => {
    expect(serviceMatchesCriteria(svc({ id: 'a' }), { availableServiceIds: new Set() })).toBe(false);
  });
});

describe('pickMatchingService', () => {
  it('shows the cheapest matching service', () => {
    const services = [svc({ id: 'b', price: 55 }), svc({ id: 'a', price: 35 }), svc({ id: 'c', price: 45 })];
    expect(pickMatchingService(services, { priceBucket: under60 })?.id).toBe('a');
  });

  it('breaks price ties on id so the choice is stable', () => {
    const services = [svc({ id: 'z', price: 40 }), svc({ id: 'm', price: 40 })];
    expect(pickMatchingService(services, {})?.id).toBe('m');
    expect(pickMatchingService([...services].reverse(), {})?.id).toBe('m');
  });

  it('returns null for a provider with no services', () => {
    expect(pickMatchingService([], {})).toBeNull();
  });
});

describe('hasServiceCriteria', () => {
  it('is false with nothing set, true with any one filter', () => {
    expect(hasServiceCriteria({})).toBe(false);
    expect(hasServiceCriteria({ priceBucket: under60 })).toBe(true);
    expect(hasServiceCriteria({ audience: 'kids' })).toBe(true);
    expect(hasServiceCriteria({ availableServiceIds: new Set() })).toBe(true);
  });
});

describe('price ranges', () => {
  it('a fixed price is a range of one', () => {
    expect(serviceRange({ price: 40, priceMax: null })).toEqual({ min: 40, max: 40 });
  });

  it('spans the lowest to the highest across services', () => {
    expect(priceRangeAcrossServices([
      { price: 30, priceMax: null },
      { price: 45, priceMax: 90 },
    ])).toEqual({ min: 30, max: 90 });
  });

  it('is null when there are no services, never 0', () => {
    expect(priceRangeAcrossServices([])).toBeNull();
  });
});
