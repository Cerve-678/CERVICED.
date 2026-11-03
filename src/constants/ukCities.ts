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
  // Kent
  'Canterbury', 'Dartford', 'Gravesend', 'Chatham', 'Rochester', 'Ashford', 'Tunbridge Wells',
  'Tonbridge', 'Sevenoaks', 'Swanley', 'Sittingbourne', 'Faversham', 'Whitstable', 'Herne Bay',
  'Margate', 'Ramsgate', 'Broadstairs', 'Folkestone', 'Dover', 'Deal',
  // Around London and other large towns
  'Brentwood', 'Harlow', 'Grays', 'Guildford', 'Epsom', 'Redhill', 'Hemel Hempstead', 'Stevenage',
  'Hatfield', 'Eastbourne', 'Hastings', 'Hull', 'Bournemouth', 'Swindon', 'Huddersfield', 'Bedford',
  'Walsall', 'Dudley', 'Oldham', 'Warrington', 'Cheltenham',
  // More towns across the UK (2026-11-03)
  'Billericay', 'Wickford', 'Rayleigh', 'Canvey Island', 'Benfleet', 'Clacton-on-Sea', 'Braintree', 'Witham',
  'Loughton', 'Chigwell', 'Buckhurst Hill', 'Epping', 'Saffron Walden', 'Maldon', 'Harwich', 'Waltham Abbey',
  'Hythe', 'Tenterden', 'Westerham', 'Edenbridge', 'Paddock Wood', 'Snodland', 'West Malling', 'Sheerness',
  'Cranbrook', 'New Romney', 'Camberley', 'Farnham', 'Staines-upon-Thames', 'Weybridge', 'Walton-on-Thames', 'Esher',
  'Leatherhead', 'Dorking', 'Godalming', 'Caterham', 'Oxted', 'Reigate', 'Horley', "Bishop's Stortford",
  'Hertford', 'Ware', 'Hitchin', 'Letchworth', 'Harpenden', 'Borehamwood', 'Potters Bar', 'Cheshunt',
  'Hoddesdon', 'Welwyn Garden City', 'Berkhamsted', 'Tring', 'Rickmansworth', 'Bushey', 'Royston', 'Horsham',
  'Haywards Heath', 'Burgess Hill', 'Chichester', 'Bognor Regis', 'Littlehampton', 'Lewes', 'Uckfield', 'Crowborough',
  'East Grinstead', 'Shoreham-by-Sea', 'Hove', 'Bracknell', 'Maidenhead', 'Windsor', 'Wokingham', 'Newbury',
  'High Wycombe', 'Aylesbury', 'Amersham', 'Beaconsfield', 'Marlow', 'Buckingham', 'Dunstable', 'Leighton Buzzard',
  'Biggleswade', 'Ampthill', 'Winchester', 'Farnborough', 'Aldershot', 'Fareham', 'Eastleigh', 'Andover',
  'Havant', 'Gosport', 'Romsey', 'Petersfield', 'Alton', 'Salford', 'Wigan', 'Rochdale',
  'Bury', 'Altrincham', 'Ashton-under-Lyne', 'Sutton Coldfield', 'Halesowen', 'Stourbridge', 'Smethwick', 'Oldbury',
  'Wakefield', 'Halifax', 'Dewsbury', 'Keighley', 'Pontefract', 'St Helens', 'Birkenhead', 'Southport',
  'Bootle', 'Lancaster', 'Blackburn', 'Burnley', 'Chorley', 'Lincoln', 'Worcester', 'Hereford',
  'Chester', 'Carlisle', 'Durham', 'Shrewsbury', 'Telford', 'Stafford', 'Lichfield', 'Nuneaton',
  'Rugby', 'Leamington Spa', 'Stratford-upon-Avon', 'Kettering', 'Corby', 'Wellingborough', 'Mansfield', 'Chesterfield',
  'Barnsley', 'Grimsby', 'Scunthorpe', 'Harrogate', 'Darlington', 'Hartlepool', 'Stockton-on-Tees', 'Gateshead',
  'South Shields', 'Torquay', 'Truro', 'Taunton', 'Yeovil', 'Salisbury', 'Weymouth', 'Poole',
  'Kidderminster', 'Loughborough', 'Macclesfield', 'Crewe', 'Burton upon Trent', 'Newport', 'Wrexham', 'Bangor',
  'Inverness', 'Stirling', 'Perth', 'Paisley', 'Lisburn', 'Derry', 'Newry',
] as const;

export type UkCity = (typeof UK_CITIES)[number];
