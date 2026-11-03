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
        areas: ['Archway', 'Barnet', 'Barnsbury', 'Bounds Green', 'Camden', 'Camden Town', 'Canonbury', 'Crouch End', 'Dalston', 'De Beauvoir', 'East Finchley', 'Edmonton', 'Enfield', 'Finchley', 'Finsbury Park', 'Golders Green', 'Hackney', 'Hampstead', 'Haringey', 'Harringay', 'Highbury', 'Highgate', 'Holloway', 'Hornsey', 'Islington', 'Kentish Town', 'Muswell Hill', 'Palmers Green', 'Southgate', 'Stamford Hill', 'Stoke Newington', 'Tottenham', 'Turnpike Lane', 'Wood Green'],
      },
      {
        region: 'South London',
        areas: ['Balham', 'Battersea', 'Beckenham', 'Bermondsey', 'Bexley', 'Bexleyheath', 'Blackheath', 'Brixton', 'Bromley', 'Camberwell', 'Catford', 'Clapham', 'Croydon', 'Crystal Palace', 'Deptford', 'Dulwich', 'Elephant and Castle', 'Eltham', 'Forest Hill', 'Greenwich', 'Herne Hill', 'Kennington', 'Kingston upon Thames', 'Lambeth', 'Lewisham', 'Merton', 'Mitcham', 'Morden', 'New Cross', 'Norbury', 'Nunhead', 'Orpington', 'Peckham', 'Penge', 'Purley', 'Putney', 'Sidcup', 'Southwark', 'Streatham', 'Surbiton', 'Sutton', 'Sydenham', 'Thamesmead', 'Thornton Heath', 'Tooting', 'Vauxhall', 'Walworth', 'Wandsworth', 'Wimbledon', 'Woolwich'],
      },
      {
        region: 'East London',
        areas: ['Barking', 'Barking and Dagenham', 'Bethnal Green', 'Bow', 'Canary Wharf', 'Canning Town', 'Chingford', 'Clapton', 'Dagenham', 'East Ham', 'Forest Gate', 'Hackney Wick', 'Havering', 'Homerton', 'Hornchurch', 'Ilford', 'Leyton', 'Leytonstone', 'Mile End', 'Newham', 'Plaistow', 'Poplar', 'Redbridge', 'Romford', 'Shoreditch', 'Stepney', 'Stratford', 'Tower Hamlets', 'Upton Park', 'Waltham Forest', 'Walthamstow', 'Wanstead', 'Whitechapel', 'Woodford'],
      },
      {
        region: 'West London',
        areas: ['Acton', 'Brent', 'Brentford', 'Chiswick', 'Ealing', 'Ealing Broadway', 'Feltham', 'Fulham', 'Greenford', 'Hammersmith', 'Hammersmith and Fulham', 'Hanwell', 'Harlesden', 'Harrow', 'Hayes', 'Hillingdon', 'Hounslow', 'Isleworth', 'Kilburn', 'Northolt', 'Notting Hill', "Queen's Park", 'Richmond upon Thames', 'Ruislip', "Shepherd's Bush", 'Southall', 'Stanmore', 'Twickenham', 'Uxbridge', 'Wembley', 'Willesden'],
      },
      {
        region: 'Central London',
        areas: ['Barbican', 'Bloomsbury', 'Chelsea', 'City of London', 'Clerkenwell', 'Covent Garden', 'Fitzrovia', 'Holborn', 'Kensington', 'Kensington and Chelsea', "King's Cross", 'Knightsbridge', 'Marylebone', 'Mayfair', 'Paddington', 'Pimlico', 'Soho', "St John's Wood", 'Victoria', 'Waterloo', 'Westminster'],
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
        areas: ['Erdington', 'Perry Barr', 'Kingstanding'],
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
  {
    city: 'Leeds',
    regions: [
      {
        region: 'North Leeds',
        areas: ['Chapel Allerton', 'Headingley', 'Roundhay', 'Moortown', 'Alwoodley'],
      },
      {
        region: 'South Leeds',
        areas: ['Beeston', 'Hunslet', 'Middleton', 'Morley'],
      },
      {
        region: 'East Leeds',
        areas: ['Harehills', 'Osmondthorpe', 'Halton', 'Whitkirk'],
      },
      {
        region: 'West Leeds',
        areas: ['Armley', 'Bramley', 'Pudsey', 'Kirkstall'],
      },
      {
        region: 'Central Leeds',
        areas: ['City Centre', 'Woodhouse', 'Little London'],
      },
    ],
  },
  {
    city: 'Glasgow',
    regions: [
      {
        region: 'North Glasgow',
        areas: ['Maryhill', 'Springburn', 'Possilpark', 'Bishopbriggs'],
      },
      {
        region: 'South Glasgow',
        areas: ['Govan', 'Pollokshields', 'Shawlands', 'Castlemilk'],
      },
      {
        region: 'East Glasgow',
        areas: ['Dennistoun', 'Shettleston', 'Baillieston', 'Parkhead'],
      },
      {
        region: 'West Glasgow',
        areas: ['Partick', 'Hillhead', 'Anniesland', 'Whiteinch'],
      },
      {
        region: 'Central Glasgow',
        areas: ['City Centre', 'Merchant City', 'Finnieston'],
      },
    ],
  },
  {
    city: 'Sheffield',
    regions: [
      {
        region: 'North Sheffield',
        areas: ['Hillsborough', 'Chapeltown', 'Ecclesfield', 'Firth Park'],
      },
      {
        region: 'South Sheffield',
        areas: ['Meadowhead', 'Woodseats', 'Norton', 'Gleadless'],
      },
      {
        region: 'East Sheffield',
        areas: ['Darnall', 'Attercliffe', 'Handsworth', 'Tinsley'],
      },
      {
        region: 'West Sheffield',
        areas: ['Broomhill', 'Crookes', 'Ecclesall', 'Walkley'],
      },
      {
        region: 'Central Sheffield',
        areas: ['City Centre', 'Kelham Island', 'Sharrow'],
      },
    ],
  },
  {
    city: 'Liverpool',
    regions: [
      {
        region: 'North Liverpool',
        areas: ['Anfield', 'Everton', 'Walton'],
      },
      {
        region: 'South Liverpool',
        areas: ['Aigburth', 'Allerton', 'Woolton', 'Garston'],
      },
      {
        region: 'East Liverpool',
        areas: ['Wavertree', 'Old Swan', 'Knotty Ash', 'Childwall'],
      },
      {
        region: 'Central Liverpool',
        areas: ['City Centre', 'Baltic Triangle', 'Toxteth', 'Kensington'],
      },
    ],
  },
  {
    city: 'Bristol',
    regions: [
      {
        region: 'North Bristol',
        areas: ['Southmead', 'Horfield', 'Filton', 'Henleaze'],
      },
      {
        region: 'South Bristol',
        areas: ['Bedminster', 'Knowle', 'Hartcliffe', 'Windmill Hill'],
      },
      {
        region: 'East Bristol',
        areas: ['Easton', 'St George', 'Fishponds', 'Kingswood'],
      },
      {
        region: 'West Bristol',
        areas: ['Clifton', 'Westbury-on-Trym', 'Shirehampton'],
      },
      {
        region: 'Central Bristol',
        areas: ['City Centre', 'Redcliffe', 'St Pauls', 'Montpelier'],
      },
    ],
  },
  {
    city: 'Newcastle upon Tyne',
    regions: [
      {
        region: 'North Newcastle',
        areas: ['Gosforth', 'Kenton', 'Fawdon', 'Kingston Park'],
      },
      {
        region: 'West Newcastle',
        areas: ['Fenham', 'Benwell', 'Elswick', 'Denton'],
      },
      {
        region: 'East Newcastle',
        areas: ['Heaton', 'Byker', 'Walker', 'Jesmond'],
      },
      {
        region: 'Central Newcastle',
        areas: ['City Centre', 'Ouseburn', 'Sandyford'],
      },
    ],
  },
  {
    city: 'Nottingham',
    regions: [
      {
        region: 'North Nottingham',
        areas: ['Bulwell', 'Basford', 'Bestwood', 'Hyson Green'],
      },
      {
        region: 'South Nottingham',
        areas: ['West Bridgford', 'Wilford', 'Clifton'],
      },
      {
        region: 'East Nottingham',
        areas: ['Sneinton', 'Carlton', "St Ann's"],
      },
      {
        region: 'West Nottingham',
        areas: ['Wollaton', 'Lenton', 'Radford', 'Beeston'],
      },
      {
        region: 'Central Nottingham',
        areas: ['City Centre', 'Lace Market', 'The Meadows'],
      },
    ],
  },
  {
    city: 'Leicester',
    regions: [
      {
        region: 'North Leicester',
        areas: ['Belgrave', 'Rushey Mead', 'Beaumont Leys'],
      },
      {
        region: 'South Leicester',
        areas: ['Aylestone', 'Knighton', 'Clarendon Park'],
      },
      {
        region: 'East Leicester',
        areas: ['Evington', 'Highfields', 'Spinney Hills'],
      },
      {
        region: 'West Leicester',
        areas: ['Braunstone', 'Fosse', 'New Parks'],
      },
      {
        region: 'Central Leicester',
        areas: ['City Centre', 'Westcotes', 'Newarke'],
      },
    ],
  },
  {
    city: 'Coventry',
    regions: [
      {
        region: 'North Coventry',
        areas: ['Radford', 'Foleshill', 'Longford'],
      },
      {
        region: 'South Coventry',
        areas: ['Earlsdon', 'Cheylesmore', 'Styvechale'],
      },
      {
        region: 'East Coventry',
        areas: ['Wyken', 'Walsgrave', 'Binley'],
      },
      {
        region: 'West Coventry',
        areas: ['Chapelfields', 'Tile Hill', 'Coundon'],
      },
      {
        region: 'Central Coventry',
        areas: ['City Centre', 'Hillfields'],
      },
    ],
  },
  {
    city: 'Bradford',
    regions: [
      {
        region: 'North Bradford',
        areas: ['Eccleshill', 'Idle', 'Frizinghall'],
      },
      {
        region: 'South Bradford',
        areas: ['Wibsey', 'Buttershaw', 'Odsal'],
      },
      {
        region: 'East Bradford',
        areas: ['Bowling', 'Undercliffe', 'Laisterdyke'],
      },
      {
        region: 'West Bradford',
        areas: ['Manningham', 'Heaton', 'Girlington'],
      },
      {
        region: 'Central Bradford',
        areas: ['City Centre', 'Little Germany'],
      },
    ],
  },
  {
    city: 'Belfast',
    regions: [
      {
        region: 'North Belfast',
        areas: ['Ardoyne', 'Cliftonville', 'Shore Road'],
      },
      {
        region: 'South Belfast',
        areas: ['Malone', 'Stranmillis', 'Ormeau'],
      },
      {
        region: 'East Belfast',
        areas: ['Ballyhackamore', 'Sydenham', 'Cregagh'],
      },
      {
        region: 'West Belfast',
        areas: ['Falls', 'Andersonstown', 'Shankill'],
      },
      {
        region: 'Central Belfast',
        areas: ['City Centre', 'Cathedral Quarter', 'Titanic Quarter'],
      },
    ],
  },
  {
    city: 'Edinburgh',
    regions: [
      {
        region: 'North Edinburgh',
        areas: ['Leith', 'Trinity', 'Granton', 'Newhaven'],
      },
      {
        region: 'South Edinburgh',
        areas: ['Morningside', 'Newington', 'Marchmont', 'Bruntsfield'],
      },
      {
        region: 'East Edinburgh',
        areas: ['Portobello', 'Duddingston', 'Craigmillar'],
      },
      {
        region: 'West Edinburgh',
        areas: ['Corstorphine', 'Murrayfield', 'Stockbridge'],
      },
      {
        region: 'Central Edinburgh',
        areas: ['Old Town', 'New Town', 'Tollcross'],
      },
    ],
  },
  {
    city: 'Cardiff',
    regions: [
      {
        region: 'North Cardiff',
        areas: ['Whitchurch', 'Rhiwbina', 'Llanishen'],
      },
      {
        region: 'South Cardiff',
        areas: ['Grangetown', 'Butetown', 'Cardiff Bay'],
      },
      {
        region: 'East Cardiff',
        areas: ['Roath', 'Splott', 'Pentwyn'],
      },
      {
        region: 'West Cardiff',
        areas: ['Canton', 'Ely', 'Fairwater'],
      },
      {
        region: 'Central Cardiff',
        areas: ['City Centre', 'Cathays', 'Adamsdown'],
      },
    ],
  },
  {
    city: 'Stoke-on-Trent',
    regions: [
      {
        region: 'North Stoke',
        areas: ['Tunstall', 'Burslem', 'Chell'],
      },
      {
        region: 'South Stoke',
        areas: ['Longton', 'Trentham', 'Meir'],
      },
      {
        region: 'Central Stoke',
        areas: ['Hanley', 'Fenton', 'Stoke Town'],
      },
    ],
  },
  {
    city: 'Wolverhampton',
    regions: [
      {
        region: 'North Wolverhampton',
        areas: ['Bushbury', 'Fallings Park', 'Oxley'],
      },
      {
        region: 'South Wolverhampton',
        areas: ['Penn', 'Merry Hill', 'Blakenhall'],
      },
      {
        region: 'East Wolverhampton',
        areas: ['Wednesfield', 'Heath Town'],
      },
      {
        region: 'Central Wolverhampton',
        areas: ['City Centre', 'Whitmore Reans'],
      },
    ],
  },
  {
    city: 'Plymouth',
    regions: [
      {
        region: 'North Plymouth',
        areas: ['Crownhill', 'Southway', 'Manadon'],
      },
      {
        region: 'East Plymouth',
        areas: ['Plympton', 'Plymstock', 'Chaddlewood'],
      },
      {
        region: 'West Plymouth',
        areas: ['Devonport', 'Stoke', 'Keyham'],
      },
      {
        region: 'Central Plymouth',
        areas: ['City Centre', 'The Barbican', 'Mutley'],
      },
    ],
  },
  {
    city: 'Southampton',
    regions: [
      {
        region: 'North Southampton',
        areas: ['Bassett', 'Swaythling', 'Highfield'],
      },
      {
        region: 'South Southampton',
        areas: ['Woolston', 'Weston', 'Sholing'],
      },
      {
        region: 'Central Southampton',
        areas: ['City Centre', 'Portswood', 'St Denys'],
      },
      {
        region: 'West Southampton',
        areas: ['Shirley', 'Millbrook', 'Redbridge'],
      },
    ],
  },
  {
    city: 'Reading',
    regions: [
      {
        region: 'North Reading',
        areas: ['Caversham', 'Emmer Green'],
      },
      {
        region: 'South Reading',
        areas: ['Whitley', 'Shinfield Road'],
      },
      {
        region: 'East Reading',
        areas: ['Woodley', 'Earley'],
      },
      {
        region: 'West Reading',
        areas: ['Tilehurst', 'Southcote'],
      },
      {
        region: 'Central Reading',
        areas: ['Town Centre', 'Katesgrove'],
      },
    ],
  },
  {
    city: 'Derby',
    regions: [
      {
        region: 'North Derby',
        areas: ['Allestree', 'Darley Abbey', 'Chaddesden'],
      },
      {
        region: 'South Derby',
        areas: ['Alvaston', 'Sinfin', 'Boulton'],
      },
      {
        region: 'Central Derby',
        areas: ['City Centre', 'Normanton', 'Little Chester'],
      },
    ],
  },
  {
    city: 'Luton',
    regions: [
      {
        region: 'North Luton',
        areas: ['Bramingham', 'Icknield', 'Limbury'],
      },
      {
        region: 'South Luton',
        areas: ['Stopsley', 'Round Green'],
      },
      {
        region: 'Central Luton',
        areas: ['Town Centre', 'High Town', 'Bury Park'],
      },
    ],
  },
  {
    city: 'Milton Keynes',
    regions: [
      {
        region: 'Central Milton Keynes',
        areas: ['CMK', 'Bletchley', 'Wolverton'],
      },
      {
        region: 'East Milton Keynes',
        areas: ['Willen', 'Woughton', 'Broughton'],
      },
      {
        region: 'West Milton Keynes',
        areas: ['Shenley Church End', 'Furzton', 'Loughton'],
      },
    ],
  },
  {
    city: 'Northampton',
    regions: [
      {
        region: 'North Northampton',
        areas: ['Kingsthorpe', 'Duston', 'Spinney Hill'],
      },
      {
        region: 'South Northampton',
        areas: ['Far Cotton', 'Hardingstone', 'East Hunsbury'],
      },
      {
        region: 'Central Northampton',
        areas: ['Town Centre', 'Semilong'],
      },
    ],
  },
  {
    city: 'Norwich',
    regions: [
      {
        region: 'North Norwich',
        areas: ['Mile Cross', 'Catton', 'Sprowston'],
      },
      {
        region: 'South Norwich',
        areas: ['Lakenham', 'Eaton', 'Trowse'],
      },
      {
        region: 'Central Norwich',
        areas: ['City Centre', 'Golden Triangle', 'Norwich-over-the-Water'],
      },
    ],
  },
  {
    city: 'Portsmouth',
    regions: [
      {
        region: 'North Portsmouth',
        areas: ['Cosham', 'Hilsea', 'Drayton'],
      },
      {
        region: 'South Portsmouth',
        areas: ['Southsea', 'Old Portsmouth'],
      },
      {
        region: 'Central Portsmouth',
        areas: ['City Centre', 'Fratton', 'Buckland'],
      },
    ],
  },
  {
    city: 'Preston',
    regions: [
      {
        region: 'North Preston',
        areas: ['Fulwood', 'Ribbleton'],
      },
      {
        region: 'South Preston',
        areas: ['Penwortham', 'Ashton-on-Ribble'],
      },
      {
        region: 'Central Preston',
        areas: ['City Centre', 'Frenchwood'],
      },
    ],
  },
  {
    city: 'Sunderland',
    regions: [
      {
        region: 'North Sunderland',
        areas: ['Southwick', 'Fulwell', 'Roker'],
      },
      {
        region: 'South Sunderland',
        areas: ['Ryhope', 'Silksworth', 'Grangetown'],
      },
      {
        region: 'Central Sunderland',
        areas: ['City Centre', 'Hendon'],
      },
    ],
  },
  {
    city: 'Swansea',
    regions: [
      {
        region: 'North Swansea',
        areas: ['Morriston', 'Llansamlet'],
      },
      {
        region: 'South Swansea',
        areas: ['Mumbles', 'Sketty'],
      },
      {
        region: 'Central Swansea',
        areas: ['City Centre', 'Uplands'],
      },
    ],
  },
  {
    city: 'Southend-on-Sea',
    regions: [
      {
        region: 'East Southend',
        areas: ['Thorpe Bay', 'Southchurch'],
      },
      {
        region: 'West Southend',
        areas: ['Westcliff-on-Sea', 'Leigh-on-Sea'],
      },
      {
        region: 'Central Southend',
        areas: ['Town Centre', 'Prittlewell'],
      },
    ],
  },
  {
    city: 'Aberdeen',
    regions: [
      {
        region: 'North Aberdeen',
        areas: ['Bridge of Don', 'Danestone'],
      },
      {
        region: 'South Aberdeen',
        areas: ['Cults', 'Garthdee'],
      },
      {
        region: 'Central Aberdeen',
        areas: ['City Centre', 'Rosemount', 'Old Aberdeen'],
      },
    ],
  },
  {
    city: 'Middlesbrough',
    regions: [
      {
        region: 'North Middlesbrough',
        areas: ['North Ormesby', 'Berwick Hills'],
      },
      {
        region: 'South Middlesbrough',
        areas: ['Acklam', 'Marton', 'Nunthorpe'],
      },
      {
        region: 'Central Middlesbrough',
        areas: ['Town Centre', 'Linthorpe'],
      },
    ],
  },
  {
    city: 'Blackpool',
    regions: [
      {
        region: 'North Blackpool',
        areas: ['Bispham', 'Norbreck'],
      },
      {
        region: 'South Blackpool',
        areas: ['South Shore', 'Squires Gate'],
      },
      {
        region: 'Central Blackpool',
        areas: ['Town Centre', 'Layton'],
      },
    ],
  },
  {
    city: 'Bolton',
    regions: [
      {
        region: 'North Bolton',
        areas: ['Astley Bridge', 'Bromley Cross'],
      },
      {
        region: 'South Bolton',
        areas: ['Farnworth', 'Kearsley'],
      },
      {
        region: 'Central Bolton',
        areas: ['Town Centre', 'Great Lever'],
      },
    ],
  },
  {
    city: 'Ipswich',
    regions: [
      {
        region: 'North Ipswich',
        areas: ['Whitton', 'Rushmere'],
      },
      {
        region: 'South Ipswich',
        areas: ['Stoke Park', 'Priory Heath'],
      },
      {
        region: 'Central Ipswich',
        areas: ['Town Centre', 'Waterfront'],
      },
    ],
  },
  {
    city: 'York',
    regions: [
      {
        region: 'North York',
        areas: ['Clifton', 'Rawcliffe', 'Haxby'],
      },
      {
        region: 'South York',
        areas: ['Bishopthorpe', 'Fulford'],
      },
      {
        region: 'Central York',
        areas: ['City Centre', 'Fishergate'],
      },
    ],
  },
  {
    city: 'West Bromwich',
    regions: [
      {
        region: 'Town Centre',
        areas: ['West Bromwich Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Greets Green', 'Hateley Heath', 'Stone Cross'],
      },
    ],
  },
  {
    city: 'Peterborough',
    regions: [
      {
        region: 'North Peterborough',
        areas: ['Werrington', 'Paston'],
      },
      {
        region: 'South Peterborough',
        areas: ['Woodston', 'Orton'],
      },
      {
        region: 'Central Peterborough',
        areas: ['City Centre', 'Millfield'],
      },
    ],
  },
  {
    city: 'Stockport',
    regions: [
      {
        region: 'North Stockport',
        areas: ['Heaton Moor', 'Heaton Chapel'],
      },
      {
        region: 'South Stockport',
        areas: ['Cheadle', 'Bramhall'],
      },
      {
        region: 'Central Stockport',
        areas: ['Town Centre', 'Edgeley'],
      },
    ],
  },
  {
    city: 'Brighton',
    regions: [
      {
        region: 'North Brighton',
        areas: ['Preston Park', 'Fiveways', 'Patcham'],
      },
      {
        region: 'East Brighton',
        areas: ['Kemptown', 'Whitehawk', 'Rottingdean'],
      },
      {
        region: 'West Brighton',
        areas: ['Portslade', 'Aldrington'],
      },
      {
        region: 'Central Brighton',
        areas: ['The Lanes', 'North Laine', 'Seven Dials'],
      },
    ],
  },
  {
    city: 'Slough',
    regions: [
      {
        region: 'North Slough',
        areas: ['Britwell', 'Cippenham'],
      },
      {
        region: 'South Slough',
        areas: ['Langley', 'Colnbrook'],
      },
      {
        region: 'Central Slough',
        areas: ['Town Centre', 'Chalvey'],
      },
    ],
  },
  {
    city: 'Gloucester',
    regions: [
      {
        region: 'North Gloucester',
        areas: ['Longlevens', 'Churchdown'],
      },
      {
        region: 'South Gloucester',
        areas: ['Tuffley', 'Quedgeley'],
      },
      {
        region: 'Central Gloucester',
        areas: ['City Centre', 'Barton'],
      },
    ],
  },
  {
    city: 'Watford',
    regions: [
      {
        region: 'North Watford',
        areas: ['North Watford'],
      },
      {
        region: 'South Watford',
        areas: ['South Oxhey', 'Nascot Wood'],
      },
      {
        region: 'Central Watford',
        areas: ['Town Centre', 'Cassiobury'],
      },
    ],
  },
  {
    city: 'Rotherham',
    regions: [
      {
        region: 'North Rotherham',
        areas: ['Wath-upon-Dearne', 'Thorpe Hesley'],
      },
      {
        region: 'South Rotherham',
        areas: ['Wickersley', 'Whiston'],
      },
      {
        region: 'Central Rotherham',
        areas: ['Town Centre', 'Eastwood'],
      },
    ],
  },
  {
    city: 'Cambridge',
    regions: [
      {
        region: 'North Cambridge',
        areas: ['Chesterton', 'Arbury'],
      },
      {
        region: 'South Cambridge',
        areas: ['Trumpington', 'Cherry Hinton'],
      },
      {
        region: 'Central Cambridge',
        areas: ['City Centre', 'Romsey', 'Mill Road'],
      },
    ],
  },
  {
    city: 'Exeter',
    regions: [
      {
        region: 'North Exeter',
        areas: ['Pinhoe', 'Whipton'],
      },
      {
        region: 'South Exeter',
        areas: ['Alphington', 'Marsh Barton'],
      },
      {
        region: 'Central Exeter',
        areas: ['City Centre', 'St Leonards', 'Heavitree'],
      },
    ],
  },
  {
    city: 'Oxford',
    regions: [
      {
        region: 'North Oxford',
        areas: ['Summertown', 'Cutteslowe'],
      },
      {
        region: 'South Oxford',
        areas: ['Iffley', 'Cowley'],
      },
      {
        region: 'East Oxford',
        areas: ['Headington', 'Marston'],
      },
      {
        region: 'Central Oxford',
        areas: ['City Centre', 'Jericho'],
      },
    ],
  },
  {
    city: 'Dundee',
    regions: [
      {
        region: 'North Dundee',
        areas: ['Fintry', 'Downfield'],
      },
      {
        region: 'West Dundee',
        areas: ['Menzieshill', 'Charleston'],
      },
      {
        region: 'Central Dundee',
        areas: ['City Centre', 'Broughty Ferry'],
      },
    ],
  },
  {
    city: 'Basildon',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Basildon Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Pitsea', 'Laindon'],
      },
    ],
  },
  {
    city: 'Solihull',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Solihull Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Shirley', 'Olton', 'Dorridge'],
      },
    ],
  },
  {
    city: 'Chelmsford',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Chelmsford City Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Springfield', 'Broomfield', 'Great Baddow'],
      },
    ],
  },
  {
    city: 'Doncaster',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Doncaster Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Balby', 'Wheatley', 'Bessacarr'],
      },
    ],
  },
  {
    city: 'Basingstoke',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Basingstoke Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Chineham', 'Oakley', 'Old Basing'],
      },
    ],
  },
  {
    city: 'Colchester',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Colchester Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Lexden', 'Highwoods', 'Old Heath'],
      },
    ],
  },
  {
    city: 'Crawley',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Crawley Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Three Bridges', 'Furnace Green', 'Southgate'],
      },
    ],
  },
  {
    city: 'St Albans',
    regions: [
      {
        region: 'Town Centre',
        areas: ['St Albans City Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['St Stephens', 'Marshalswick', 'London Colney'],
      },
    ],
  },
  {
    city: 'Woking',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Woking Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Horsell', 'Knaphill', 'Old Woking'],
      },
    ],
  },
  {
    city: 'Maidstone',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Maidstone Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Allington', 'Penenden Heath', 'Shepway'],
      },
    ],
  },
  {
    city: 'Bath',
    regions: [
      {
        region: 'City Centre',
        areas: ['Bath City Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Oldfield Park', 'Widcombe', 'Larkhall'],
      },
    ],
  },
  {
    city: 'Worthing',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Worthing Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Tarring', 'Broadwater', 'Goring-by-Sea'],
      },
    ],
  },
  {
    city: 'Gillingham',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Gillingham Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Rainham', 'Twydall'],
      },
    ],
  },
  // Kent (Maidstone and Gillingham are above, with the original towns).
  {
    city: 'Canterbury',
    regions: [
      {
        region: 'City Centre',
        areas: ['Canterbury City Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Wincheap', 'Hales Place', 'Sturry', 'Thanington', 'Harbledown'],
      },
    ],
  },
  {
    city: 'Dartford',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Dartford Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Greenhithe', 'Stone', 'Swanscombe', 'Wilmington', 'Temple Hill'],
      },
    ],
  },
  {
    city: 'Gravesend',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Gravesend Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Northfleet', 'Riverview Park', 'Singlewell', 'Higham'],
      },
    ],
  },
  {
    city: 'Chatham',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Chatham Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Walderslade', 'Lordswood', 'Princes Park', 'Wayfield'],
      },
    ],
  },
  {
    city: 'Rochester',
    regions: [
      {
        region: 'City Centre',
        areas: ['Rochester City Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Strood', 'Frindsbury', 'Borstal', 'Wainscott'],
      },
    ],
  },
  {
    city: 'Ashford',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Ashford Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Kennington', 'Willesborough', 'Singleton', 'Repton Park'],
      },
    ],
  },
  {
    city: 'Tunbridge Wells',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Tunbridge Wells Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Southborough', 'Rusthall', 'Pembury', 'Sherwood'],
      },
    ],
  },
  {
    city: 'Tonbridge',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Tonbridge Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Hildenborough', 'Hadlow'],
      },
    ],
  },
  {
    city: 'Sevenoaks',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Sevenoaks Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Riverhead', 'Dunton Green', 'Kemsing', 'Otford'],
      },
    ],
  },
  {
    city: 'Swanley',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Swanley Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Hextable', 'Crockenhill'],
      },
    ],
  },
  {
    city: 'Sittingbourne',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Sittingbourne Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Milton Regis', 'Kemsley', 'Murston', 'Iwade'],
      },
    ],
  },
  {
    city: 'Faversham',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Faversham Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Ospringe', 'Boughton under Blean'],
      },
    ],
  },
  {
    city: 'Whitstable',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Whitstable Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Tankerton', 'Seasalter', 'Chestfield'],
      },
    ],
  },
  {
    city: 'Herne Bay',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Herne Bay Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Herne', 'Greenhill', 'Beltinge'],
      },
    ],
  },
  {
    city: 'Margate',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Margate Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Cliftonville', 'Westbrook', 'Garlinge', 'Westgate-on-Sea'],
      },
    ],
  },
  {
    city: 'Ramsgate',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Ramsgate Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Pegwell', 'Newington'],
      },
    ],
  },
  {
    city: 'Broadstairs',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Broadstairs Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ["St Peter's", 'Dumpton'],
      },
    ],
  },
  {
    city: 'Folkestone',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Folkestone Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Cheriton', 'Sandgate', 'Hawkinge'],
      },
    ],
  },
  {
    city: 'Dover',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Dover Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['River', 'Whitfield', 'Temple Ewell'],
      },
    ],
  },
  {
    city: 'Deal',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Deal Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Walmer', 'Sholden'],
      },
    ],
  },
  // Around London and other large towns the original list left out.
  {
    city: 'Brentwood',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Brentwood Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Shenfield', 'Hutton', 'Pilgrims Hatch', 'Ingatestone'],
      },
    ],
  },
  {
    city: 'Harlow',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Harlow Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Old Harlow', 'Church Langley', 'Potter Street'],
      },
    ],
  },
  {
    city: 'Grays',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Grays Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Chafford Hundred', 'Tilbury', 'Stanford-le-Hope', 'South Ockendon'],
      },
    ],
  },
  {
    city: 'Guildford',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Guildford Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Burpham', 'Merrow', 'Stoughton'],
      },
    ],
  },
  {
    city: 'Epsom',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Epsom Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Ewell', 'Stoneleigh', 'Ashtead'],
      },
    ],
  },
  {
    city: 'Redhill',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Redhill Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Merstham', 'Earlswood'],
      },
    ],
  },
  {
    city: 'Hemel Hempstead',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Hemel Hempstead Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Apsley', 'Boxmoor', 'Leverstock Green'],
      },
    ],
  },
  {
    city: 'Stevenage',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Stevenage Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Old Town', 'Shephall', 'Chells'],
      },
    ],
  },
  {
    city: 'Hatfield',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Hatfield Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Welham Green'],
      },
    ],
  },
  {
    city: 'Eastbourne',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Eastbourne Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Meads', 'Old Town', 'Hampden Park', 'Polegate'],
      },
    ],
  },
  {
    city: 'Hastings',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Hastings Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['St Leonards-on-Sea', 'Bexhill-on-Sea', 'Ore', 'Silverhill'],
      },
    ],
  },
  {
    city: 'Hull',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Hull Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Hessle', 'Cottingham', 'Anlaby', 'Newland'],
      },
    ],
  },
  {
    city: 'Bournemouth',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Bournemouth Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Boscombe', 'Winton', 'Southbourne', 'Christchurch'],
      },
    ],
  },
  {
    city: 'Swindon',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Swindon Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Old Town', 'Stratton', 'Wroughton', 'Haydon Wick'],
      },
    ],
  },
  {
    city: 'Huddersfield',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Huddersfield Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Almondbury', 'Lindley', 'Marsh', 'Birkby'],
      },
    ],
  },
  {
    city: 'Bedford',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Bedford Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Kempston', 'Biddenham', 'Goldington', 'Brickhill'],
      },
    ],
  },
  {
    city: 'Walsall',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Walsall Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Bloxwich', 'Aldridge', 'Willenhall', 'Darlaston'],
      },
    ],
  },
  {
    city: 'Dudley',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Dudley Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Brierley Hill', 'Sedgley'],
      },
    ],
  },
  {
    city: 'Oldham',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Oldham Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Chadderton', 'Royton', 'Shaw', 'Failsworth'],
      },
    ],
  },
  {
    city: 'Warrington',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Warrington Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Stockton Heath', 'Birchwood', 'Great Sankey', 'Lymm'],
      },
    ],
  },
  {
    city: 'Cheltenham',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Cheltenham Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Montpellier', 'Leckhampton', 'Charlton Kings', 'Prestbury'],
      },
    ],
  },
  // More towns and counties across the UK (2026-11-03).
  {
    city: 'Billericay',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Billericay Town Centre'],
      },
    ],
  },
  {
    city: 'Wickford',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Wickford Town Centre'],
      },
    ],
  },
  {
    city: 'Rayleigh',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Rayleigh Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Hockley', 'Rochford'],
      },
    ],
  },
  {
    city: 'Canvey Island',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Canvey Island Town Centre'],
      },
    ],
  },
  {
    city: 'Benfleet',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Benfleet Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Thundersley', 'Hadleigh'],
      },
    ],
  },
  {
    city: 'Clacton-on-Sea',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Clacton-on-Sea Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Jaywick', 'Holland-on-Sea'],
      },
    ],
  },
  {
    city: 'Braintree',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Braintree Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Great Notley'],
      },
    ],
  },
  {
    city: 'Witham',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Witham Town Centre'],
      },
    ],
  },
  {
    city: 'Loughton',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Loughton Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Debden'],
      },
    ],
  },
  {
    city: 'Chigwell',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Chigwell Town Centre'],
      },
    ],
  },
  {
    city: 'Buckhurst Hill',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Buckhurst Hill Town Centre'],
      },
    ],
  },
  {
    city: 'Epping',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Epping Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['North Weald'],
      },
    ],
  },
  {
    city: 'Saffron Walden',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Saffron Walden Town Centre'],
      },
    ],
  },
  {
    city: 'Maldon',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Maldon Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Heybridge'],
      },
    ],
  },
  {
    city: 'Harwich',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Harwich Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Dovercourt'],
      },
    ],
  },
  {
    city: 'Waltham Abbey',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Waltham Abbey Town Centre'],
      },
    ],
  },
  {
    city: 'Hythe',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Hythe Town Centre'],
      },
    ],
  },
  {
    city: 'Tenterden',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Tenterden Town Centre'],
      },
    ],
  },
  {
    city: 'Westerham',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Westerham Town Centre'],
      },
    ],
  },
  {
    city: 'Edenbridge',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Edenbridge Town Centre'],
      },
    ],
  },
  {
    city: 'Paddock Wood',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Paddock Wood Town Centre'],
      },
    ],
  },
  {
    city: 'Snodland',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Snodland Town Centre'],
      },
    ],
  },
  {
    city: 'West Malling',
    regions: [
      {
        region: 'Town Centre',
        areas: ['West Malling Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Kings Hill', 'Larkfield'],
      },
    ],
  },
  {
    city: 'Sheerness',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Sheerness Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Minster', 'Queenborough'],
      },
    ],
  },
  {
    city: 'Cranbrook',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Cranbrook Town Centre'],
      },
    ],
  },
  {
    city: 'New Romney',
    regions: [
      {
        region: 'Town Centre',
        areas: ['New Romney Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Lydd', 'Dymchurch'],
      },
    ],
  },
  {
    city: 'Camberley',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Camberley Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Frimley'],
      },
    ],
  },
  {
    city: 'Farnham',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Farnham Town Centre'],
      },
    ],
  },
  {
    city: 'Staines-upon-Thames',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Staines-upon-Thames Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Ashford (Surrey)', 'Egham'],
      },
    ],
  },
  {
    city: 'Weybridge',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Weybridge Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Addlestone'],
      },
    ],
  },
  {
    city: 'Walton-on-Thames',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Walton-on-Thames Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Hersham'],
      },
    ],
  },
  {
    city: 'Esher',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Esher Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Claygate', 'Cobham'],
      },
    ],
  },
  {
    city: 'Leatherhead',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Leatherhead Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Ashtead', 'Bookham'],
      },
    ],
  },
  {
    city: 'Dorking',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Dorking Town Centre'],
      },
    ],
  },
  {
    city: 'Godalming',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Godalming Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Farncombe'],
      },
    ],
  },
  {
    city: 'Caterham',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Caterham Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Whyteleafe'],
      },
    ],
  },
  {
    city: 'Oxted',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Oxted Town Centre'],
      },
    ],
  },
  {
    city: 'Reigate',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Reigate Town Centre'],
      },
    ],
  },
  {
    city: 'Horley',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Horley Town Centre'],
      },
    ],
  },
  {
    city: "Bishop's Stortford",
    regions: [
      {
        region: 'Town Centre',
        areas: ["Bishop's Stortford Town Centre"],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Sawbridgeworth'],
      },
    ],
  },
  {
    city: 'Hertford',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Hertford Town Centre'],
      },
    ],
  },
  {
    city: 'Ware',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Ware Town Centre'],
      },
    ],
  },
  {
    city: 'Hitchin',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Hitchin Town Centre'],
      },
    ],
  },
  {
    city: 'Letchworth',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Letchworth Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Baldock'],
      },
    ],
  },
  {
    city: 'Harpenden',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Harpenden Town Centre'],
      },
    ],
  },
  {
    city: 'Borehamwood',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Borehamwood Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Elstree'],
      },
    ],
  },
  {
    city: 'Potters Bar',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Potters Bar Town Centre'],
      },
    ],
  },
  {
    city: 'Cheshunt',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Cheshunt Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Waltham Cross'],
      },
    ],
  },
  {
    city: 'Hoddesdon',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Hoddesdon Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Broxbourne'],
      },
    ],
  },
  {
    city: 'Welwyn Garden City',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Welwyn Garden City Town Centre'],
      },
    ],
  },
  {
    city: 'Berkhamsted',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Berkhamsted Town Centre'],
      },
    ],
  },
  {
    city: 'Tring',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Tring Town Centre'],
      },
    ],
  },
  {
    city: 'Rickmansworth',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Rickmansworth Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Croxley Green'],
      },
    ],
  },
  {
    city: 'Bushey',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Bushey Town Centre'],
      },
    ],
  },
  {
    city: 'Royston',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Royston Town Centre'],
      },
    ],
  },
  {
    city: 'Horsham',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Horsham Town Centre'],
      },
    ],
  },
  {
    city: 'Haywards Heath',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Haywards Heath Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Cuckfield'],
      },
    ],
  },
  {
    city: 'Burgess Hill',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Burgess Hill Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Hassocks'],
      },
    ],
  },
  {
    city: 'Chichester',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Chichester Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Selsey'],
      },
    ],
  },
  {
    city: 'Bognor Regis',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Bognor Regis Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Felpham'],
      },
    ],
  },
  {
    city: 'Littlehampton',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Littlehampton Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Rustington'],
      },
    ],
  },
  {
    city: 'Lewes',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Lewes Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Newhaven', 'Seaford'],
      },
    ],
  },
  {
    city: 'Uckfield',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Uckfield Town Centre'],
      },
    ],
  },
  {
    city: 'Crowborough',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Crowborough Town Centre'],
      },
    ],
  },
  {
    city: 'East Grinstead',
    regions: [
      {
        region: 'Town Centre',
        areas: ['East Grinstead Town Centre'],
      },
    ],
  },
  {
    city: 'Shoreham-by-Sea',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Shoreham-by-Sea Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Lancing'],
      },
    ],
  },
  {
    city: 'Hove',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Hove Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Portslade'],
      },
    ],
  },
  {
    city: 'Bracknell',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Bracknell Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Crowthorne', 'Sandhurst'],
      },
    ],
  },
  {
    city: 'Maidenhead',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Maidenhead Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Cookham'],
      },
    ],
  },
  {
    city: 'Windsor',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Windsor Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Eton', 'Datchet'],
      },
    ],
  },
  {
    city: 'Wokingham',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Wokingham Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Winnersh'],
      },
    ],
  },
  {
    city: 'Newbury',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Newbury Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Thatcham'],
      },
    ],
  },
  {
    city: 'High Wycombe',
    regions: [
      {
        region: 'Town Centre',
        areas: ['High Wycombe Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Hazlemere'],
      },
    ],
  },
  {
    city: 'Aylesbury',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Aylesbury Town Centre'],
      },
    ],
  },
  {
    city: 'Amersham',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Amersham Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Chesham'],
      },
    ],
  },
  {
    city: 'Beaconsfield',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Beaconsfield Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Gerrards Cross'],
      },
    ],
  },
  {
    city: 'Marlow',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Marlow Town Centre'],
      },
    ],
  },
  {
    city: 'Buckingham',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Buckingham Town Centre'],
      },
    ],
  },
  {
    city: 'Dunstable',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Dunstable Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Houghton Regis'],
      },
    ],
  },
  {
    city: 'Leighton Buzzard',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Leighton Buzzard Town Centre'],
      },
    ],
  },
  {
    city: 'Biggleswade',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Biggleswade Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Sandy'],
      },
    ],
  },
  {
    city: 'Ampthill',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Ampthill Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Flitwick'],
      },
    ],
  },
  {
    city: 'Winchester',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Winchester Town Centre'],
      },
    ],
  },
  {
    city: 'Farnborough',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Farnborough Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Fleet'],
      },
    ],
  },
  {
    city: 'Aldershot',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Aldershot Town Centre'],
      },
    ],
  },
  {
    city: 'Fareham',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Fareham Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Portchester'],
      },
    ],
  },
  {
    city: 'Eastleigh',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Eastleigh Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Chandlers Ford'],
      },
    ],
  },
  {
    city: 'Andover',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Andover Town Centre'],
      },
    ],
  },
  {
    city: 'Havant',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Havant Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Waterlooville', 'Emsworth'],
      },
    ],
  },
  {
    city: 'Gosport',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Gosport Town Centre'],
      },
    ],
  },
  {
    city: 'Romsey',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Romsey Town Centre'],
      },
    ],
  },
  {
    city: 'Petersfield',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Petersfield Town Centre'],
      },
    ],
  },
  {
    city: 'Alton',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Alton Town Centre'],
      },
    ],
  },
  {
    city: 'Salford',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Salford Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Eccles', 'Swinton'],
      },
    ],
  },
  {
    city: 'Wigan',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Wigan Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Leigh'],
      },
    ],
  },
  {
    city: 'Rochdale',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Rochdale Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Heywood', 'Middleton'],
      },
    ],
  },
  {
    city: 'Bury',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Bury Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Ramsbottom', 'Prestwich'],
      },
    ],
  },
  {
    city: 'Altrincham',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Altrincham Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Sale', 'Hale'],
      },
    ],
  },
  {
    city: 'Ashton-under-Lyne',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Ashton-under-Lyne Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Stalybridge', 'Hyde'],
      },
    ],
  },
  {
    city: 'Sutton Coldfield',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Sutton Coldfield Town Centre'],
      },
    ],
  },
  {
    city: 'Halesowen',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Halesowen Town Centre'],
      },
    ],
  },
  {
    city: 'Stourbridge',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Stourbridge Town Centre'],
      },
    ],
  },
  {
    city: 'Smethwick',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Smethwick Town Centre'],
      },
    ],
  },
  {
    city: 'Oldbury',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Oldbury Town Centre'],
      },
    ],
  },
  {
    city: 'Wakefield',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Wakefield Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Ossett', 'Horbury'],
      },
    ],
  },
  {
    city: 'Halifax',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Halifax Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Sowerby Bridge'],
      },
    ],
  },
  {
    city: 'Dewsbury',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Dewsbury Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Batley'],
      },
    ],
  },
  {
    city: 'Keighley',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Keighley Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Bingley'],
      },
    ],
  },
  {
    city: 'Pontefract',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Pontefract Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Castleford'],
      },
    ],
  },
  {
    city: 'St Helens',
    regions: [
      {
        region: 'Town Centre',
        areas: ['St Helens Town Centre'],
      },
    ],
  },
  {
    city: 'Birkenhead',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Birkenhead Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Wallasey', 'Bebington'],
      },
    ],
  },
  {
    city: 'Southport',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Southport Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Formby'],
      },
    ],
  },
  {
    city: 'Bootle',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Bootle Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Crosby'],
      },
    ],
  },
  {
    city: 'Lancaster',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Lancaster Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Morecambe'],
      },
    ],
  },
  {
    city: 'Blackburn',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Blackburn Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Darwen'],
      },
    ],
  },
  {
    city: 'Burnley',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Burnley Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Nelson'],
      },
    ],
  },
  {
    city: 'Chorley',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Chorley Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Leyland'],
      },
    ],
  },
  {
    city: 'Lincoln',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Lincoln Town Centre'],
      },
    ],
  },
  {
    city: 'Worcester',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Worcester Town Centre'],
      },
    ],
  },
  {
    city: 'Hereford',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Hereford Town Centre'],
      },
    ],
  },
  {
    city: 'Chester',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Chester Town Centre'],
      },
    ],
  },
  {
    city: 'Carlisle',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Carlisle Town Centre'],
      },
    ],
  },
  {
    city: 'Durham',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Durham Town Centre'],
      },
    ],
  },
  {
    city: 'Shrewsbury',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Shrewsbury Town Centre'],
      },
    ],
  },
  {
    city: 'Telford',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Telford Town Centre'],
      },
    ],
  },
  {
    city: 'Stafford',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Stafford Town Centre'],
      },
    ],
  },
  {
    city: 'Lichfield',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Lichfield Town Centre'],
      },
    ],
  },
  {
    city: 'Nuneaton',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Nuneaton Town Centre'],
      },
    ],
  },
  {
    city: 'Rugby',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Rugby Town Centre'],
      },
    ],
  },
  {
    city: 'Leamington Spa',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Leamington Spa Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Warwick', 'Kenilworth'],
      },
    ],
  },
  {
    city: 'Stratford-upon-Avon',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Stratford-upon-Avon Town Centre'],
      },
    ],
  },
  {
    city: 'Kettering',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Kettering Town Centre'],
      },
    ],
  },
  {
    city: 'Corby',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Corby Town Centre'],
      },
    ],
  },
  {
    city: 'Wellingborough',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Wellingborough Town Centre'],
      },
    ],
  },
  {
    city: 'Mansfield',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Mansfield Town Centre'],
      },
    ],
  },
  {
    city: 'Chesterfield',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Chesterfield Town Centre'],
      },
    ],
  },
  {
    city: 'Barnsley',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Barnsley Town Centre'],
      },
    ],
  },
  {
    city: 'Grimsby',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Grimsby Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Cleethorpes'],
      },
    ],
  },
  {
    city: 'Scunthorpe',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Scunthorpe Town Centre'],
      },
    ],
  },
  {
    city: 'Harrogate',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Harrogate Town Centre'],
      },
    ],
  },
  {
    city: 'Darlington',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Darlington Town Centre'],
      },
    ],
  },
  {
    city: 'Hartlepool',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Hartlepool Town Centre'],
      },
    ],
  },
  {
    city: 'Stockton-on-Tees',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Stockton-on-Tees Town Centre'],
      },
    ],
  },
  {
    city: 'Gateshead',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Gateshead Town Centre'],
      },
    ],
  },
  {
    city: 'South Shields',
    regions: [
      {
        region: 'Town Centre',
        areas: ['South Shields Town Centre'],
      },
    ],
  },
  {
    city: 'Torquay',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Torquay Town Centre'],
      },
      {
        region: 'Surrounding Areas',
        areas: ['Paignton'],
      },
    ],
  },
  {
    city: 'Truro',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Truro Town Centre'],
      },
    ],
  },
  {
    city: 'Taunton',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Taunton Town Centre'],
      },
    ],
  },
  {
    city: 'Yeovil',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Yeovil Town Centre'],
      },
    ],
  },
  {
    city: 'Salisbury',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Salisbury Town Centre'],
      },
    ],
  },
  {
    city: 'Weymouth',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Weymouth Town Centre'],
      },
    ],
  },
  {
    city: 'Poole',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Poole Town Centre'],
      },
    ],
  },
  {
    city: 'Kidderminster',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Kidderminster Town Centre'],
      },
    ],
  },
  {
    city: 'Loughborough',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Loughborough Town Centre'],
      },
    ],
  },
  {
    city: 'Macclesfield',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Macclesfield Town Centre'],
      },
    ],
  },
  {
    city: 'Crewe',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Crewe Town Centre'],
      },
    ],
  },
  {
    city: 'Burton upon Trent',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Burton upon Trent Town Centre'],
      },
    ],
  },
  {
    city: 'Newport',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Newport Town Centre'],
      },
    ],
  },
  {
    city: 'Wrexham',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Wrexham Town Centre'],
      },
    ],
  },
  {
    city: 'Bangor',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Bangor Town Centre'],
      },
    ],
  },
  {
    city: 'Inverness',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Inverness Town Centre'],
      },
    ],
  },
  {
    city: 'Stirling',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Stirling Town Centre'],
      },
    ],
  },
  {
    city: 'Perth',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Perth Town Centre'],
      },
    ],
  },
  {
    city: 'Paisley',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Paisley Town Centre'],
      },
    ],
  },
  {
    city: 'Lisburn',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Lisburn Town Centre'],
      },
    ],
  },
  {
    city: 'Derry',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Derry Town Centre'],
      },
    ],
  },
  {
    city: 'Newry',
    regions: [
      {
        region: 'Town Centre',
        areas: ['Newry Town Centre'],
      },
    ],
  },
];

