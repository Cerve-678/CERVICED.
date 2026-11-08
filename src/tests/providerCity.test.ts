import { cityFilterKeys, matchesCityFilter, placeForLocation } from '../utils/providerCity';

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
