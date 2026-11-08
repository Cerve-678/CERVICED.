// "Areas you cover" in Edit Profile edits providers.service_locations. Loading
// a profile must hand back exactly what was saved, in order, so the next save
// writes it back unchanged (and an emptied list saves as empty).

jest.mock('../services/databaseService', () => ({}));

import type { DbProvider } from '../types/database';
import { providerRowToRegistrationData } from '../services/providerRegistrationService';

const row = { display_name: 'Test', service_category: 'NAILS' } as unknown as DbProvider;

it('reads saved places back in the order they were added', () => {
  const saved = ['London', 'Chorlton, Manchester', 'Little Snoring'];
  expect(providerRowToRegistrationData({ ...row, service_locations: saved }).serviceLocations).toEqual(saved);
});

it('reads an empty or missing list as no places', () => {
  expect(providerRowToRegistrationData({ ...row, service_locations: [] }).serviceLocations).toEqual([]);
  expect(providerRowToRegistrationData({ ...row, service_locations: null }).serviceLocations).toEqual([]);
});
