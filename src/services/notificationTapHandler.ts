/**
 * Handles push notification taps from background and killed states.
 * Called from RootNavigation — outside any screen context — so it uses
 * navigationRef directly instead of React Navigation's useNavigation hook.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigationRef } from '../navigation/navigationRef';
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

  const savedMode = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_MODE).catch(() => null);
  const isProvider = savedMode === 'provider';

  // ── Booking-related types ───────────────────────────────────────────────────
  if (BOOKING_TYPES.has(type)) {
    const openReschedule =
      type === 'reschedule_request' || type === 'reschedule_provider_response';

    if (isProvider) {
      // Provider: straight to booking detail
      if (booking_id) {
        navigate('BookingDetail', { bookingId: booking_id });
      } else {
        navigate('Notifications');
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
