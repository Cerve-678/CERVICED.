import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PackFormHint } from '../features/info-packs/PackFormHint';
import { recordTourSeen, resolveTourForUser } from '../services/tourService';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('../services/tourService', () => ({ resolveTourForUser: jest.fn(), recordTourSeen: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../utils/logger', () => ({ logger: { error: jest.fn() } }));

const palette = { card: '#fff', text: '#000', sub: '#777', border: '#eee', accent: '#5C4033' };
const props = { tour: 'provider_service_pack_tip' as const, title: 'Aftercare?', body: 'Put it in an Info Pack.', note: 'Saves this service first.', palette };

beforeEach(() => jest.clearAllMocks());

test('shows the card first; closing it leaves only the lines, and remembers that', async () => {
  (resolveTourForUser as jest.Mock).mockResolvedValue({ show: true, steps: [{ key: 'tip' }], stampVersion: 1 });
  const onOpen = jest.fn();
  const ui = render(<PackFormHint {...props} onOpen={onOpen} />);
  await waitFor(() => expect(ui.getByText('Aftercare?')).toBeTruthy());
  expect(ui.getByText('Saves this service first.')).toBeTruthy();
  fireEvent.press(ui.getByRole('button', { name: 'Hide this tip' }));
  expect(recordTourSeen).toHaveBeenCalledWith('provider_service_pack_tip', 'u1');
  expect(ui.queryByText('Aftercare?')).toBeNull();
  fireEvent.press(ui.getByRole('link', { name: /Ask with a Form/ }));
  expect(onOpen).toHaveBeenCalledWith('forms');
});

test('using the card counts as seeing it', async () => {
  (resolveTourForUser as jest.Mock).mockResolvedValue({ show: true, steps: [{ key: 'tip' }], stampVersion: 1 });
  const onOpen = jest.fn();
  const ui = render(<PackFormHint {...props} onOpen={onOpen} />);
  await waitFor(() => expect(ui.getByText('INFO PACK')).toBeTruthy());
  fireEvent.press(ui.getByText('INFO PACK'));
  expect(onOpen).toHaveBeenCalledWith('packs');
  expect(recordTourSeen).toHaveBeenCalledTimes(1);
});

test('once seen, only the lines show', async () => {
  (resolveTourForUser as jest.Mock).mockResolvedValue({ show: false });
  const ui = render(<PackFormHint {...props} onOpen={jest.fn()} />);
  await waitFor(() => expect(ui.getByRole('link', { name: /Send it with their booking/ })).toBeTruthy());
  expect(ui.queryByText('Aftercare?')).toBeNull();
});
