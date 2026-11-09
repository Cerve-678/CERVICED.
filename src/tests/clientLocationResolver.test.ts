import {
  resolveClientLocation,
  planClientLocation,
  savePhoneLocationChoice,
  COARSE_ACCURACY_THRESHOLD_M,
} from '../services/clientLocationService';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  geocodeAsync: jest.fn(),
}));
jest.mock('../utils/storage', () => ({
  storage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
  STORAGE_KEYS: { MANUAL_LOCATION: 'manual_location', NEAR_YOU_USE_DEVICE: 'near_you_use_device' },
}));

const Location = require('expo-location');
const { storage } = require('../utils/storage');

const position = (accuracy: number | null) => ({
  coords: { latitude: 53.48, longitude: -2.24, accuracy },
});

/** What this phone has saved: a picked place, and/or the "Use my location" flag. */
const phoneHas = (saved: { place?: string | null; useDevice?: boolean }) =>
  storage.getItem.mockImplementation(async (key: string) =>
    key === 'manual_location' ? saved.place ?? null
      : key === 'near_you_use_device' ? saved.useDevice ?? null
        : null);

describe('resolveClientLocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    phoneHas({});
  });

  it('reports a device fix as gps, with no city label', async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Location.getCurrentPositionAsync.mockResolvedValue(position(35));

    const result = await resolveClientLocation();
    expect(result.source).toBe('gps');
    expect(result.isCoarse).toBe(false);
    expect(result.placeLabel).toBeNull();
  });

  it('flags a fix too vague to present as a position', async () => {
    // What iOS returns when Precise Location is off: permission still reads
    // as granted, so the accuracy radius is the only signal there is.
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Location.getCurrentPositionAsync.mockResolvedValue(position(COARSE_ACCURACY_THRESHOLD_M + 1));

    expect((await resolveClientLocation()).isCoarse).toBe(true);
  });

  it('believes a platform that does not report accuracy rather than assuming the worst', async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Location.getCurrentPositionAsync.mockResolvedValue(position(null));

    expect((await resolveClientLocation()).isCoarse).toBe(false);
  });

  it('falls back to a saved city, and says that is what it did', async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
    phoneHas({ place: 'Manchester, UK' });
    Location.geocodeAsync.mockResolvedValue([{ latitude: 53.48, longitude: -2.24 }]);

    const result = await resolveClientLocation();
    // A centroid is exact as a coordinate and wrong as a position, so the
    // caller must be able to tell it apart from a real fix — that is the whole
    // point of `source` existing rather than callers checking for null coords.
    expect(result.source).toBe('saved-place');
    expect(result.placeLabel).toBe('Manchester, UK');
    expect(result.isCoarse).toBe(false);
  });

  it('measures from a picked neighbourhood ahead of the device', async () => {
    // The client chose Dalston on purpose; a GPS fix from wherever they
    // happen to be standing shouldn't quietly overrule that.
    phoneHas({ place: 'Dalston, London' });
    Location.geocodeAsync.mockResolvedValue([{ latitude: 51.546, longitude: -0.075 }]);

    const result = await resolveClientLocation();
    expect(result).toEqual({
      coords: { latitude: 51.546, longitude: -0.075 },
      source: 'saved-place',
      placeLabel: 'Dalston, London',
      isCoarse: false,
    });
    expect(Location.geocodeAsync).toHaveBeenCalledWith('Dalston, London, UK');
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('prefers the device over a saved whole city', async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Location.getCurrentPositionAsync.mockResolvedValue(position(35));
    phoneHas({ place: 'London, UK' });

    expect((await resolveClientLocation()).source).toBe('gps');
  });

  it('ignores a place the geocoder puts outside the UK', async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
    phoneHas({ place: 'East London' });
    Location.geocodeAsync.mockResolvedValue([{ latitude: -32.999, longitude: 27.875 }]);

    expect((await resolveClientLocation()).source).toBe('unknown');
  });

  it('returns unknown rather than throwing when there is nothing to go on', async () => {
    Location.requestForegroundPermissionsAsync.mockRejectedValue(new Error('no location services'));
    phoneHas({ place: null });

    const result = await resolveClientLocation();
    expect(result).toEqual({ coords: null, source: 'unknown', placeLabel: null, isCoarse: false });
  });
});

