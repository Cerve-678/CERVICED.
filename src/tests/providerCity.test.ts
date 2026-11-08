import {
  MAX_COVERED_AREAS,
  addCoveredArea,
  cityFilterKeys,
  coveredAreaLabel,
  matchesCityFilter,
  placeForLocation,
  suggestedCoverTown,
} from '../utils/providerCity';

// Search's City filter goes by where a provider says they're based in
// InfoReg (providers.location_text), which AreaPicker stores as an area and
// its town. These pin how an area is read up to its town.

const matches = (picked: string[], location: string | null, serviceLocations: string[] = []) =>
  matchesCityFilter(picked, cityFilterKeys(location, serviceLocations));

it('reads an area and its town the way AreaPicker writes them', () => {
  expect(placeForLocation('Shoreditch, London')).toEqual({ town: 'London', area: 'Shoreditch' });
  expect(placeForLocation('Chorlton, Manchester')).toEqual({ town: 'Manchester', area: 'Chorlton' });
});

it('places a bare area in the one town that has it', () => {
  expect(placeForLocation('Shoreditch')).toEqual({ town: 'London', area: 'Shoreditch' });
  expect(placeForLocation('stoke newington')).toEqual({ town: 'London', area: 'stoke newington' });
});

it("won't guess the town for an area name more than one town uses", () => {
  expect(placeForLocation('City Centre')).toBeNull();
  expect(placeForLocation('City Centre, Leeds')).toEqual({ town: 'Leeds', area: 'City Centre' });
});

it('reads a town on its own, and ignores anything after it it does not know', () => {
  expect(placeForLocation('London')).toEqual({ town: 'London', area: null });
  expect(placeForLocation('Hackney, London, UK')).toEqual({ town: 'London', area: 'Hackney' });
  expect(placeForLocation('Somewhere unlisted')).toBeNull();
  expect(placeForLocation(null)).toBeNull();
});

it('matches a provider based in an area when the client picks its town', () => {
  expect(matches(['London'], 'Shoreditch, London')).toBe(true);
  expect(matches(['London'], 'Shoreditch')).toBe(true);
  expect(matches(['Manchester'], 'Shoreditch, London')).toBe(false);
  expect(matches(['Leeds', 'London'], 'Shoreditch')).toBe(true);
});

it('matches an area pick only to that area, not to a provider who gave the town alone', () => {
  expect(matches(['Shoreditch, London'], 'Shoreditch')).toBe(true);
  expect(matches(['Shoreditch, London'], 'shoreditch,london')).toBe(true);
  expect(matches(['Shoreditch, London'], 'Hackney, London')).toBe(false);
  expect(matches(['Shoreditch, London'], 'London')).toBe(false);
});

it('still matches cities a provider saved before the cities card was removed', () => {
  expect(matches(['Leeds'], 'Shoreditch, London', ['Leeds', 'Bradford'])).toBe(true);
  expect(matches(['Leeds'], null, ['Leeds'])).toBe(true);
});

it('never matches a provider with no location and no saved cities', () => {
  expect(matches(['London'], null)).toBe(false);
  expect(matches(['London'], '')).toBe(false);
});

it('matches free text a client typed as "Other" when the provider wrote the same thing', () => {
  expect(matches(['Little Snoring'], 'Little Snoring')).toBe(true);
});

// "Areas you cover" (providers.service_locations): towns and areas a mobile
// provider travels to, written by the same AreaPicker.

describe('areas a provider covers', () => {
  it('matches a covered area to that area and to its town', () => {
    expect(matches(['Shoreditch, London'], null, ['Shoreditch, London'])).toBe(true);
    expect(matches(['London'], null, ['Shoreditch, London'])).toBe(true);
    expect(matches(['London'], 'Chorlton, Manchester', ['Hackney, London'])).toBe(true);
    expect(matches(['Hackney, London'], null, ['Shoreditch, London'])).toBe(false);
    expect(matches(['Manchester'], null, ['Shoreditch, London'])).toBe(false);
  });

  it('matches a whole covered town to the town and to every area in it', () => {
    expect(matches(['London'], null, ['London'])).toBe(true);
    expect(matches(['Shoreditch, London'], null, ['London'])).toBe(true);
    expect(matches(['Chorlton, Manchester'], null, ['London'])).toBe(false);
  });

  it('still never matches an area pick to a provider merely based in the town', () => {
    expect(matches(['Shoreditch, London'], 'London', [])).toBe(false);
  });

  it('reads a covered area typed without its town', () => {
    expect(matches(['London'], null, ['Shoreditch'])).toBe(true);
  });
});

describe('adding a covered place', () => {
  it('adds a new place at the end, trimmed', () => {
    expect(addCoveredArea(['London'], '  Chorlton,  Manchester ')).toEqual({
      outcome: 'added',
      next: ['London', 'Chorlton, Manchester'],
    });
  });

  it('refuses a place already on the list, however it is written', () => {
    expect(addCoveredArea(['Shoreditch, London'], 'shoreditch,london').outcome).toBe('duplicate');
  });

  it('refuses a blank answer', () => {
    expect(addCoveredArea([], '   ').outcome).toBe('empty');
  });

  it(`stops at ${MAX_COVERED_AREAS} places and leaves the list as it was`, () => {
    const full = Array.from({ length: MAX_COVERED_AREAS }, (_, i) => `Place ${i}`);
    const result = addCoveredArea(full, 'Leeds');
    expect(result.outcome).toBe('full');
    expect(result.next).toBe(full);
  });
});

it('labels a whole town as all of it, and anything else as saved', () => {
  expect(coveredAreaLabel('London')).toBe('All of London');
  expect(coveredAreaLabel('Shoreditch, London')).toBe('Shoreditch, London');
  expect(coveredAreaLabel('Little Snoring')).toBe('Little Snoring');
});

it('suggests the town a provider is based in until it is on the list', () => {
  expect(suggestedCoverTown('Shoreditch, London', [])).toBe('London');
  expect(suggestedCoverTown('Shoreditch, London', ['london'])).toBeNull();
  expect(suggestedCoverTown('Shoreditch, London', ['Hackney, London'])).toBe('London');
  expect(suggestedCoverTown('', [])).toBeNull();
  expect(suggestedCoverTown('Somewhere unlisted', [])).toBeNull();
});
