import { __formatAddressForTest as formatAddress } from '../components/AddressPicker';

type Geo = Parameters<typeof formatAddress>[0];
const geo = (parts: Partial<Geo>): Geo => ({
  name: null, streetNumber: null, street: null, district: null,
  city: null, region: null, postalCode: null, country: null,
  subregion: null, timezone: null, isoCountryCode: null,
  ...parts,
} as Geo);

// The provider's private street address is the one field Publish hard-requires
// and the one a client is eventually handed. It was being STORED doubled —
// live rows read "207A Saint John's Road 207A Saint John's Road" — because iOS
// returns the whole street line in `name` and again split across
// streetNumber/street, and the dedupe only compared the parts for equality.
describe('formatAddress', () => {
  it('does not repeat a street line iOS returned both whole and split', () => {
    expect(formatAddress(geo({
      name: "207A Saint John's Road", streetNumber: '207A', street: "Saint John's Road",
      city: 'London', postalCode: 'SW11 1QW',
    }))).toBe("207A Saint John's Road, London, SW11 1QW");
  });

  it('keeps a real building name that leads the street line', () => {
    expect(formatAddress(geo({
      name: 'Wellspring House', streetNumber: '11', street: 'Seagull Lane',
      city: 'London', postalCode: 'E9 5AB',
    }))).toBe('Wellspring House 11 Seagull Lane, London, E9 5AB');
  });

  it('does not repeat when the building name already carries the street', () => {
    expect(formatAddress(geo({
      name: 'Wellspring House, 11 Seagull Lane', streetNumber: '11', street: 'Seagull Lane',
      city: 'London',
    }))).toBe('Wellspring House, 11 Seagull Lane, London');
  });

  it('falls back to either half alone', () => {
    expect(formatAddress(geo({ name: '12 Bellenden Road', city: 'London' })))
      .toBe('12 Bellenden Road, London');
    expect(formatAddress(geo({ streetNumber: '12', street: 'Bellenden Road', city: 'London' })))
      .toBe('12 Bellenden Road, London');
  });

  it('still drops empty components rather than leaving stray commas', () => {
    expect(formatAddress(geo({ name: '5 High Street', city: 'Manchester', country: 'UK' })))
      .toBe('5 High Street, Manchester, UK');
  });
});
