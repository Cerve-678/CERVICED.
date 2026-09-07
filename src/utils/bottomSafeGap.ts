import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * The system's bottom inset — Android's navigation bar, or the iOS home
 * indicator — read once at startup.
 *
 * Deliberately the static value rather than `useSafeAreaInsets()`. Most places
 * that need to reserve this space are `StyleSheet.create` entries, where no
 * hook can run, and several are bottom sheets whose whole layout is one style
 * object. `initialWindowMetrics` comes straight off the native constants at
 * module load, so it is the device's real inset, not a guess.
 *
 * The trade-off is that it does not update if the inset changes at runtime.
 * For the bottom edge that is fine: the navigation bar's height doesn't change
 * while the app is open. Anywhere the value genuinely has to react — the tab
 * bar itself — uses the hook instead.
 */
export const SYSTEM_BOTTOM_INSET = initialWindowMetrics?.insets.bottom ?? 0;

/**
 * Breathing room to leave at the end of scrollable content, and beneath a
 * bottom-anchored sheet, so nothing lands under the system navigation bar.
 *
 * This matters more since the app's transparent modals became
 * `navigationBarTranslucent` — that makes their dim backdrop reach the screen
 * edges (it used to stop short and read as a floating grey square), but it
 * also means a sheet pinned to the bottom of that window now extends under the
 * navigation bar unless it reserves the inset itself.
 */
export const BOTTOM_SAFE_GAP = SYSTEM_BOTTOM_INSET + 16;

/**
 * The live counterpart of `SYSTEM_BOTTOM_INSET`, for anything rendered inside
 * a `<Modal>`. Add your own breathing room on top of it the way
 * `BOTTOM_SAFE_GAP` does, or use it bare to seat content directly above the
 * home indicator.
 *
 * Two things make the module-load snapshot the wrong tool inside a modal:
 *
 * 1. `initialWindowMetrics` is `window.safeAreaInsets` sampled at JS module
 *    load, which on iOS can land before the window's first layout pass and
 *    read all zeros. `SYSTEM_BOTTOM_INSET` is then 0 for the whole session
 *    and every sheet reserving `BOTTOM_SAFE_GAP` gets 16pt against a 34pt
 *    home indicator.
 * 2. `<SafeAreaView>` cannot cover for it there. It resolves its insets from
 *    the nearest `RNCSafeAreaProvider` in the *UIKit* superview chain, and a
 *    modal is presented outside the app root's hierarchy, so the lookup falls
 *    back to the view itself. Nothing then posts the `RNCSafeAreaDidChange`
 *    notification it listens on, and it has no `layoutSubviews` /
 *    `safeAreaInsetsDidChange` hook, so the zero it samples at
 *    `didMoveToWindow` is the value it keeps forever. A `<SafeAreaView>`
 *    inside a modal is inert, not merely late.
 *
 * `useSafeAreaInsets()` reads React context, which crosses the modal boundary
 * and updates once the root provider has measured, so it is correct where
 * both of the above are wrong. The `max` keeps whichever source has actually
 * resolved, so neither a cold context nor a zeroed snapshot can win.
 */
export function useSystemBottomInset(): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, SYSTEM_BOTTOM_INSET);
}
