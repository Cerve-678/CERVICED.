/**
 * Handles push notification taps from background and killed states.
 * Called from RootNavigation — outside any screen context — so it uses
 * navigationRef directly instead of React Navigation's useNavigation hook.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigationRef } from '../navigation/navigationRef';
import { navigateNested, navigateTab } from '../navigation/rootNavigate';
import { requestMode } from '../navigation/modeController';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { markNotificationRead, getProviderBasicById } from './databaseService';
import { logger } from '../utils/logger';

export interface NotificationTapData {
  type?: string;
  booking_id?: string;
  /** Present since the push payload started carrying it — without it, every
   *  notification whose destination is a PROVIDER rather than a booking (chat,
   *  provider profiles, provider broadcasts) could only ever dump the user on
   *  the notifications list. */
  provider_id?: string;
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
  'provider_no_show',
  'no_show_disputed',
  'booking_reminder',
  'booking_cancelled',
  'payment_success',
  'review_request',
  'reschedule_request',
  'reschedule_response',
  'reschedule_provider_response',
  'reschedule_confirmed',
  'reschedule_declined',
  // Deep-links to the booking, NOT into the reschedule flow: the request this
  // refers to is already closed, so openReschedule below deliberately excludes
  // it. The booking itself is unchanged and is what the reader needs to see.
  'reschedule_expired',
  // The useful destination is the booking, where Cancel lives — NOT the
  // reschedule flow, which is exactly what has gone unanswered.
  'cancel_window_closing',
  'pending_booking_reminder',
  'intake_form_received',
  'info_pack_received',
  'address_released',
  // Carries a real booking_id when it's a time-boxed hold (waitlist_holds.sql)
  // — same booking-detail deep link as everything else here. Falls through to
  // openNotifications() below via the !booking_id guard for the older
  // booking_id-less notifications this same type can also cover.
  'waitlist_slot_available',
]);

export async function handleNotificationTap(data: NotificationTapData): Promise<void> {
  if (!navigationRef.isReady()) return;

  const { type, booking_id, provider_id, notification_id } = data;

  // Opening a notification is what "reading" it means — the in-app list already
  // marks on tap, but a push tap deep-links straight past that list, so these
  // stayed unread forever and the badge count kept counting them. Fire and
  // forget: a failed write must never block or delay the navigation below.
  if (notification_id) {
    markNotificationRead(notification_id).catch(err =>
      logger.warn('[NotificationTap] Failed to mark notification read:', err),
    );
  }

  const savedMode = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_MODE).catch(() => null);
  // Route by who the notification is FOR (recipient_role from the push payload),
  // not by whichever hat the app happens to be in. Fall back to the saved mode
  // only when the notification didn't carry a role.
  const role = typeof data['recipient_role'] === 'string' ? data['recipient_role'] : null;
  let isProvider = role ? role === 'provider' : savedMode === 'provider';

  // If the notification is for the OTHER hat, switch into it first so the correct
  // navigator stack is mounted before we deep-link. requestMode → applyMode owns
  // persisting STORAGE_KEYS.ACTIVE_MODE itself (after verifying the account
  // actually holds that hat) — don't also write it here, or an unvalidated value
  // could briefly sit in storage ahead of applyMode's ownership check.
  //
  // Awaiting requestMode() (rather than a fixed sleep) is load-bearing: the
  // hat swap re-renders RootNavigation's MainTabsComponent (ProviderTabNavigation
  // vs ClientTabNavigation) on React's own schedule. A flat timeout that's too
  // short lets navigateNested() below fire while the PREVIOUS hat's navigator
  // is still mounted, so the deep-link lands in the wrong stack — the symptom
  // being the previous hat's screen reappearing on back-navigation instead of
  // staying inside the hat the notification was actually for.
  //
  // requestMode() resolves with whichever mode actually landed, which can
  // differ from targetMode if an overlapping request (another notification
  // tap, or the user's own manual switchMode() toggle) won the race — always
  // re-derive isProvider from the LANDED mode rather than trusting the
  // request, or this deep-link can fire against a navigator that doesn't
  // match the mode this notification was for.
  if (isProvider !== (savedMode === 'provider')) {
    const targetMode = isProvider ? 'provider' : 'client';
    const landed = await requestMode(targetMode);
    isProvider = landed === 'provider';
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
        // Matches the in-app list: "Rate Now" must land on the rating form,
        // not on the booking with the rating control left to be found.
        openReview: type === 'review_request',
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

  // ── Review received (provider) ───────────────────────────────────────────────
  // Lands on the provider's own profile, where the Reviews card lives — not on
  // the booking the review came from, which shows no review at all. That
  // profile is the ROOT of the MyServices tab, hence navigateTab.
  if (type === 'review_received') {
    if (isProvider) {
      navigateTab('MyServices');
    } else {
      openNotifications();
    }
    return;
  }

  // ── Message types ────────────────────────────────────────────────────────────
  if (type === 'provider_message' || type === 'new_message') {
    if (isProvider) {
      navigateNested('ProviderHome', 'ProviderInbox', { initialFilter: 'messages' });
      return;
    }
    // Client chat is keyed by the provider's SLUG, not their id, so it needs one
    // lookup before it can navigate. This used to give up and dump the user on
    // the notifications list to tap a second time; the push payload now carries
    // provider_id, so the tap can finish the job.
    if (!provider_id) {
      openNotifications();
      return;
    }
    try {
      const prov = await getProviderBasicById(provider_id);
      if (!prov) {
        openNotifications();
        return;
      }
      navigateNested('Home', 'ProviderChat', {
        providerId: prov.slug,
        providerDbId: provider_id,
        providerName: prov.display_name,
      });
    } catch (err) {
      // A lookup failure must still leave the user somewhere useful.
      logger.warn('[NotificationTap] Provider lookup failed for chat:', err);
      openNotifications();
    }
    return;
  }

  // ── Provider-destination types ───────────────────────────────────────────────
  // These point at a provider rather than a booking. Client-only: a provider
  // deep-linked into ProviderProfile would land in the client navigator.
  if (
    type === 'new_provider' ||
    type === 'announcement' ||
    type === 'birthday_greeting' ||
    type === 'post_appt_check_in'
  ) {
    if (!isProvider && provider_id) {
      navigateNested('Home', 'ProviderProfile', { providerId: provider_id, source: 'notification' });
    } else {
      openNotifications();
    }
    return;
  }

  // ── Everything else → Notifications screen ───────────────────────────────────
  // (promotion, daily_recap, schedule_fully_booked, etc.) Either they have no
  // specific destination, or the in-app handler covers them.
  openNotifications();
}
