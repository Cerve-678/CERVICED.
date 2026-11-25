import React from 'react';
import { render } from '@testing-library/react-native';
import { ReadableWidth, useContentWidth } from '../components/ReadableWidth';
import { READABLE_MAX_WIDTH } from '../constants/readableWidth';

jest.mock('../contexts/ThemeContext', () => ({ useTheme: () => ({ palette: { bg: '#fff' } }) }));

let mockWindow = { width: 390, height: 844, scale: 2, fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

function windowOf(width: number, height: number): void {
  mockWindow = { width, height, scale: 2, fontScale: 1 };
}

/** Renders a screen inside the wrapper and reports the width it was told it has. */
function contentWidthInside(): number {
  let seen = -1;
  function Probe(): null {
    seen = useContentWidth().width;
    return null;
  }
  render(<ReadableWidth><Probe /></ReadableWidth>);
  return seen;
}

describe('ReadableWidth', () => {
  it('keeps an iPad held upright to the readable column', () => {
    windowOf(1032, 1376); // iPad Pro 13" portrait
    expect(contentWidthInside()).toBe(READABLE_MAX_WIDTH);
  });

  it('fills the screen when the iPad is turned sideways', () => {
    windowOf(1376, 1032); // iPad Pro 13" landscape
    expect(contentWidthInside()).toBe(1376);
  });

  it('leaves a phone alone', () => {
    windowOf(390, 844);
    expect(contentWidthInside()).toBe(390);
  });

  it('keeps the same views mounted when the iPad rotates, so the screen keeps its state', () => {
    let mounts = 0;
    function Counter(): null {
      React.useEffect(() => { mounts += 1; }, []);
      return null;
    }
    windowOf(1032, 1376);
    const { rerender } = render(<ReadableWidth><Counter /></ReadableWidth>);
    windowOf(1376, 1032);
    rerender(<ReadableWidth><Counter /></ReadableWidth>);
    expect(mounts).toBe(1);
  });
});
