import { initialWindowMetrics } from 'react-native-safe-area-context';

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
