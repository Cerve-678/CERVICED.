/**
 * Handles push notification taps from background and killed states.
 * Called from RootNavigation — outside any screen context — so it uses
 * navigationRef directly instead of React Navigation's useNavigation hook.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigationRef } from '../navigation/navigationRef';
import { requestMode } from '../navigation/modeController';
import { STORAGE_KEYS } from '../utils/storageKeys';

export interface NotificationTapData {
  type?: string;
  booking_id?: string;
  notification_id?: string;
  [key: string]: unknown;
}

// Types that always link to a booking detail
const BOOKING_TYPES = new Set([
  'booking_pending',
  'booking_confirmed',
  'booking_declined',
  'booking_in_progress',
  'no_show',
  'booking_reminder',
  'booking_cancelled',
  'payment_success',
  'review_request',
  'review_received',
  'reschedule_request',
  'reschedule_response',
  'reschedule_provider_response',
  'reschedule_confirmed',
  'booking_not_started',
  'balance_reminder',
  'balance_collected',
  'intake_form_received',
  'info_pack_received',
  'address_released',
]);

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
function navigateNested(tab: string, screen: string, params?: Record<string, unknown>) {
  if (!navigationRef.isReady()) return;
  (navigationRef as any).navigate(tab, { screen, params, initial: false });
}

export async function handleNotificationTap(data: NotificationTapData): Promise<void> {
  if (!navigationRef.isReady()) return;

  const { type, booking_id } = data;

  const savedMode = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_MODE).catch(() => null);
  // Route by who the notification is FOR (recipient_role from the push payload),
  // not by whichever hat the app happens to be in. Fall back to the saved mode
  // only when the notification didn't carry a role.
  const role = typeof data['recipient_role'] === 'string' ? data['recipient_role'] : null;
  const isProvider = role ? role === 'provider' : savedMode === 'provider';

  // If the notification is for the OTHER hat, switch into it first so the correct
  // navigator stack is mounted before we deep-link — and persist it so a cold
  // launch from a killed state also opens in the right mode.
  if (isProvider !== (savedMode === 'provider')) {
    const targetMode = isProvider ? 'provider' : 'client';
    await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_MODE, targetMode).catch(() => {});
    requestMode(targetMode);
    await new Promise((r) => setTimeout(r, 350));
  }

  // The two hats are different navigators, so the tab hosting the shared
  // screens (Notifications, booking detail) differs between them.
  const homeTab = isProvider ? 'ProviderHome' : 'Home';
  const openNotifications = () => navigateNested(homeTab, 'Notifications');

  if (!type) {
    openNotifications();
    return;
  }

  // ── Booking-related types ───────────────────────────────────────────────────
  if (BOOKING_TYPES.has(type)) {
    const openReschedule =
      type === 'reschedule_request' || type === 'reschedule_provider_response';

    if (!booking_id) {
      openNotifications();
      return;
    }

    if (isProvider) {
      navigateNested('ProviderHome', 'BookingDetail', {
        bookingId: booking_id,
        openReschedule: openReschedule || undefined,
      });
    } else {
      // Client: open the bookings list with the booking pre-opened. Explicitly
      // through the Home tab — the old bare navigate('Bookings') landed in
      // whichever tab was focused, and did nothing at all on Explore.
      navigateNested('Home', 'Bookings', {
        openBookingId: booking_id,
        openReschedule,
        highlightBookingId: booking_id,
      });
    }
    return;
  }

  // ── Intake form types (provider-only) ────────────────────────────────────────
  if (type === 'intake_form_reminder' || type === 'intake_form_completed') {
    if (isProvider && booking_id) {
      navigateNested('ProviderHome', 'BookingDetail', { bookingId: booking_id });
    } else {
      openNotifications();
    }
    return;
  }

  // ── Message types ────────────────────────────────────────────────────────────
  if (type === 'provider_message' || type === 'new_message') {
    if (isProvider) {
      navigateNested('ProviderHome', 'ProviderInbox', { initialFilter: 'messages' });
    } else {
      // Client chat requires a provider slug lookup — land on Notifications so
      // the in-app handler can do the async lookup when the user taps the item.
      openNotifications();
    }
    return;
  }

  // ── Everything else → Notifications screen ───────────────────────────────────
  // (new_provider, announcement, promotion, waitlist_slot_available, etc.)
  // These need provider_id for deep linking; the in-app handler covers them.
  openNotifications();
}
