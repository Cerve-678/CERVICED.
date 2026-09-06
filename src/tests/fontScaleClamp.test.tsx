import React from 'react';
import { Text, TextInput } from 'react-native';
import { render } from '@testing-library/react-native';
import { applyFontScaleClamp, MAX_FONT_SCALE } from '../utils/fontScaleClamp';

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
    const ref = React.createRef<TextInput>();
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
