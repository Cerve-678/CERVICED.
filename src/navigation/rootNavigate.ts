/**
 * Navigation performed through the root ref, from outside any screen.
 *
 * Two callers need this: `notificationTapHandler` (runs before any screen
 * exists) and `NotificationsScreen` (schedules navigation for *after* it has
 * dismissed itself, at which point its own `navigation` prop is dead). Both
 * used to carry their own copy of the nested-navigate logic; keeping one copy
 * here is what stops them drifting apart again.
 */

import { navigationRef } from './navigationRef';

/**
 * Deep-link into a screen inside a tab's stack.
 *
 * Always routes through an explicit tab rather than dispatching a bare screen
 * name. A bare `navigate('Bookings')` is handled by neither the root stack nor
 * the tab navigator, so it falls through to whichever tab happens to be focused
 * — landing the user in the Becca/Cart/Profile copy of the screen, or doing
 * nothing at all on Explore, which has no Bookings screen.
 *
 * `initial: false` is what puts the tab's root screen UNDERNEATH the target.
 * Without it, a nested navigate into a stack that hasn't mounted yet (bottom
 * tabs are lazy) initialises that stack with the target as its ONLY route — so
 * going back has nothing to pop, bubbles up to the tab navigator, and switches
 * tabs instead of returning to the screen the user expects.
 */
export function navigateNested(
  tab: string,
  screen: string,
  params?: Record<string, unknown>,
): void {
  if (!navigationRef.isReady()) return;
  (navigationRef as any).navigate(tab, { screen, params, initial: false });
}

/**
 * Switch to a tab and show its ROOT screen.
 *
 * Distinct from navigateNested(): that one pushes a screen on top of a tab's
 * root, so asking it for the root itself would try to stack the root under
 * itself. Use this when the destination *is* the tab's first screen — e.g. the
 * provider's own profile, which is the root of the MyServices tab.
 */
export function navigateTab(tab: string): void {
  if (!navigationRef.isReady()) return;
  (navigationRef as any).navigate(tab);
}

/** Only one dismiss-then-navigate can be in flight at a time — a second tap
 *  supersedes the first rather than firing two navigations in a row. */
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Run a navigation action once a dismissing screen has actually gone away.
 *
 * Module-scoped on purpose, and this is the whole point of the file: the caller
 * is the screen being dismissed, and that screen's unmount cleanup clears the
 * timers it owns. A screen-owned timer for the *onward* navigation is therefore
 * guaranteed to be cancelled by the very dismiss it was waiting on, so the
 * navigation silently never happens. That was the bug behind "tapping Open Chat
 * does nothing" — and it applied equally to Open Inbox, the provider's booking
 * deep-links, and every provider-profile link.
 *
 * `run` must navigate via `navigateNested`/`navigationRef`, never a screen's
 * captured `navigation` prop, which is no longer valid once it unmounts.
 */
export function navigateAfterDismiss(run: () => void, ms = 500): void {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    if (!navigationRef.isReady()) return;
    run();
  }, ms);
}
