import {
  isTargetOnScreen,
  pickTourCardId,
  TOUR_SCAN_DEPTH,
} from '../utils/coachMarkTargets';

const SCREEN = { width: 390, height: 844 };

describe('isTargetOnScreen', () => {
  it('accepts a target fully inside the viewport', () => {
    expect(isTargetOnScreen({ x: 20, y: 100, width: 200, height: 40 }, SCREEN)).toBe(true);
  });

  // The regression this guard nearly broke: the home tours target the
  // floating tab bar via a precomputed rect that starts 80px from the
  // bottom. It is fully visible and must never be skipped.
  it('accepts the floating tab bar rect flush against the bottom inset', () => {
    const TAB_H = 50;
    const rect = { x: 32, y: SCREEN.height - 30 - TAB_H, width: SCREEN.width - 64, height: TAB_H };
    expect(isTargetOnScreen(rect, SCREEN)).toBe(true);
  });

  it('rejects a card scrolled below the fold', () => {
    expect(isTargetOnScreen({ x: 20, y: 900, width: 160, height: 220 }, SCREEN)).toBe(false);
  });

  it('rejects a target only slightly peeking in from the bottom', () => {
    // 30 of 220px visible — under the 60% threshold.
    expect(isTargetOnScreen({ x: 20, y: 814, width: 160, height: 220 }, SCREEN)).toBe(false);
  });

  it('rejects a zero-sized target', () => {
    expect(isTargetOnScreen({ x: 0, y: 0, width: 0, height: 0 }, SCREEN)).toBe(false);
  });
});

describe('pickTourCardId', () => {
  it('prefers the first priced card so heart and price share one tile', () => {
    const items = [
      { id: 'a' },
      { id: 'b' },
      { id: 'c', price: '£45' },
      { id: 'd', price: '£60' },
    ];
    expect(pickTourCardId(items)).toBe('c');
  });

  it('falls back to the first card when nothing near the top has a price', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(pickTourCardId(items)).toBe('a');
  });

  it('ignores a priced card deeper than the scan depth', () => {
    const items = [
      ...Array.from({ length: TOUR_SCAN_DEPTH }, (_, i) => ({ id: `p${i}` })),
      { id: 'priced', price: '£30' },
    ];
    expect(pickTourCardId(items)).toBe('p0');
  });

  it('returns null for an empty feed so the tour never arms', () => {
    expect(pickTourCardId([])).toBeNull();
  });
});
