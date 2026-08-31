import {
  tabBarRect,
  tabBarClearance,
  tabBarContentHeight,
  tabBarIndicatorFrame,
  TAB_BAR_INDICATOR_INSET,
  ANDROID_MAX_NAV_INSET,
} from '../utils/tabBarGeometry';

const SCREEN_W = 412; // typical Android phone, dp
const SCREEN_H = 915;
const THREE_BUTTON_NAV = 48;
const GESTURE_NAV = 16;

describe('tab bar geometry — Android bar', () => {
  const rectFor = (inset: number) => tabBarRect(true, SCREEN_W, SCREEN_H, inset);

  it('spans the full width, edge to edge', () => {
    const rect = rectFor(THREE_BUTTON_NAV);
    expect(rect.x).toBe(0);
    expect(rect.width).toBe(SCREEN_W);
  });

  it('reaches the bottom edge rather than floating above it', () => {
    const rect = rectFor(THREE_BUTTON_NAV);
    expect(rect.y + rect.height).toBe(SCREEN_H);
  });

  it('grows by the system navigation inset, so its buttons clear the system ones', () => {
    // The regression this fixes: the old code reserved a flat 20dp on Android,
    // less than a three-button nav bar, so the bar overlapped it.
    const gesture = rectFor(GESTURE_NAV);
    const buttons = rectFor(THREE_BUTTON_NAV);
    expect(buttons.height - gesture.height).toBe(THREE_BUTTON_NAV - GESTURE_NAV);
    expect(THREE_BUTTON_NAV).toBeGreaterThan(20);
  });

  it('keeps its own content height clear above the inset', () => {
    const rect = rectFor(THREE_BUTTON_NAV);
    expect(rect.height - THREE_BUTTON_NAV).toBe(tabBarContentHeight(true));
  });

  it('ignores a nonsense negative inset rather than shrinking', () => {
    expect(rectFor(-10).height).toBe(tabBarContentHeight(true));
  });
});

describe('tab bar geometry — iOS pill', () => {
  const rectFor = (inset: number) => tabBarRect(false, SCREEN_W, SCREEN_H, inset);

  it('floats inset from both sides and clear of the bottom', () => {
    const rect = rectFor(34);
    expect(rect.x).toBeGreaterThan(0);
    expect(rect.width).toBeLessThan(SCREEN_W);
    expect(rect.y + rect.height).toBeLessThan(SCREEN_H);
  });

  it('is unchanged by the safe-area inset — its fixed offset already clears it', () => {
    expect(rectFor(0)).toEqual(rectFor(48));
  });
});

describe('tab bar geometry — both platforms', () => {
  for (const isAndroid of [true, false]) {
    const platform = isAndroid ? 'Android' : 'iOS';

    it(`stays fully on screen at every plausible inset (${platform})`, () => {
      for (const inset of [0, 16, 24, 34, 48]) {
        const rect = tabBarRect(isAndroid, SCREEN_W, SCREEN_H, inset);
        expect(rect.y).toBeGreaterThan(0);
        expect(rect.y + rect.height).toBeLessThanOrEqual(SCREEN_H);
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(SCREEN_W);
      }
    });

    it(`reserves enough clearance to never cover a screen footer (${platform})`, () => {
      const rect = tabBarRect(isAndroid, SCREEN_W, SCREEN_H, ANDROID_MAX_NAV_INSET);
      expect(tabBarClearance(isAndroid)).toBeGreaterThanOrEqual(SCREEN_H - rect.y);
    });

    it(`tracks window width rather than assuming a device (${platform})`, () => {
      const narrow = tabBarRect(isAndroid, 320, SCREEN_H, 0);
      const wide = tabBarRect(isAndroid, 1024, SCREEN_H, 0);
      expect(wide.width).toBeGreaterThan(narrow.width);
    });
  }
});

describe('tab bar selection indicator', () => {
  const TAB_COUNT = 5;

  for (const isAndroid of [true, false]) {
    const platform = isAndroid ? 'Android' : 'iOS';
    const contentHeight = tabBarContentHeight(isAndroid);
    const tabWidth = SCREEN_W / TAB_COUNT;
    const frame = tabBarIndicatorFrame(isAndroid, tabWidth);

    it(`sits centred on the bar's CONTENT, not its padded box (${platform})`, () => {
      // The bug: on Android the bar's box includes the navigation inset as
      // padding, so centring against the whole box dropped the highlight
      // toward the system buttons. Equal space above and below proves it is
      // measured against the content height instead.
      const spaceAbove = frame.top;
      const spaceBelow = contentHeight - (frame.top + frame.height);
      expect(spaceAbove).toBe(spaceBelow);
      expect(spaceAbove).toBe(TAB_BAR_INDICATOR_INSET);
    });

    it(`never overflows the bar's content area (${platform})`, () => {
      expect(frame.top).toBeGreaterThanOrEqual(0);
      expect(frame.top + frame.height).toBeLessThanOrEqual(contentHeight);
      expect(frame.height).toBeGreaterThan(0);
    });

    it(`stays inside its own tab, whatever the tab count (${platform})`, () => {
      for (const count of [3, 4, 5, 6]) {
        const width = SCREEN_W / count;
        expect(tabBarIndicatorFrame(isAndroid, width).width).toBeLessThan(width);
      }
    });

    it(`stays fully rounded — radius is half its height (${platform})`, () => {
      expect(frame.borderRadius).toBe(frame.height / 2);
    });
  }

  it('is unchanged on iOS — the indicator is only re-anchored for Android', () => {
    // Previously centred by alignItems inside a 50pt pill: (50 - 40) / 2 = 5.
    const frame = tabBarIndicatorFrame(false, 100);
    expect(frame.top).toBe(5);
    expect(frame.height).toBe(40);
  });
});
