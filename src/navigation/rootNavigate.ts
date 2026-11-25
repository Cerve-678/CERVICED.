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
import { logger } from '../utils/logger';

type MaybeState = { routeNames?: string[]; routes?: { state?: MaybeState }[] } | undefined;

/** Whether any navigator currently mounted anywhere in the tree has a route
 *  called `name`. Only an initialised navigator state carries `routeNames`,
 *  so a tab tree that hasn't rendered yet doesn't count. */
function hasRoute(state: MaybeState, name: string): boolean {
  if (!state) return false;
  if (state.routeNames?.includes(name)) return true;
  return (state.routes ?? []).some(route => hasRoute(route.state, name));
}

/** Long enough for the provider's booking-mode lookup on a slow connection;
 *  short enough that a tap doesn't fire minutes later out of nowhere. */
const ROUTE_MOUNT_TIMEOUT_MS = 10_000;

/** Only one wait at a time: a newer navigation supersedes an older one still
 *  waiting, rather than both landing in a row once the tabs appear. */
let cancelPendingWait: (() => void) | null = null;

/**
 * Run `run` once a navigator holding `tab` is mounted — straight away if it
 * already is.
 *
 * A navigate fired at a tab that isn't mounted isn't queued, it's dropped
 * with "was not handled by any navigator". That is what a push tap did on
 * the provider hat while ProviderTabNavigation was still showing its spinner
 * (it draws no tabs until the booking mode is known), and it applies equally
 * to a tap that arrives while the sign-in screens are up.
 */
function whenTabMounted(tab: string, run: () => void): void {
  cancelPendingWait?.();
  cancelPendingWait = null;
  if (hasRoute(navigationRef.getRootState() as MaybeState, tab)) {
    run();
    return;
  }
  const stop = () => {
    unsubscribe();
    clearTimeout(timer);
    if (cancelPendingWait === stop) cancelPendingWait = null;
  };
  const unsubscribe = navigationRef.addListener('state', () => {
    if (!hasRoute(navigationRef.getRootState() as MaybeState, tab)) return;
    stop();
    run();
  });
  const timer = setTimeout(() => {
    stop();
    logger.warn(`[rootNavigate] '${tab}' never appeared; dropped the navigation`);
  }, ROUTE_MOUNT_TIMEOUT_MS);
  cancelPendingWait = stop;
}

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
  whenTabMounted(tab, () => {
    (navigationRef as any).navigate(tab, { screen, params, initial: false });
  });
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
  whenTabMounted(tab, () => {
    (navigationRef as any).navigate(tab);
  });
}

/**
 * Open one of the provider's bookings the way tapping it on the Home calendar
 * does: the calendar on that booking's day underneath, its detail page on top
 * (with the reschedule sheet up, when asked). Back lands on the calendar.
 *
 * One reset of the Home stack, not two navigates. Two in a row overwrite each
 * other's nested params before the stack re-renders, and in v7 a navigate to
 * ProviderHomeMain while something sits above it pushes a SECOND calendar
 * rather than returning to the first.
 */
export function openProviderBookingOnCalendar(
  bookingId: string,
  date: string,
  openReschedule: boolean,
): void {
  if (!navigationRef.isReady()) return;
  whenTabMounted('ProviderHome', () => {
    (navigationRef as any).navigate('ProviderHome', {
      state: {
        index: 1,
        routes: [
          { name: 'ProviderHomeMain', params: { jumpToDate: date } },
          { name: 'BookingDetail', params: { bookingId, ...(openReschedule ? { openReschedule: true } : {}) } },
        ],
      },
    });
  });
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
