// Edit Profile asks a mobile provider "How far you travel" (providers.
// travel_radius, "Travels up to …" on their profile). Its save must write it,
// clear it when blanked, and never wipe it from a form that predates the field.

jest.mock('../services/databaseService', () => ({}));

import type { DbProvider } from '../types/database';
import { providerRowToRegistrationData, travelRadiusPatch } from '../services/providerRegistrationService';

it('writes what the provider typed, trimmed', () => {
  expect(travelRadiusPatch({ travelRadius: ' 10 miles ' })).toEqual({ travel_radius: '10 miles' });
});

it('clears the column when the answer is blanked', () => {
  expect(travelRadiusPatch({ travelRadius: '' })).toEqual({ travel_radius: null });
  expect(travelRadiusPatch({ travelRadius: '   ' })).toEqual({ travel_radius: null });
});

it('leaves the column alone for a form cached before the field existed', () => {
  expect(travelRadiusPatch({})).toEqual({});
});

it('reads the saved value back into the form, and a missing one as blank', () => {
  const row = { display_name: 'Test', service_category: 'NAILS', travel_radius: '15 miles' } as unknown as DbProvider;
  expect(providerRowToRegistrationData(row).travelRadius).toBe('15 miles');
  expect(providerRowToRegistrationData({ ...row, travel_radius: null }).travelRadius).toBe('');
});
