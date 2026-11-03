import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import ProviderThemePicker, { type ThemeSelection } from '../components/ProviderThemePicker';
import ProviderFontPicker from '../components/ProviderFontPicker';
import { LINK_ONLY_THEMES, PROVIDER_THEMES } from '../constants/providerThemes';
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

const freeTheme = PROVIDER_THEMES.find(t => t.key === 'blush')!;
// In Classics, beside the free four, but still locked.
const lockedClassic = PROVIDER_THEMES.find(t => t.collection === 'classics' && !LINK_ONLY_THEMES.includes(t.key))!;
const newTheme = PROVIDER_THEMES.find(t => t.collection !== 'classics')!;
const classicFont = PROVIDER_FONTS.find(f => f.collection === 'classics')!;
const newFont = PROVIDER_FONTS.find(f => f.collection !== 'classics')!;

describe('link-only Branding limits', () => {
  it('unlocks App, Blush, Grey and Charcoal, and the Classics fonts', () => {
    expect(PROVIDER_THEMES.filter(t => LINK_ONLY_THEMES.includes(t.key)).map(t => t.name)).toEqual(['App', 'Blush', 'Grey', 'Charcoal']);
    expect(LINK_ONLY_FONT_COLLECTIONS).toEqual(['classics']);
  });

  it('colour sets outside the four, and Custom, call onLockedPress instead of changing', () => {
    const onChange = jest.fn();
    const onLockedPress = jest.fn();
    render(
      <ProviderThemePicker
        value={selection}
        onChange={onChange}
        {...colours}
        sepColor="#eee"
        unlockedThemes={LINK_ONLY_THEMES}
        onLockedPress={onLockedPress}
      />,
    );

    fireEvent.press(screen.getByLabelText(`${newTheme.name}: ${newTheme.description}, locked`));
    fireEvent.press(screen.getByLabelText(`${lockedClassic.name}: ${lockedClassic.description}, locked`));
    fireEvent.press(screen.getByLabelText('Custom, locked'));
    expect(onChange).not.toHaveBeenCalled();
    expect(onLockedPress).toHaveBeenCalledTimes(3);

    fireEvent.press(screen.getByLabelText(`${freeTheme.name}: ${freeTheme.description}`));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ themeChoice: freeTheme.key }));
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
