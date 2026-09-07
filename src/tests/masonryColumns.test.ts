import { masonryColumnsForWidth } from '../components/MasonryGrid';

describe('masonryColumnsForWidth', () => {
  it('keeps phones at two columns', () => {
    expect(masonryColumnsForWidth(390)).toBe(2); // iPhone 14/15 portrait
    expect(masonryColumnsForWidth(430)).toBe(2); // iPhone Pro Max portrait
    expect(masonryColumnsForWidth(599)).toBe(2);
  });

  it('opens up on tablet-width windows instead of stretching two columns', () => {
    expect(masonryColumnsForWidth(834)).toBe(3);  // iPad 11" portrait
    expect(masonryColumnsForWidth(1024)).toBe(4); // iPad Pro 12.9" portrait
    expect(masonryColumnsForWidth(1194)).toBe(4); // iPad 11" landscape
    expect(masonryColumnsForWidth(1366)).toBe(5); // iPad Pro 12.9" landscape
  });

  it('reads the window, not the device — split-screen narrows the count again', () => {
    // Same iPad, but the app is given half the screen.
    expect(masonryColumnsForWidth(507)).toBe(2);
  });

  it('never drops below two columns, however narrow the window gets', () => {
    expect(masonryColumnsForWidth(320)).toBe(2);
    expect(masonryColumnsForWidth(0)).toBe(2);
  });

  it('only ever widens as the window widens', () => {
    let previous = 0;
    for (let width = 0; width <= 1600; width += 10) {
      const columns = masonryColumnsForWidth(width);
      expect(columns).toBeGreaterThanOrEqual(previous);
      previous = columns;
    }
  });
});
