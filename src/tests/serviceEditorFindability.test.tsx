import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import ServiceEditorSheet, { EMPTY_SERVICE_VALUE, toEditorValue } from '../features/providers/ServiceEditorSheet';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Warning: 'warning', Success: 'success', Error: 'error' },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../utils/bottomSafeGap', () => ({ useSystemBottomInset: () => 0 }));

const palette = { bg: '#fff', card: '#fafafa', text: '#111', sub: '#888', border: '#eee', accent: '#AF9197' };

function open(props: Partial<React.ComponentProps<typeof ServiceEditorSheet>> = {}) {
  const onSave = jest.fn();
  render(
    <ServiceEditorSheet
      visible
      initial={EMPTY_SERVICE_VALUE}
      categoryName="Gel"
      fallbackKind="NAILS"
      isNew
      saving={false}
      palette={palette}
      onSave={onSave}
      onClose={jest.fn()}
      {...props}
    />,
  );
  return onSave;
}

const chip = (label: string) => screen.getByText(label).parent;

describe('ServiceEditorSheet findability', () => {
  it('ticks tags read from a typed name and offers the heading’s unticked', () => {
    open();
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Gel Overlay'), 'Slick French');
    expect(screen.getByText('Ticked from the name. Untick anything that’s wrong.')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'french' }).props['accessibilityState']).toEqual({ checked: true });
    expect(screen.getByRole('checkbox', { name: 'gel' }).props['accessibilityState']).toEqual({ checked: false });
    expect(chip('french')).toBeTruthy();
  });

  it('holds a new service back until a client could find and understand it', () => {
    const onSave = open();
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Gel Overlay'), 'Slick French');
    fireEvent.changeText(screen.getByPlaceholderText('35'), '30');
    fireEvent.changeText(screen.getByPlaceholderText('45'), '45');

    fireEvent.press(screen.getByText('Add service'));
    expect(screen.getByText(/Add a short description/)).toBeTruthy();

    fireEvent.changeText(screen.getByPlaceholderText("What's included, what to expect"), 'Glossy gel with a crisp French edge.');
    fireEvent.press(screen.getByText('Add service'));
    expect(screen.getByText('Choose who this service is for.')).toBeTruthy();

    fireEvent.press(screen.getByText('Everyone'));
    fireEvent.press(screen.getByText('Add service'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Slick French',
      audience: 'everyone',
      tags: expect.objectContaining({ techniqueTags: ['french'] }),
    }));
  });

  it('lets the provider untick a suggestion, and keeps it unticked as they type', () => {
    const onSave = open();
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Gel Overlay'), 'Slick French');
    fireEvent.press(screen.getByRole('checkbox', { name: 'gel' }));
    fireEvent.press(screen.getByRole('checkbox', { name: 'french' }));
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Gel Overlay'), 'Slick French Tips');
    expect(screen.getByRole('checkbox', { name: 'french' }).props['accessibilityState']).toEqual({ checked: false });

    fireEvent.changeText(screen.getByPlaceholderText('35'), '30');
    fireEvent.changeText(screen.getByPlaceholderText('45'), '45');
    fireEvent.changeText(screen.getByPlaceholderText("What's included, what to expect"), 'Glossy gel with a crisp French edge.');
    fireEvent.press(screen.getByText('Women'));
    fireEvent.press(screen.getByText('Add service'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      tags: expect.objectContaining({ techniqueTags: ['gel'] }),
    }));
  });

  it('offers a template’s description without writing it in', () => {
    open({ categoryName: 'Acrylic' });
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Gel Overlay'), 'Full set acrylic');
    const offer = screen.getByRole('button', { name: /^Use suggested description/ });
    expect(screen.getByPlaceholderText("What's included, what to expect").props['value']).toBe('');
    fireEvent.press(offer);
    expect(screen.getByPlaceholderText("What's included, what to expect").props['value']).toMatch(/acrylic extensions/);
  });

  it('leaves an existing service’s tags to the full editor, and never blocks its edit', () => {
    const onSave = open({
      isNew: false,
      initial: toEditorValue({
        name: 'Classic French', price: 30, duration_minutes: 45, description: 'Any colour',
        is_active: true, technique_tags: ['french'], audience: 'women',
      }),
    });
    expect(screen.queryByText('HELP CLIENTS FIND IT')).toBeNull();
    expect(screen.queryByText('WHO’S IT FOR?')).toBeNull();
    // A short description is pointed out, not a reason to refuse a price change.
    expect(screen.getByText(/Say a little more/)).toBeTruthy();
    fireEvent.press(screen.getByText('Save changes'));
    const draft = onSave.mock.calls[0][0];
    expect(draft).not.toHaveProperty('tags');
    expect(draft).not.toHaveProperty('audience');
  });

  it('offers tags and who-it’s-for on an existing service that has neither', () => {
    const onSave = open({
      isNew: false,
      categoryName: 'Volume Lashes',
      fallbackKind: 'LASHES',
      initial: toEditorValue({
        name: 'Volume spikes', price: 60, duration_minutes: 120, description: null, is_active: true,
      }),
    });
    expect(screen.getByRole('checkbox', { name: 'volume' }).props['accessibilityState']).toEqual({ checked: true });
    fireEvent.press(screen.getByText('Save changes'));
    expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({
      tags: expect.objectContaining({ techniqueTags: expect.arrayContaining(['volume']) }),
    }));
  });
});
