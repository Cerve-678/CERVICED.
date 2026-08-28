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
        areas: ['Anfield', 'Everton', 'Walton', 'Bootle'],
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
        areas: ['Sneinton', 'Carlton', 'St Ann\'s'],
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
        areas: ['Hove', 'Portslade', 'Aldrington'],
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
        areas: ['North Watford', 'Bushey'],
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
        areas: ['Pitsea', 'Laindon', 'Wickford'],
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
];

export const CITY_AREA_NAMES = CITY_AREAS.map(c => c.city);

export const getCityAreaData = (city: string): CityAreaData | undefined =>
  CITY_AREAS.find(c => c.city.toLowerCase() === city.trim().toLowerCase());
