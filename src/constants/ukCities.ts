// Major UK cities/towns offered as service-coverage options — provider
// signup's "where you work" question (RegistrationContext.serviceLocations)
// and the client-side Search "City" filter both draw from this single list,
// so a city a provider can select is always one a client can filter by.
//
// Deliberately flat and UK-wide (not the London/Manchester/Birmingham ->
// region -> area structure in src/data/cityAreas.ts, which answers a
// different question — a single geocodable business address — not "which
// cities do you cover").
export const UK_CITIES = [
  'London', 'Birmingham', 'Manchester', 'Leeds', 'Glasgow', 'Sheffield',
  'Liverpool', 'Bristol', 'Newcastle upon Tyne', 'Nottingham', 'Leicester',
  'Coventry', 'Bradford', 'Belfast', 'Edinburgh', 'Cardiff', 'Stoke-on-Trent',
  'Wolverhampton', 'Plymouth', 'Southampton', 'Reading', 'Derby',
  'Luton', 'Milton Keynes', 'Northampton', 'Norwich', 'Portsmouth',
  'Preston', 'Sunderland', 'Swansea', 'Southend-on-Sea', 'Aberdeen',
  'Middlesbrough', 'Blackpool', 'Bolton', 'Ipswich', 'York',
  'West Bromwich', 'Peterborough', 'Stockport', 'Brighton', 'Slough',
  'Gloucester', 'Watford', 'Rotherham', 'Cambridge', 'Exeter',
  'Oxford', 'Dundee', 'Basildon', 'Solihull', 'Chelmsford',
  'Doncaster', 'Basingstoke', 'Colchester', 'Crawley', 'St Albans',
  'Woking', 'Maidstone', 'Bath', 'Worthing', 'Gillingham',
] as const;

export type UkCity = (typeof UK_CITIES)[number];
