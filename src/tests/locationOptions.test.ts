import { UK_CITIES } from '../constants/ukCities';
import { CITY_AREAS, COUNTY_TOWNS, getCityAreaData, searchPlaces } from '../data/cityAreas';

// Provider signup offers UK_CITIES for "where you work" and CITY_AREAS for
// "where you're based"; a town in one and not the other can be covered but
// not lived in (or the reverse), and search can't widen it to its areas.
it('offers the same towns for coverage and for where a provider is based', () => {
  const structured = new Set(CITY_AREAS.map(c => c.city));
  expect(UK_CITIES.filter(city => !structured.has(city))).toEqual([]);
  expect([...structured].filter(city => !(UK_CITIES as readonly string[]).includes(city))).toEqual([]);
});

it('lists every London borough', () => {
  const london = getCityAreaData('London')!.regions.flatMap(r => r.areas);
  for (const borough of ['Barking and Dagenham', 'Barnet', 'Bexley', 'Brent', 'Bromley', 'Camden', 'Croydon',
    'Ealing', 'Enfield', 'Greenwich', 'Hackney', 'Hammersmith and Fulham', 'Haringey', 'Harrow', 'Havering',
    'Hillingdon', 'Hounslow', 'Islington', 'Kensington and Chelsea', 'Kingston upon Thames', 'Lambeth',
    'Lewisham', 'Merton', 'Newham', 'Redbridge', 'Richmond upon Thames', 'Southwark', 'Sutton',
    'Tower Hamlets', 'Waltham Forest', 'Wandsworth', 'Westminster']) {
    expect(london).toContain(borough);
  }
});

it('only groups towns a provider can actually pick into a county', () => {
  for (const towns of Object.values(COUNTY_TOWNS)) {
    for (const town of towns) expect(getCityAreaData(town)).toBeDefined();
  }
});

it('never lists an area twice in one town', () => {
  for (const { city, regions } of CITY_AREAS) {
    const areas = regions.flatMap(r => r.areas);
    expect({ city, dupes: areas.filter((a, i) => areas.indexOf(a) !== i) }).toEqual({ city, dupes: [] });
  }
});

it('finds a neighbourhood by name without knowing its region', () => {
  expect(searchPlaces('stoke newington')).toEqual([{ kind: 'area', name: 'Stoke Newington', town: 'London' }]);
});

it('offers a county as a place of its own', () => {
  expect(searchPlaces('kent')[0]).toEqual({ kind: 'county', name: 'Kent' });
});

it('puts names starting with the text before names containing it', () => {
  const names = searchPlaces('ham').map(m => m.name);
  const firstContaining = names.findIndex(n => !n.toLowerCase().startsWith('ham'));
  expect(names.slice(firstContaining).every(n => !n.toLowerCase().startsWith('ham'))).toBe(true);
});

it('finds nothing for an empty search', () => {
  expect(searchPlaces('   ')).toEqual([]);
});

it('finds the newer Essex towns and counties around London', () => {
  for (const town of ['Loughton', 'Billericay', 'Clacton-on-Sea', 'Epping', 'Chigwell']) {
    expect(searchPlaces(town)[0]).toEqual({ kind: 'town', name: town });
  }
  for (const county of ['Berkshire', 'Buckinghamshire', 'Hampshire', 'Greater Manchester']) {
    expect(searchPlaces(county)[0]).toEqual({ kind: 'county', name: county });
  }
});

it('keeps two different places with the same name apart', () => {
  // Loughton in Essex is a town; Loughton in Milton Keynes is one of its areas.
  const loughtons = searchPlaces('Loughton');
  expect(loughtons).toContainEqual({ kind: 'town', name: 'Loughton' });
  expect(loughtons).toContainEqual({ kind: 'area', name: 'Loughton', town: 'Milton Keynes' });
});

it('never leaves a stray backslash in a place name', () => {
  for (const { city, regions } of CITY_AREAS) {
    expect(city).not.toContain('\\');
    for (const { areas } of regions) for (const area of areas) expect(area).not.toContain('\\');
  }
});

it('lists the Hackney neighbourhoods between Dalston and Shoreditch', () => {
  expect(searchPlaces('haggerston')).toEqual([{ kind: 'area', name: 'Haggerston', town: 'London' }]);
  expect(searchPlaces('hoxton')).toEqual([{ kind: 'area', name: 'Hoxton', town: 'London' }]);
  expect(searchPlaces('london fields')).toContainEqual({ kind: 'area', name: 'London Fields', town: 'London' });
});
