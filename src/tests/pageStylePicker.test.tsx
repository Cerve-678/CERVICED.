import React from 'react';
import { Image } from 'react-native';
import { render } from '@testing-library/react-native';

import PageStylePicker from '../components/PageStylePicker';
import { PAGE_STYLES } from '../constants/pageStyles';

jest.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => {}) }));
jest.mock('react-native-svg', () => {
  const Stub = () => null;
  return { __esModule: true, default: Stub, Path: Stub, Polygon: Stub, Circle: Stub, Rect: Stub, Defs: Stub, Pattern: Stub, G: Stub, Line: Stub, Ellipse: Stub, LinearGradient: Stub, RadialGradient: Stub, Stop: Stub, Text: Stub, TextPath: Stub };
});

function renderPicker(backgroundImage: string | null) {
  return render(
    <PageStylePicker
      value="classic"
      onChange={() => {}}
      gradient={['#4A2C20', '#F5F1EC']}
      accent="#4A2C1E"
      sheet="#F5F1EC"
      cardColour="#FFFFFF"
      textColor="#000"
      subColor="#777"
      borderColor="#ccc"
      backgroundImage={backgroundImage}
    />,
  );
}

describe('Page Style thumbnails', () => {
  it('draws every style', () => {
    const view = renderPicker(null);
    for (const style of PAGE_STYLES) {
      expect(view.getByText(style.name)).toBeTruthy();
    }
  });

  it('shows their background photo behind every thumbnail, as the profile does', () => {
    const view = renderPicker('https://example.com/bg.jpg');
    const photos = view.UNSAFE_getAllByType(Image).filter(image => (image.props['source'] as { uri?: string } | undefined)?.uri === 'https://example.com/bg.jpg');
    expect(photos).toHaveLength(PAGE_STYLES.length);
  });

  it('draws no photo when they have none', () => {
    const view = renderPicker(null);
    expect(view.UNSAFE_queryAllByType(Image)).toHaveLength(0);
  });
});
