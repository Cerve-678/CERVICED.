import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ProviderThemePicker, { type ThemeSelection } from '../components/ProviderThemePicker';

jest.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => {}) }));

const custom: ThemeSelection = {
  themeChoice: 'custom',
  customBackdrop: '#E3C7CF',
  customCard: '#F9E9EE',
  customAccent: '#D98BA6',
  sheetColor: '#F5F1EC',
};
// The app root has a GestureHandlerRootView; the colour square needs one here too.
const renderPicker = (ui: React.ReactElement) => render(<GestureHandlerRootView>{ui}</GestureHandlerRootView>);

const colours = { textColor: '#000', subColor: '#777', borderColor: '#ccc', sepColor: '#eee' };

describe('Branding → Custom colours', () => {
  it('sets whichever of the three colours is being edited from a photo swatch', () => {
    const onChange = jest.fn();
    renderPicker(<ProviderThemePicker value={custom} onChange={onChange} {...colours} photoColours={['#123456', '#ABCDEF']} />);

    // Accent is edited first.
    fireEvent.press(screen.getByLabelText('Use #123456 from your photos'));
    expect(onChange).toHaveBeenLastCalledWith({ ...custom, customAccent: '#123456' });

    fireEvent.press(screen.getByLabelText('Edit Card colour'));
    fireEvent.press(screen.getByLabelText('Use #ABCDEF from your photos'));
    expect(onChange).toHaveBeenLastCalledWith({ ...custom, customCard: '#ABCDEF' });

    fireEvent.press(screen.getByLabelText('Edit Backdrop colour'));
    fireEvent.press(screen.getByLabelText('Use #123456 from your photos'));
    expect(onChange).toHaveBeenLastCalledWith({ ...custom, customBackdrop: '#123456' });
  });

  it('takes a typed hex code once it is a whole colour', () => {
    const onChange = jest.fn();
    renderPicker(<ProviderThemePicker value={custom} onChange={onChange} {...colours} />);

    const hex = screen.getByLabelText('Hex colour code');
    fireEvent.changeText(hex, '#1D4');
    fireEvent.changeText(hex, '#1D4A');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ ...custom, customAccent: '#11DD44' });
    fireEvent.changeText(hex, '1d4a3c');
    expect(onChange).toHaveBeenLastCalledWith({ ...custom, customAccent: '#1D4A3C' });
  });

  it('hides the photo row when there are no photo colours and no way to choose one', () => {
    renderPicker(<ProviderThemePicker value={custom} onChange={jest.fn()} {...colours} />);
    expect(screen.queryByText('FROM YOUR PHOTOS')).toBeNull();
  });
});
