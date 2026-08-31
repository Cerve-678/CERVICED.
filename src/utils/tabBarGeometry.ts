/**
 * Where the bottom tab bar sits, as pure maths.
 *
 * Kept out of the component so it can be reasoned about (and tested) for BOTH
 * platforms without loading the component's own dependencies — and so the two
 * coach-mark tours that spotlight the bar derive its position from the same
 * source the bar lays itself out from, rather than hand-copying constants and
 * drifting, which is what they used to do.
 */

export interface TabBarRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Pill height on iOS. */
export const TAB_BAR_PILL_HEIGHT = 50;
/** Bar content height on Android, above the system navigation inset. */
export const TAB_BAR_ANDROID_HEIGHT = 56;
/** Side margin the pill floats in, on iOS. */
export const TAB_BAR_SIDE_MARGIN = 32;
/** Gap between the pill and the bottom of the screen, on iOS. */
export const TAB_BAR_IOS_BOTTOM_OFFSET = 30;

/**
 * Worst-case Android system navigation inset — a three-button navigation bar.
 * Gesture navigation is far less. Only used where no hook can measure the real
 * inset; the bar itself always lays out against the live value.
 */
export const ANDROID_MAX_NAV_INSET = 48;

/** Content height of the bar, before any system inset is added. */
export function tabBarContentHeight(isAndroid: boolean): number {
  return isAndroid ? TAB_BAR_ANDROID_HEIGHT : TAB_BAR_PILL_HEIGHT;
}

/**
 * The bar's on-screen rectangle.
 *
 * Android spans the full width and runs to the bottom edge, absorbing the
 * navigation inset as its own height so its buttons stay above the system
 * ones. iOS floats: inset from both sides and clear of the bottom, and its
 * geometry deliberately ignores the safe-area inset, which the fixed 30pt
 * offset already clears.
 */
export function tabBarRect(
  isAndroid: boolean,
  screenWidth: number,
  screenHeight: number,
  bottomInset: number,
): TabBarRect {
  if (isAndroid) {
    const height = TAB_BAR_ANDROID_HEIGHT + Math.max(0, bottomInset);
    return { x: 0, y: screenHeight - height, width: screenWidth, height };
  }
  return {
    x: TAB_BAR_SIDE_MARGIN,
    y: screenHeight - TAB_BAR_IOS_BOTTOM_OFFSET - TAB_BAR_PILL_HEIGHT,
    width: screenWidth - TAB_BAR_SIDE_MARGIN * 2,
    height: TAB_BAR_PILL_HEIGHT,
  };
}

/**
 * How much vertical space the bar occupies measured up from the bottom of the
 * screen — its own height plus, on iOS, the gap it floats above.
 *
 * This is what a floating control (the provider FAB) or a scroll view's bottom
 * padding has to clear. Unlike {@link tabBarClearance} it takes the live inset,
 * so use it anywhere a hook can actually measure.
 */
export function tabBarOccupiedHeight(isAndroid: boolean, bottomInset: number): number {
  return isAndroid
    ? TAB_BAR_ANDROID_HEIGHT + Math.max(0, bottomInset)
    : TAB_BAR_IOS_BOTTOM_OFFSET + TAB_BAR_PILL_HEIGHT;
}

/** Inset of the sliding selection indicator inside the bar, on every edge. */
export const TAB_BAR_INDICATOR_INSET = 5;

/**
 * The sliding selection indicator's own frame.
 *
 * Deliberately explicit rather than left to the parent's `alignItems: 'center'`
 * and a `height: '100%'` tab button. On Android the bar carries the navigation
 * inset as bottom padding, so "full height" and "centred" both resolve against
 * a box that is taller than the part the icons actually occupy — which drifted
 * the indicator and the icons down toward the system buttons, and disagreed
 * with each other. Positioning against the CONTENT height fixes both.
 *
 * On iOS this reproduces the previous centred layout exactly: content height
 * is the pill height, so `top` lands on the same inset it always did.
 */
export function tabBarIndicatorFrame(
  isAndroid: boolean,
  tabWidth: number,
): { top: number; width: number; height: number; borderRadius: number } {
  const inset = TAB_BAR_INDICATOR_INSET;
  const height = tabBarContentHeight(isAndroid) - inset * 2;
  return {
    top: inset,
    width: tabWidth - inset * 2,
    height,
    borderRadius: height / 2,
  };
}

/**
 * How much bottom clearance a screen's own fixed footer needs so the bar
 * doesn't cover it and block taps.
 *
 * Android reserves the worst-case navigation inset rather than the real one:
 * several screens read this inside `StyleSheet.create`, where no hook can run.
 * Over-reserving costs a few px of padding on a gesture-navigation phone;
 * under-reserving puts a submit button back under the bar, which is the bug
 * this exists to prevent.
 */
export function tabBarClearance(isAndroid: boolean): number {
  return isAndroid
    ? TAB_BAR_ANDROID_HEIGHT + ANDROID_MAX_NAV_INSET + 10
    : TAB_BAR_IOS_BOTTOM_OFFSET + TAB_BAR_PILL_HEIGHT + 10;
}
