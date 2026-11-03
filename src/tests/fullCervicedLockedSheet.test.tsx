import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { FullCervicedLockedSheet } from '../features/providers/FullCervicedLockedSheet';

jest.mock('../contexts/ThemeContext', () => ({
  useTheme: () => ({
    palette: { card: '#FFFFFF', accent: '#5C4033', accentDim: '#eee', onAccent: '#FFFFFF', text: '#000000', sub: '#7E6667', border: '#eee' },
  }),
}));
jest.mock('../utils/bottomSafeGap', () => ({ useSystemBottomInset: () => 0 }));

describe('Locked full-member features open the perks sheet', () => {
  test('lists what full members unlock and what the pro can use now', () => {
    const ui = render(
      <FullCervicedLockedSheet visible title="Unlock the rest of your branding" note="You can use the Blend finish now." onClose={jest.fn()} onSeeMore={jest.fn()} />,
    );
    expect(ui.getByText('Unlock the rest of your branding')).toBeTruthy();
    for (const perk of ['Every colour set', 'Every font', 'Every hero finish', 'Make your own colours', 'Achievements']) {
      expect(ui.getByText(perk)).toBeTruthy();
    }
    expect(ui.getByText('You can use the Blend finish now.')).toBeTruthy();
  });

  test('See what full members get closes the sheet and opens the page', () => {
    const onClose = jest.fn();
    const onSeeMore = jest.fn();
    const ui = render(<FullCervicedLockedSheet visible title="Unlock Achievements" onClose={onClose} onSeeMore={onSeeMore} />);
    fireEvent.press(ui.getByText('See what full members get'));
    expect(onClose).toHaveBeenCalled();
    expect(onSeeMore).toHaveBeenCalled();
  });

  test('Not now only closes it', () => {
    const onClose = jest.fn();
    const onSeeMore = jest.fn();
    const ui = render(<FullCervicedLockedSheet visible title="Unlock Achievements" onClose={onClose} onSeeMore={onSeeMore} />);
    fireEvent.press(ui.getByText('Not now'));
    expect(onClose).toHaveBeenCalled();
    expect(onSeeMore).not.toHaveBeenCalled();
  });
});
