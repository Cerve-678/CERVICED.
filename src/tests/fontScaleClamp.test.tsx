import React from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import type { TextInputInstance } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { applyFontScaleClamp, composeAppearanceStyle, MAX_FONT_SCALE, osMultiplierFor } from '../utils/fontScaleClamp';
import { setTextAppearance } from '../utils/textAppearanceStore';

// The clamp swaps the shared Text/TextInput exports, so it is applied once
// here exactly as App.tsx applies it at startup.
applyFontScaleClamp();

describe('font scale clamp', () => {
  it('caps how far the OS font setting can enlarge ordinary text', () => {
    const { getByText } = render(<Text>Book now</Text>);
    expect(getByText('Book now').props['maxFontSizeMultiplier']).toBe(MAX_FONT_SCALE);
  });

  it('caps text inputs too, not just text', () => {
    const { getByPlaceholderText } = render(<TextInput placeholder="Search" />);
    expect(getByPlaceholderText('Search').props['maxFontSizeMultiplier']).toBe(MAX_FONT_SCALE);
  });

  it('lets a call site that sets its own limit win', () => {
    const { getByText } = render(<Text maxFontSizeMultiplier={1}>Fixed</Text>);
    expect(getByText('Fixed').props['maxFontSizeMultiplier']).toBe(1);
  });

  it('still delivers a ref to the wrapped input, so focus() keeps working', () => {
    const ref = React.createRef<TextInputInstance>();
    render(<TextInput ref={ref} placeholder="Notes" />);
    expect(ref.current).not.toBeNull();
  });

  it('is idempotent, so repeat calls cannot stack wrappers', () => {
    applyFontScaleClamp();
    applyFontScaleClamp();
    const { getByText } = render(<Text>Still capped</Text>);
    expect(getByText('Still capped').props['maxFontSizeMultiplier']).toBe(MAX_FONT_SCALE);
  });

  it('is a ceiling, not a freeze — enlarged system fonts still take effect', () => {
    // A frozen size would be 1. Anything above that means the user's own
    // accessibility setting still has an effect, up to the cap.
    expect(MAX_FONT_SCALE).toBeGreaterThan(1);
  });
});

describe('in-app text size', () => {
  afterEach(() => act(() => setTextAppearance({ scale: 1, fontFamily: undefined })));

  const flatStyle = (node: { props: Record<string, unknown> }) =>
    StyleSheet.flatten(node.props['style'] as never) as Record<string, unknown>;

  it('grows line height and letter spacing with the font size, so lines do not overlap', () => {
    setTextAppearance({ scale: 1.3, fontFamily: undefined });
    const { getByText } = render(
      <Text style={{ fontSize: 20, lineHeight: 30, letterSpacing: 1 }}>Your booking</Text>,
    );
    const style = flatStyle(getByText('Your booking'));
    expect(style['fontSize']).toBeCloseTo(26);
    expect(style['lineHeight']).toBeCloseTo(39);
    expect(style['letterSpacing']).toBeCloseTo(1.3);
  });

  it('leaves fixed-size glyphs (icons, badge marks) at the size their box was drawn for', () => {
    setTextAppearance({ scale: 1.3, fontFamily: undefined });
    const { getByText } = render(
      <Text allowFontScaling={false} style={{ fontSize: 14, lineHeight: 20 }}>!</Text>,
    );
    const style = flatStyle(getByText('!'));
    expect(style['fontSize']).toBe(14);
    expect(style['lineHeight']).toBe(20);
  });

  it('does not invent a line height where the call site set none', () => {
    expect(composeAppearanceStyle({ fontSize: 10 }, { scale: 1.15, fontFamily: undefined }))
      .toEqual([{ fontSize: 10 }, { fontSize: 11.5 }]);
  });

  it('never lets the phone setting and the in-app size stack past the overall cap', () => {
    for (const appScale of [1.06, 1.12]) {
      expect(appScale * osMultiplierFor(appScale)).toBeCloseTo(MAX_FONT_SCALE);
    }
    expect(osMultiplierFor(0.92)).toBe(MAX_FONT_SCALE);
    act(() => setTextAppearance({ scale: 1.12, fontFamily: undefined }));
    const { getByText } = render(<Text style={{ fontSize: 14 }}>Larger</Text>);
    expect(getByText('Larger').props['maxFontSizeMultiplier']).toBeCloseTo(MAX_FONT_SCALE / 1.12);
  });
});