export const CITY_AREA_NAMES = CITY_AREAS.map(c => c.city);

/** Towns above that sit in a county people search by name ("nails in kent").
 *  Locations are stored as "<Area>, <Town>", so the county name itself never
 *  appears in one; search widens the county to these towns instead. */
export const COUNTY_TOWNS: Record<string, string[]> = {
  Kent: ['Maidstone', 'Gillingham', 'Canterbury', 'Dartford', 'Gravesend', 'Chatham', 'Rochester', 'Ashford', 'Tunbridge Wells', 'Tonbridge', 'Sevenoaks', 'Swanley', 'Sittingbourne', 'Faversham', 'Whitstable', 'Herne Bay', 'Margate', 'Ramsgate', 'Broadstairs', 'Folkestone', 'Dover', 'Deal', 'Hythe', 'Tenterden', 'Westerham', 'Edenbridge', 'Paddock Wood', 'Snodland', 'West Malling', 'Sheerness', 'Cranbrook', 'New Romney'],
  Essex: ['Chelmsford', 'Basildon', 'Colchester', 'Southend-on-Sea', 'Brentwood', 'Harlow', 'Grays', 'Billericay', 'Wickford', 'Rayleigh', 'Canvey Island', 'Benfleet', 'Clacton-on-Sea', 'Braintree', 'Witham', 'Loughton', 'Chigwell', 'Buckhurst Hill', 'Epping', 'Saffron Walden', 'Maldon', 'Harwich', 'Waltham Abbey'],
  Surrey: ['Woking', 'Guildford', 'Epsom', 'Redhill', 'Camberley', 'Farnham', 'Staines-upon-Thames', 'Weybridge', 'Walton-on-Thames', 'Esher', 'Leatherhead', 'Dorking', 'Godalming', 'Caterham', 'Oxted', 'Reigate', 'Horley'],
  Hertfordshire: ['Watford', 'St Albans', 'Hemel Hempstead', 'Stevenage', 'Hatfield', "Bishop's Stortford", 'Hertford', 'Ware', 'Hitchin', 'Letchworth', 'Harpenden', 'Borehamwood', 'Potters Bar', 'Cheshunt', 'Hoddesdon', 'Welwyn Garden City', 'Berkhamsted', 'Tring', 'Rickmansworth', 'Bushey', 'Royston'],
  Sussex: ['Brighton', 'Worthing', 'Crawley', 'Eastbourne', 'Hastings', 'Horsham', 'Haywards Heath', 'Burgess Hill', 'Chichester', 'Bognor Regis', 'Littlehampton', 'Lewes', 'Uckfield', 'Crowborough', 'East Grinstead', 'Shoreham-by-Sea', 'Hove'],
  Berkshire: ['Reading', 'Slough', 'Bracknell', 'Maidenhead', 'Windsor', 'Wokingham', 'Newbury'],
  Buckinghamshire: ['Milton Keynes', 'High Wycombe', 'Aylesbury', 'Amersham', 'Beaconsfield', 'Marlow', 'Buckingham'],
  Bedfordshire: ['Luton', 'Bedford', 'Dunstable', 'Leighton Buzzard', 'Biggleswade', 'Ampthill'],
  Hampshire: ['Southampton', 'Portsmouth', 'Basingstoke', 'Winchester', 'Farnborough', 'Aldershot', 'Fareham', 'Eastleigh', 'Andover', 'Havant', 'Gosport', 'Romsey', 'Petersfield', 'Alton'],
  'Greater Manchester': ['Manchester', 'Bolton', 'Stockport', 'Oldham', 'Salford', 'Wigan', 'Rochdale', 'Bury', 'Altrincham', 'Ashton-under-Lyne'],
  'West Midlands': ['Birmingham', 'Coventry', 'Wolverhampton', 'Walsall', 'Dudley', 'Solihull', 'West Bromwich', 'Sutton Coldfield', 'Halesowen', 'Stourbridge', 'Smethwick', 'Oldbury'],
  'West Yorkshire': ['Leeds', 'Bradford', 'Huddersfield', 'Wakefield', 'Halifax', 'Dewsbury', 'Keighley', 'Pontefract'],
  Merseyside: ['Liverpool', 'St Helens', 'Birkenhead', 'Southport', 'Bootle'],
  Lancashire: ['Preston', 'Blackpool', 'Lancaster', 'Blackburn', 'Burnley', 'Chorley'],
};

