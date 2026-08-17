// Structured city -> compass region -> named area data for the location
// picker. Only cities listed here get the region/area picker; any other
// city keeps the plain free-text location field.
export type CityAreaRegion = {
  region: string;
  areas: string[];
};

export type CityAreaData = {
  city: string;
  regions: CityAreaRegion[];
};

export const CITY_AREAS: CityAreaData[] = [
  {
    city: 'London',
    regions: [
      {
        region: 'North London',
        areas: ['Camden', 'Islington', 'Hackney', 'Haringey', 'Enfield', 'Barnet'],
      },
      {
        region: 'South London',
        areas: ['Croydon', 'Lambeth', 'Southwark', 'Wandsworth', 'Lewisham', 'Bromley'],
      },
      {
        region: 'East London',
        areas: ['Tower Hamlets', 'Newham', 'Waltham Forest', 'Redbridge', 'Barking and Dagenham'],
      },
      {
        region: 'West London',
        areas: ['Hammersmith and Fulham', 'Ealing', 'Hounslow', 'Hillingdon', 'Brent'],
      },
      {
        region: 'Central London',
        areas: ['Westminster', 'City of London', 'Kensington and Chelsea', 'Soho', 'Covent Garden'],
      },
    ],
  },
  {
    city: 'Manchester',
    regions: [
      {
        region: 'North Manchester',
        areas: ['Cheetham Hill', 'Crumpsall', 'Blackley', 'Harpurhey'],
      },
      {
        region: 'South Manchester',
        areas: ['Didsbury', 'Chorlton', 'Withington', 'Rusholme', 'Fallowfield'],
      },
      {
        region: 'East Manchester',
        areas: ['Ancoats', 'Beswick', 'Openshaw', 'Gorton'],
      },
      {
        region: 'West Manchester',
        areas: ['Old Trafford', 'Salford Quays', 'Trafford'],
      },
      {
        region: 'Central Manchester',
        areas: ['City Centre', 'Northern Quarter', 'Deansgate'],
      },
    ],
  },
  {
    city: 'Birmingham',
    regions: [
      {
        region: 'North Birmingham',
        areas: ['Erdington', 'Sutton Coldfield', 'Perry Barr', 'Kingstanding'],
      },
      {
        region: 'South Birmingham',
        areas: ['Kings Heath', 'Moseley', 'Selly Oak', 'Northfield'],
      },
      {
        region: 'East Birmingham',
        areas: ['Small Heath', 'Yardley', 'Hodge Hill', 'Bordesley Green'],
      },
      {
        region: 'West Birmingham',
        areas: ['Edgbaston', 'Harborne', 'Quinton', 'Ladywood'],
      },
      {
        region: 'Central Birmingham',
        areas: ['City Centre', 'Digbeth', 'Jewellery Quarter'],
      },
    ],
  },
];

export const CITY_AREA_NAMES = CITY_AREAS.map(c => c.city);

export const getCityAreaData = (city: string): CityAreaData | undefined =>
  CITY_AREAS.find(c => c.city.toLowerCase() === city.trim().toLowerCase());
