import fs from 'fs';
import path from 'path';
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AboutYouScreen from '../screens/provider/AboutYouScreen';
import { getMyProviderProfile, updateProviderContactDetails } from '../services/databaseService';
import { geocodePublicLocation } from '../services/providerRegistrationService';

let pickArea: (area: string) => void = () => undefined;

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));
jest.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({ isDarkMode: false, palette: new Proxy({}, { get: () => '#1A1815' }), theme: {} }),
}));
jest.mock('../components/AreaPicker', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({ value, onChange }: { value: string; onChange: (area: string) => void }) => {
      pickArea = onChange;
      return <Text>{`area:${value}`}</Text>;
    },
  };
});
jest.mock('../components/CityMultiSelect', () => ({ CityMultiSelect: () => null }));
jest.mock('../services/databaseService', () => ({
  getMyProviderProfile: jest.fn(),
  updateProviderContactDetails: jest.fn(async () => undefined),
}));
jest.mock('../services/providerRegistrationService', () => ({
  geocodePublicLocation: jest.fn(),
}));

const profile = {
  id: 'p1',
  location_text: 'Hackney, London',
  service_locations: ['London'],
  accepts_new_clients: 'waitlist',
  walk_ins_welcome: false,
  group_bookings_available: true,
};

const navigation = { goBack: jest.fn() };

async function openScreen() {
  render(<AboutYouScreen navigation={navigation} />);
  await screen.findByText('area:Hackney, London');
}

const savedPatch = () => (updateProviderContactDetails as jest.Mock).mock.calls[0][1];

async function save() {
  fireEvent.press(screen.getByText(/^Save/));
  await waitFor(() => expect(updateProviderContactDetails).toHaveBeenCalled());
}

beforeEach(() => {
  jest.clearAllMocks();
  (getMyProviderProfile as jest.Mock).mockResolvedValue(profile);
});

it('shows the place set in InfoReg, and leaves it and its coordinates alone if unchanged', async () => {
  await openScreen();
  await save();
  expect(geocodePublicLocation).not.toHaveBeenCalled();
  expect(savedPatch()).not.toHaveProperty('location_text');
  expect(savedPatch()).not.toHaveProperty('latitude');
});

it('saves a new place with the coordinates it geocoded to', async () => {
  (geocodePublicLocation as jest.Mock).mockResolvedValue({ latitude: 51.28, longitude: 1.08 });
  await openScreen();
  act(() => pickArea('Wincheap, Canterbury'));
  await save();
  expect(geocodePublicLocation).toHaveBeenCalledWith('Wincheap, Canterbury');
  expect(savedPatch()).toMatchObject({ location_text: 'Wincheap, Canterbury', latitude: 51.28, longitude: 1.08 });
});

it('still saves a place that cannot be geocoded, without inventing coordinates', async () => {
  (geocodePublicLocation as jest.Mock).mockResolvedValue(null);
  await openScreen();
  act(() => pickArea('Somewhere, Kent'));
  await save();
  expect(savedPatch().location_text).toBe('Somewhere, Kent');
  expect(savedPatch()).not.toHaveProperty('latitude');
});

it('asks about new clients, walk-ins and group bookings, and saves the answers', async () => {
  await openScreen();
  expect(screen.getByText('Who You Take')).toBeTruthy();
  expect(screen.getByText('Walk-ins welcome')).toBeTruthy();
  expect(screen.getByText('Group bookings')).toBeTruthy();
  await save();
  expect(savedPatch()).toMatchObject({
    accepts_new_clients: 'waitlist',
    walk_ins_welcome: false,
    group_bookings_available: true,
  });
});

// Two screens saving their own copies of one answer is how one overwrites the other.
it('leaves About You as the only screen that edits who you take', () => {
  const dir = path.join(__dirname, '../screens/provider');
  for (const screenFile of ['SchedulingScreen.tsx', 'ServicesPricingScreen.tsx', 'BusinessInfoScreen.tsx']) {
    const code = fs.readFileSync(path.join(dir, screenFile), 'utf8').replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');
    expect(code).not.toMatch(/walk_ins_welcome\s*:|group_bookings_available\s*:|accepts_new_clients\s*:/);
  }
});