export type PlaceMatch =
  | { kind: 'county'; name: string }
  | { kind: 'town'; name: string }
  | { kind: 'area'; name: string; town: string };

const normalizePlace = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Every place the pickers know that matches what was typed, at any level, so
 * nobody has to know that Stoke Newington sits under North London or that Kent
 * is a list of towns. Names starting with the text come before ones containing
 * it, and bigger places before smaller. Capped so the list stays readable.
 */
export function searchPlaces(query: string, limit = 40): PlaceMatch[] {
  const q = normalizePlace(query);
  if (!q) return [];
  const starts: PlaceMatch[] = [];
  const contains: PlaceMatch[] = [];
  const consider = (name: string, match: PlaceMatch) => {
    const key = normalizePlace(name);
    if (key.startsWith(q)) starts.push(match);
    else if (q.length >= 2 && key.includes(q)) contains.push(match);
  };
  for (const name of Object.keys(COUNTY_TOWNS)) consider(name, { kind: 'county', name });
  for (const { city } of CITY_AREAS) consider(city, { kind: 'town', name: city });
  for (const { city, regions } of CITY_AREAS) {
    for (const { areas } of regions) {
      for (const name of areas) consider(name, { kind: 'area', name, town: city });
    }
  }
  return [...starts, ...contains].slice(0, limit);
}

export const getCityAreaData = (city: string): CityAreaData | undefined =>
  CITY_AREAS.find(c => c.city.toLowerCase() === city.trim().toLowerCase());
