import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ReleaseDayPicker } from '../features/business-details/ReleaseDayPicker';

// "It needs to require me to fill it in instead of already being prefilled,
// and then I accidentally save it." With nothing chosen the wheels say so and
// Done can't close the sheet as if a day had been picked.

const colours = { accentColor: '#AF9197', cardColor: '#FFFFFF', textColor: '#111111', subColor: '#777777', borderColor: '#DDDDDD' };

function renderPicker(value: number | null, time: string | null) {
  const onClose = jest.fn();
  render(
    <ReleaseDayPicker visible value={value} time={time} onSelect={jest.fn()} onSelectTime={jest.fn()} onClose={onClose} {...colours} />,
  );
  return onClose;
}

describe('ReleaseDayPicker: a release day is chosen, never prefilled', () => {
  // The wheels are native views in tests, so their rows ("Choose a day") aren't
  // readable here; the gate that stops an accidental save is the Done button.
  it('with nothing picked, Done says what is missing and does not close', () => {
    const onClose = renderPicker(null, null);
    fireEvent.press(screen.getByText('Pick a day and a time'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('still waits when only the day is picked', () => {
    renderPicker(5, null);
    expect(screen.getByText('Pick a day and a time')).toBeTruthy();
  });

  it('closes on Done once both are picked', () => {
    const onClose = renderPicker(5, '19:00');
    fireEvent.press(screen.getByText('Done'));
    expect(onClose).toHaveBeenCalled();
  });
});
