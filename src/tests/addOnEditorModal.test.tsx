import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { AddOnEditorModal } from '../features/provider-registration/AddOnEditorModal';
import type { AddOnLibraryItem } from '../features/provider-registration/addOnLibrary';
import type { AddOnPalette } from '../features/provider-registration/addOnUi';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Warning: 'warning' },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const palette: AddOnPalette = {
  bg: '#F5F1EC', surface: '#EDE8E2', card: '#FFFFFF', accent: '#5C4033', onAccent: '#FFFFFF',
  text: '#000000', sub: '#7E6667', border: '#DDDDDD', isDark: false,
};

const categories = {
  Lashes: [
    { id: 1, dbId: 's1', name: 'Classic full set', addOnKeys: ['a1'] },
    { id: 2, dbId: 's2', name: 'Infill', addOnKeys: [] },
  ],
};

const lowerLashes: AddOnLibraryItem = {
  key: 'a1', dbId: 'a1', name: 'Lower lashes', price: 8, description: 'Bottom lashes added to your set', extraMinutes: 10,
  isActive: true, appliesTo: 'services', categoryNames: [],
};

const open = (item: AddOnLibraryItem | null) => render(
  <AddOnEditorModal visible item={item} categories={categories} palette={palette} onClose={() => {}} onSave={() => {}} onDelete={() => {}} />,
);

describe('AddOnEditorModal', () => {
  it('explains every section, not just some', () => {
    open(null);
    expect(screen.getByText('An extra clients can add to a service when they book.')).toBeTruthy();
    expect(screen.getByText(/Clients see this name and price when they book/)).toBeTruthy();
    expect(screen.getByText('The appointment gets this much longer when a client picks it.')).toBeTruthy();
    expect(screen.getByText(/A line or two on what the client gets/)).toBeTruthy();
    expect(screen.getByText('Choose which services clients can add it to.')).toBeTruthy();
    expect(screen.getByText(/Switch off to pause it everywhere/)).toBeTruthy();
  });

  it('titles the sheet with the add-on being edited, grouped services and the client preview', () => {
    open(lowerLashes);
    expect(screen.getByText('EDIT ADD-ON')).toBeTruthy();
    expect(screen.getAllByText('Lower lashes').length).toBeGreaterThan(0);
    expect(screen.getByText('1 of 2')).toBeTruthy();
    expect(screen.getByText('+£8')).toBeTruthy();
    expect(screen.getByText('Delete add-on')).toBeTruthy();
  });

  it('offers no delete for a new add-on', () => {
    open(null);
    expect(screen.getByText('NEW ADD-ON')).toBeTruthy();
    expect(screen.queryByText('Delete add-on')).toBeNull();
  });
});
