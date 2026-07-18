/**
 * Handles push notification taps from background and killed states.
 * Called from RootNavigation — outside any screen context — so it uses
 * navigationRef directly instead of React Navigation's useNavigation hook.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigationRef } from '../navigation/navigationRef';
import { requestMode } from '../navigation/modeController';

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
]);

function navigate(name: string, params?: Record<string, unknown>) {
  if (!navigationRef.isReady()) return;
  (navigationRef as any).navigate(name, params);
}

export async function handleNotificationTap(data: NotificationTapData): Promise<void> {
  if (!navigationRef.isReady()) return;

  const { type, booking_id } = data;

  if (!type) {
    navigate('Notifications');
    return;
  }

  const savedMode = await AsyncStorage.getItem('@active_mode').catch(() => null);
  // Route by who the notification is FOR (recipient_role from the push payload),
  // not by whichever hat the app happens to be in. Fall back to the saved mode
  // only when the notification didn't carry a role.
  const role = typeof data.recipient_role === 'string' ? data.recipient_role : null;
  const isProvider = role ? role === 'provider' : savedMode === 'provider';

  // If the notification is for the OTHER hat, switch into it first so the correct
  // navigator stack is mounted before we deep-link — and persist it so a cold
  // launch from a killed state also opens in the right mode.
  if (isProvider !== (savedMode === 'provider')) {
    const targetMode = isProvider ? 'provider' : 'client';
    await AsyncStorage.setItem('@active_mode', targetMode).catch(() => {});
    requestMode(targetMode);
    await new Promise((r) => setTimeout(r, 350));
  }

  // ── Booking-related types ───────────────────────────────────────────────────
  if (BOOKING_TYPES.has(type)) {
    const openReschedule =
      type === 'reschedule_request' || type === 'reschedule_provider_response';

    if (isProvider) {
      // Provider: navigate through the ProviderHome tab so the correct stack
      // is selected regardless of which tab is currently focused.
      if (booking_id) {
        navigate('ProviderHome', {
          screen: 'BookingDetail',
          params: { bookingId: booking_id, openReschedule: openReschedule || undefined },
        });
      } else {
        navigate('ProviderHome', { screen: 'Notifications' });
      }
    } else {
      // Client: open bookings list with the booking pre-opened
      navigate(
        'Bookings',
        booking_id
          ? { openBookingId: booking_id, openReschedule, highlightBookingId: booking_id }
          : undefined,
      );
    }
    return;
  }

  // ── Intake form types (provider-only) ────────────────────────────────────────
  if (type === 'intake_form_reminder' || type === 'intake_form_completed') {
    if (isProvider && booking_id) {
      navigate('BookingDetail', { bookingId: booking_id });
    } else {
      navigate('Notifications');
    }
    return;
  }

  // ── Message types ────────────────────────────────────────────────────────────
  if (type === 'provider_message' || type === 'new_message') {
    if (isProvider) {
      navigate('ProviderInbox', { initialFilter: 'messages' });
    } else {
      // Client chat requires a provider slug lookup — land on Notifications so
      // the in-app handler can do the async lookup when the user taps the item.
      navigate('Notifications');
    }
    return;
  }

  // ── Everything else → Notifications screen ───────────────────────────────────
  // (new_provider, announcement, promotion, waitlist_slot_available, etc.)
  // These need provider_id for deep linking; the in-app handler covers them.
  navigate('Notifications');
}
