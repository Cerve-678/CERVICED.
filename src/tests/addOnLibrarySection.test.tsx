import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { AddOnLibrarySection } from '../features/provider-registration/AddOnLibrarySection';
import { ADD_ON_GUIDE_STEPS } from '../features/provider-registration/AddOnGuide';
import type { AddOnLibraryItem } from '../features/provider-registration/addOnLibrary';
import type { AddOnPalette } from '../features/provider-registration/addOnUi';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Warning: 'warning' },
}));

const palette: AddOnPalette = {
  bg: '#F5F1EC', surface: '#EDE8E2', card: '#FFFFFF', accent: '#5C4033', onAccent: '#FFFFFF',
  text: '#000000', sub: '#7E6667', border: '#DDDDDD', isDark: false,
};

const categories = {
  Lashes: [
    { id: 1, dbId: 's1', name: 'Classic full set', addOnKeys: ['a1'] },
    { id: 2, dbId: 's2', name: 'Infill', addOnKeys: ['a1'] },
  ],
};

const lashRemoval: AddOnLibraryItem = {
  key: 'a1', dbId: 'a1', name: 'Lash removal', price: 10, description: '', extraMinutes: 15,
  isActive: true, appliesTo: 'categories', categoryNames: ['Lashes'],
};

describe('AddOnLibrarySection', () => {
  it('opens the guide and offers a first add-on when there are none', () => {
    const onNew = jest.fn();
    render(<AddOnLibrarySection library={[]} categories={categories} palette={palette} onEdit={() => {}} onNew={onNew} />);

    for (const step of ADD_ON_GUIDE_STEPS) expect(screen.getByText(step.title)).toBeTruthy();
    fireEvent.press(screen.getByText('Make your first add-on'));
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it('keeps the guide folded once there are add-ons, and opens it on tap', () => {
    render(<AddOnLibrarySection library={[lashRemoval]} categories={categories} palette={palette} onEdit={() => {}} onNew={() => {}} />);
    const firstStep = ADD_ON_GUIDE_STEPS[0]!.title;

    expect(screen.queryByText(firstStep)).toBeNull();
    // New add-ons start from the button beside + Add Category, not here.
    expect(screen.queryByText('Make your first add-on')).toBeNull();
    fireEvent.press(screen.getByText('How add-ons work'));
    expect(screen.getByText(firstStep)).toBeTruthy();
  });

  it('shows price, extra time and where it goes on each row, and edits on tap', () => {
    const onEdit = jest.fn();
    render(<AddOnLibrarySection library={[lashRemoval]} categories={categories} palette={palette} onEdit={onEdit} onNew={() => {}} />);

    expect(screen.getByText('£10')).toBeTruthy();
    expect(screen.getByText('+15 min')).toBeTruthy();
    expect(screen.getByText('All Lashes')).toBeTruthy();
    fireEvent.press(screen.getByText('Lash removal'));
    expect(onEdit).toHaveBeenCalledWith(lashRemoval);
  });
});