describe('planClientLocation', () => {
  const none = { kind: 'none' } as const;
  const device = { kind: 'device' } as const;
  const place = (p: string) => ({ kind: 'place', place: p }) as const;
  const gps = { kind: 'gps' };
  const account = (p: string) => ({ kind: 'place', place: p, source: 'account-area' });
  const picked = (p: string) => ({ kind: 'place', place: p, source: 'saved-place' });

  it('uses Your area ahead of GPS on a phone that has picked nothing', () => {
    // A new phone or a reinstall: the account already says where they are.
    expect(planClientLocation(none, 'Haggerston, London')).toEqual([account('Haggerston, London'), gps]);
  });

  it('puts a whole-town Your area behind GPS, like a whole town picked on Home', () => {
    expect(planClientLocation(none, 'London')).toEqual([gps, account('London')]);
  });

  it('is just GPS with no Your area and nothing picked', () => {
    expect(planClientLocation(none, null)).toEqual([gps]);
    expect(planClientLocation(none, '   ')).toEqual([gps]);
  });

  it('lets a place picked on this phone outrank Your area', () => {
    expect(planClientLocation(place('Dalston, London'), 'Haggerston, London'))
      .toEqual([picked('Dalston, London'), gps, account('Haggerston, London')]);
  });

  it('keeps GPS ahead of a whole town picked on this phone, and Your area last', () => {
    expect(planClientLocation(place('London, UK'), 'Haggerston, London'))
      .toEqual([gps, picked('London, UK'), account('Haggerston, London')]);
  });

  it('does not try the same place twice', () => {
    expect(planClientLocation(place('Dalston, London'), 'Dalston, London'))
      .toEqual([picked('Dalston, London'), gps]);
  });

  it('means GPS after "Use my location", with Your area only if there is no fix', () => {
    expect(planClientLocation(device, 'Haggerston, London')).toEqual([gps, account('Haggerston, London')]);
    expect(planClientLocation(device, null)).toEqual([gps]);
  });
});

describe('resolveClientLocation with Your area', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    phoneHas({});
  });

  it('measures from Your area on a phone with nothing picked, without asking for GPS', async () => {
    Location.geocodeAsync.mockResolvedValue([{ latitude: 51.534, longitude: -0.075 }]);

    const result = await resolveClientLocation({ accountArea: 'Haggerston, London' });
    expect(result).toEqual({
      coords: { latitude: 51.534, longitude: -0.075 },
      source: 'account-area',
      placeLabel: 'Haggerston, London',
      isCoarse: false,
    });
    // Geocoded exactly the way a place picked on Home is.
    expect(Location.geocodeAsync).toHaveBeenCalledWith('Haggerston, London, UK');
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('uses GPS after "Use my location", even with Your area set', async () => {
    phoneHas({ useDevice: true });
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Location.getCurrentPositionAsync.mockResolvedValue(position(35));

    expect((await resolveClientLocation({ accountArea: 'Haggerston, London' })).source).toBe('gps');
    expect(Location.geocodeAsync).not.toHaveBeenCalled();
  });

  it('falls back to Your area when "Use my location" gets no fix', async () => {
    phoneHas({ useDevice: true });
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
    Location.geocodeAsync.mockResolvedValue([{ latitude: 51.534, longitude: -0.075 }]);

    const result = await resolveClientLocation({ accountArea: 'Haggerston, London' });
    expect(result.source).toBe('account-area');
    expect(result.placeLabel).toBe('Haggerston, London');
  });

  it('goes on to GPS when Your area cannot be found', async () => {
    Location.geocodeAsync.mockResolvedValue([]);
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Location.getCurrentPositionAsync.mockResolvedValue(position(35));

    expect((await resolveClientLocation({ accountArea: 'Haggerston, London' })).source).toBe('gps');
  });
});

describe('savePhoneLocationChoice', () => {
  beforeEach(() => jest.clearAllMocks());

  it('saves a picked place on the phone and clears "Use my location"', async () => {
    await savePhoneLocationChoice('Dalston, London');
    expect(storage.setItem).toHaveBeenCalledWith('manual_location', 'Dalston, London');
    expect(storage.removeItem).toHaveBeenCalledWith('near_you_use_device');
  });

  it('saves "Use my location" and forgets the picked place', async () => {
    await savePhoneLocationChoice(null);
    expect(storage.removeItem).toHaveBeenCalledWith('manual_location');
    expect(storage.setItem).toHaveBeenCalledWith('near_you_use_device', true);
  });
});
