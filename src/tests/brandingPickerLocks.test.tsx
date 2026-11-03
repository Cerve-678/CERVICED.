import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import ProviderThemePicker, { type ThemeSelection } from '../components/ProviderThemePicker';
import ProviderFontPicker from '../components/ProviderFontPicker';
import { LINK_ONLY_THEME_COLLECTIONS, PROVIDER_THEMES } from '../constants/providerThemes';
import { LINK_ONLY_FONT_COLLECTIONS, PROVIDER_FONTS } from '../constants/providerFonts';

jest.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => {}) }));

const selection: ThemeSelection = {
  themeChoice: 'app',
  customBackdrop: '#E3C7CF',
  customCard: '#F9E9EE',
  customAccent: '#D98BA6',
  sheetColor: '#F5F1EC',
};
const colours = { textColor: '#000', subColor: '#777', borderColor: '#ccc' };

const classicTheme = PROVIDER_THEMES.find(t => t.collection === 'classics')!;
const newTheme = PROVIDER_THEMES.find(t => t.collection !== 'classics')!;
const classicFont = PROVIDER_FONTS.find(f => f.collection === 'classics')!;
const newFont = PROVIDER_FONTS.find(f => f.collection !== 'classics')!;

describe('link-only Branding limits', () => {
  it('only unlocks Classics', () => {
    expect(LINK_ONLY_THEME_COLLECTIONS).toEqual(['classics']);
    expect(LINK_ONLY_FONT_COLLECTIONS).toEqual(['classics']);
  });

  it('colour sets outside the unlocked collections, and Custom, call onLockedPress instead of changing', () => {
    const onChange = jest.fn();
    const onLockedPress = jest.fn();
    render(
      <ProviderThemePicker
        value={selection}
        onChange={onChange}
        {...colours}
        sepColor="#eee"
        unlockedCollections={LINK_ONLY_THEME_COLLECTIONS}
        onLockedPress={onLockedPress}
      />,
    );

    fireEvent.press(screen.getByLabelText(`${newTheme.name}: ${newTheme.description}, locked`));
    fireEvent.press(screen.getByLabelText('Custom, locked'));
    expect(onChange).not.toHaveBeenCalled();
    expect(onLockedPress).toHaveBeenCalledTimes(2);

    fireEvent.press(screen.getByLabelText(`${classicTheme.name}: ${classicTheme.description}`));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ themeChoice: classicTheme.key }));
  });

  it('fonts outside the unlocked collections call onLockedPress instead of changing', () => {
    const onChange = jest.fn();
    const onLockedPress = jest.fn();
    render(
      <ProviderFontPicker
        value="default"
        onChange={onChange}
        accentColor="#5C4033"
        {...colours}
        cardColor="#fff"
        unlockedCollections={LINK_ONLY_FONT_COLLECTIONS}
        onLockedPress={onLockedPress}
      />,
    );

    fireEvent.press(screen.getByLabelText(`${newFont.name}, locked`));
    expect(onChange).not.toHaveBeenCalled();
    expect(onLockedPress).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByLabelText(classicFont.name));
    expect(onChange).toHaveBeenCalledWith(classicFont.key);
  });

  it('locks nothing when no limit is passed', () => {
    const onChange = jest.fn();
    render(<ProviderThemePicker value={selection} onChange={onChange} {...colours} sepColor="#eee" />);
    fireEvent.press(screen.getByLabelText(`${newTheme.name}: ${newTheme.description}`));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ themeChoice: newTheme.key }));
    expect(screen.queryByLabelText('Custom, locked')).toBeNull();
  });
});
