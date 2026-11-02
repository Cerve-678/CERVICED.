import { UK_CITIES } from '../constants/ukCities';
import { CITY_AREAS, COUNTY_TOWNS, getCityAreaData } from '../data/cityAreas';

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
