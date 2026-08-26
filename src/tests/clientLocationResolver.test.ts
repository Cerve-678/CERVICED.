import {
  resolveClientLocation,
  COARSE_ACCURACY_THRESHOLD_M,
} from '../services/clientLocationService';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  geocodeAsync: jest.fn(),
}));
jest.mock('../utils/storage', () => ({
  storage: { getItem: jest.fn() },
  STORAGE_KEYS: { MANUAL_LOCATION: 'manual_location' },
}));

const Location = require('expo-location');
const { storage } = require('../utils/storage');

const position = (accuracy: number | null) => ({
  coords: { latitude: 53.48, longitude: -2.24, accuracy },
});

describe('resolveClientLocation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reports a device fix as gps, with no city label', async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Location.getCurrentPositionAsync.mockResolvedValue(position(35));

    const result = await resolveClientLocation();
    expect(result.source).toBe('gps');
    expect(result.isCoarse).toBe(false);
    expect(result.cityLabel).toBeNull();
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

  it('falls back to the saved city, and says that is what it did', async () => {
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
    storage.getItem.mockResolvedValue('Manchester, UK');
    Location.geocodeAsync.mockResolvedValue([{ latitude: 53.48, longitude: -2.24 }]);

    const result = await resolveClientLocation();
    // A centroid is exact as a coordinate and wrong as a position, so the
    // caller must be able to tell it apart from a real fix — that is the whole
    // point of `source` existing rather than callers checking for null coords.
    expect(result.source).toBe('saved-city');
    expect(result.cityLabel).toBe('Manchester, UK');
    expect(result.isCoarse).toBe(false);
  });

  it('returns unknown rather than throwing when there is nothing to go on', async () => {
    Location.requestForegroundPermissionsAsync.mockRejectedValue(new Error('no location services'));
    storage.getItem.mockResolvedValue(null);

    const result = await resolveClientLocation();
    expect(result).toEqual({ coords: null, source: 'unknown', cityLabel: null, isCoarse: false });
  });
});
