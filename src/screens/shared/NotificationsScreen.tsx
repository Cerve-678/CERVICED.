import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  ScrollView,
  StatusBar,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFont } from '../../contexts/FontContext';
import { BellIcon } from '../../components/IconLibrary';
import {
  getMyNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification as dbDeleteNotification,
  getBookingWithAddOnsById,
  getProviderBasicById,
  subscribeToNotificationChanges,
} from '../../services/databaseService';
import type { DbNotification } from '../../types/database';
import Swipeable from 'react-native-gesture-handler/Swipeable';
// react-native's own TouchableOpacity runs its own touch responder
// independently of Swipeable's PanGestureHandler, so a swipe attempt that
// hasn't yet crossed the pan threshold can still register as a press on this
// row — this gesture-handler-native version arbitrates through the same
// gesture system Swipeable uses, so a swipe reliably wins over a tap.
import { TouchableOpacity as GestureTouchableOpacity } from 'react-native-gesture-handler';

import { HomeScreenProps } from '../../navigation/types';
import { navigateNested, navigateTab, navigateAfterDismiss } from '../../navigation/rootNavigate';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import SlidingTabs from '../../components/SlidingTabs';
import { useAuth } from '../../contexts/AuthContext';
import { CommonActions } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { dimensions, fonts, spacing } from '../../constants/PlatformDimensions';
import { logger } from '../../utils/logger';

interface Notification {
  id: string;
  type: 'booking_pending'   | 'booking_confirmed'   | 'booking_declined'
      | 'booking_cancelled'  | 'booking_reminder'    | 'booking_in_progress'
      | 'no_show'            | 'provider_no_show'    | 'no_show_disputed'
      | 'payment_success'     | 'new_provider'
      | 'reschedule_request' | 'reschedule_provider_response'
      | 'reschedule_confirmed'| 'reschedule_declined' | 'reschedule_expired'
      | 'cancel_window_closing'
      | 'review_request'    | 'review_received'
      | 'promotion'          | 'intake_form_reminder' | 'provider_message'
      | 'new_message'         | 'pending_booking_reminder'
      | 'announcement'       | 'intake_form_received' | 'waitlist_slot_available'
      | 'info_pack_received' | 'intake_form_completed' | 'address_released'
      | 'birthday_greeting'  | 'post_appt_check_in'   | 'rebooking_nudge' | 'daily_recap'
      | 'schedule_fully_booked';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  priority: 'high' | 'medium' | 'low';
  actionable: boolean;
  provider: string;
  service: string;
  providerImage?: any;
  bookingId?: string | undefined;
  status?: string | undefined;
  providerId?: string | undefined; // For new_provider notifications
}

// ── Skeleton Notification Row ───────────────────────────────────
// Needs React, useRef, useEffect, Animated, View, StyleSheet from RN (already imported)
function SkeletonNotifRow({ isDarkMode }: { isDarkMode: boolean }) {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.65] });
  const base = isDarkMode ? '#3A3A3C' : '#E5E5EA';
  const bg = isDarkMode ? 'rgba(28,28,30,0.95)' : '#fff';
  return (
    <View style={[notifSkeletonStyles.row, { backgroundColor: bg }]}>
      <Animated.View style={[notifSkeletonStyles.icon, { backgroundColor: base, opacity }]} />
      <View style={notifSkeletonStyles.content}>
        <Animated.View style={[notifSkeletonStyles.line, { width: '60%', backgroundColor: base, opacity }]} />
        <Animated.View style={[notifSkeletonStyles.line, { width: '80%', backgroundColor: base, opacity }]} />
        <Animated.View style={[notifSkeletonStyles.line, { width: '30%', backgroundColor: base, opacity }]} />
      </View>
    </View>
  );
}
const notifSkeletonStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  icon: { width: 44, height: 44, borderRadius: 22 },
  content: { flex: 1, marginLeft: 12, gap: 8 },
  line: { height: 12, borderRadius: 6 },
});

// Role separation is server-authoritative: every notification row carries a
// `recipient_role` ('provider' | 'client') set at creation time, and both the
// initial fetch (getMyNotifications) and the realtime subscription filter by it.
// The client therefore never second-guesses the audience by notification type —
// that legacy approach (hardcoded PROVIDER_ONLY/CLIENT_ONLY lists) drifted out of
// sync with the DB and hid valid rows (e.g. a client's own booking_pending
// "request sent" notification). Adding a new notification type now requires zero
// changes here: just set recipient_role correctly where the row is inserted.

export default function NotificationsScreen({ navigation }: HomeScreenProps<'Notifications'>) {
  const { theme, isDarkMode, palette: P } = useTheme();
  const { textStyles } = useFont();
  const { user, activeMode } = useAuth();
  const isProvider = activeMode === 'provider';
  const isProviderRef = useRef(false);
  isProviderRef.current = isProvider;

  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showMessagePopup, setShowMessagePopup] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  // Unread count for the hat the user is NOT currently in, so an empty list can
  // say where the missing notifications actually are. Only meaningful for
  // dual-hat accounts — stays 0 otherwise, and the empty state falls back to
  // the plain "all caught up" copy.
  const [otherHatUnread, setOtherHatUnread] = useState(0);
  const hasOtherHat = isProvider
    ? !!user?.hasClientProfile
    : user?.accountType === 'provider';

  // Every navigation path below is "dismiss this formSheet, then navigate", which
  // means a deferred callback can fire after the sheet is already gone — the user
  // can swipe a formSheet away mid-timer, or tap twice. Without cleanup those
  // callbacks still run and call goBack() on an already-popped navigator, which is
  // the "GO_BACK was not handled by any navigator" warning. Track every timer so
  // unmount cancels them, and bail out of any callback that outlived the screen.
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const isMountedRef = useRef(true);

  // Only one row's delete bubble should be open at a time (iOS Mail
  // behaviour) — closing whichever row is currently open when another one
  // starts to open, rather than letting several sit open simultaneously.
  const rowSwipeablesRef = useRef<Map<string, React.ElementRef<typeof Swipeable>>>(new Map());
  const openRowIdRef = useRef<string | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, []);

  const defer = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      if (!isMountedRef.current) return;
      fn();
    }, ms);
    timersRef.current.push(id);
  }, []);

  // Dismiss the sheet, then navigate once it's actually gone. `canGoBack()` is the
  // guard that makes this safe to call from any stack: Notifications is registered
  // in every navigator, so it is not always guaranteed to have a route beneath it.
  const dismissThenNavigate = useCallback((navigateFn: () => void) => {
    if (navigation.canGoBack()) {
      navigation.dispatch(CommonActions.goBack() as any);
      // NOT defer(): that timer is owned by THIS screen, and the goBack() above
      // unmounts it — the unmount cleanup clears the timer before it can ever
      // fire, so the onward navigation silently never happened. That was the
      // bug behind "Open Chat does nothing", and it hit every path routed
      // through here (Open Inbox, provider booking deep-links, provider
      // profiles) in both hats. navigateAfterDismiss() is module-scoped and
      // navigates via navigationRef, both of which outlive this screen — so
      // `navigateFn` must use navigateNested(), never the captured
      // `navigation` prop, which is dead once this screen is gone.
      navigateAfterDismiss(navigateFn, 500);
    } else {
      // Nothing to dismiss — we're already at the stack root, so navigate directly
      // rather than firing a goBack() that no navigator can handle.
      navigateFn();
    }
  }, [navigation]);

  // Dismiss with no onward navigation (the notification has nowhere specific to go).
  const dismissOnly = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);

  // Map Supabase DbNotification → local Notification shape
  const mapDbNotification = (db: DbNotification): Notification => ({
    id: db.id,
    type: db.type as Notification['type'],
    title: db.title,
    message: db.message,
    timestamp: db.created_at,
    read: db.is_read,
    priority: db.priority as Notification['priority'],
    actionable: db.is_actionable,
    provider: '',
    service: '',
    bookingId: db.booking_id ?? undefined,
    providerId: db.provider_id ?? undefined,
  });

  const loadNotifications = useCallback(async () => {
    try {
      setLoadError(null);
      const role = isProvider ? 'provider' : 'client';
      const dbRows = await getMyNotifications(role);
      setNotifications(dbRows.map(mapDbNotification));
    } catch (error) {
      logger.error('Failed to load notifications:', error);
      setLoadError('Failed to load notifications. Pull down to retry.');
    } finally {
      setNotificationsLoading(false);
    }
  }, [isProvider]);

  // Reload and re-subscribe whenever the active role changes so the list
  // switches cleanly between provider and client notifications.
  useEffect(() => {
    loadNotifications();
    Notifications.setBadgeCountAsync(0).catch(() => {});

    const role = isProvider ? 'provider' : 'client';
    if (!user?.id) return;
    return subscribeToNotificationChanges(
      user.id,
      (row) => {
        if (row.recipient_role === role) {
          setNotifications(prev => [mapDbNotification(row), ...prev].slice(0, 100));
        }
      },
      (row) => {
        if (row.recipient_role !== role) return;
        const updated = mapDbNotification(row);
        setNotifications(prev => prev.map(n => n.id === updated.id ? updated : n));
      },
    );
  }, [isProvider, loadNotifications, user?.id]);

  // Reset active filter tab whenever the user switches between provider/client mode
  useEffect(() => {
    setSelectedFilter('all');
  }, [activeMode]);

  useEffect(() => {
    if (!hasOtherHat) { setOtherHatUnread(0); return; }
    let cancelled = false;
    getUnreadNotificationCount(isProvider ? 'client' : 'provider')
      .then(count => { if (!cancelled) setOtherHatUnread(count); })
      .catch(() => { if (!cancelled) setOtherHatUnread(0); });
    return () => { cancelled = true; };
  }, [hasOtherHat, isProvider]);

  // ✅ Filter notifications based on selected filter
  const filteredNotifications = useMemo(() => {
    // `notifications` is already scoped to the active role by the DB query and
    // realtime filter (recipient_role), so no per-type mode stripping is needed.
    const modeFiltered = notifications;

    switch (selectedFilter) {
      case 'unread':
        return modeFiltered.filter(n => !n.read);
      case 'bookings':
        return modeFiltered.filter(n =>
          ['booking_pending', 'booking_confirmed', 'booking_reminder',
           'booking_cancelled', 'booking_declined',
           'booking_in_progress', 'no_show', 'provider_no_show', 'no_show_disputed', 'payment_success',
           'reschedule_request', 'reschedule_provider_response',
           'reschedule_confirmed', 'reschedule_declined', 'reschedule_expired',
           'cancel_window_closing',
           'rebooking_nudge', 'daily_recap'].includes(n.type)
        );
      case 'reviews':
        return modeFiltered.filter(n =>
          ['review_received', 'review_request'].includes(n.type)
        );
      case 'promotions':
        return modeFiltered.filter(n =>
          ['promotion', 'new_provider'].includes(n.type)
        );
      default:
        return modeFiltered;
    }
  }, [notifications, selectedFilter]);

  // ✅ Mark single notification as read
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      // Optimistic local update
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
      // Sync to Supabase (silent fail)
      markNotificationRead(notificationId).catch(() => {});
    } catch (error) {
      logger.error('Failed to mark as read:', error);
    }
  }, []);

  // ✅ Mark all as read
  const markAllAsRead = useCallback(async () => {
    try {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      // Sync to Supabase (silent fail)
      markAllNotificationsRead().catch(() => {});
    } catch (error) {
      logger.error('Failed to mark all as read:', error);
    }
  }, []);

  // ✅ Delete notification (no confirmation for swipe)
  const deleteNotification = useCallback(async (notificationId: string) => {
    try {
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      // Delete from Supabase (silent fail)
      dbDeleteNotification(notificationId).catch(() => {});
    } catch (error) {
      logger.error('Failed to delete notification:', error);
    }
  }, []);

  // ✅ Show full message popup
  const showFullMessage = useCallback((notification: Notification) => {
    setSelectedNotification(notification);
    setShowMessagePopup(true);
    markAsRead(notification.id);
  }, [markAsRead]);

  const closeMessagePopup = useCallback(() => {
    setShowMessagePopup(false);
    setSelectedNotification(null);
  }, []);

  // Notifications, BookingDetail, ProviderIntakeForm, and ProviderInbox are all
  // registered independently in BOTH the ProviderHome (Calendar) stack and the
  // ProviderAccount (Profile Settings) stack. A bare goBack()+navigate() lands
  // wherever Notifications happened to be opened FROM — so opening Notifications
  // from Profile Settings and tapping a booking/reschedule notification pushed
  // BookingDetail onto the Profile Settings stack instead of Calendar, stranding
  // the provider there with no way back to the Profile Settings root screen.
  // Explicitly targeting the ProviderHome tab (like the background push-tap
  // handler already does) guarantees the destination stack regardless of where
  // Notifications was opened from.
  const navigateProviderHome = useCallback((screen: string, params?: Record<string, unknown>) => {
    dismissThenNavigate(() => navigateNested('ProviderHome', screen, params));
  }, [dismissThenNavigate]);

  // ✅ Handle notification action (View Booking, Reschedule, etc.)
  const handleNotificationAction = useCallback((notification: Notification) => {
    logger.log('[NotificationsScreen] handleNotificationAction called');
    logger.log('Notification type:', notification.type);
    logger.log('Booking ID:', notification.bookingId);

    // Close modal immediately so the user gets instant feedback
    setShowMessagePopup(false);
    setSelectedNotification(null);

    // A provider must never be deep-linked into a client-only screen. Routes like
    // ProviderProfile / Home / Bookings / ProviderChat don't exist in the provider
    // stack, so navigating to them bubbles up and mounts the CLIENT navigator —
    // leaving a provider staring at a client screen. For client-only notification
    // types, stay on the (provider) notifications list instead of leaking across.
    const CLIENT_ONLY_TYPES = new Set([
      'waitlist_slot_available',
      'new_provider',
      'promotion',
      'announcement',
      'birthday_greeting',
      'post_appt_check_in',
      'rebooking_nudge',
      'points_earned',
    ]);
    if (isProviderRef.current && CLIENT_ONLY_TYPES.has(notification.type)) {
      logger.log('[NotificationsScreen] Ignoring client-only notification in provider mode:', notification.type);
      return;
    }

    // Navigate based on notification type
    if (notification.type === 'booking_pending' ||
        notification.type === 'booking_confirmed' ||
        notification.type === 'booking_declined' ||
        notification.type === 'booking_in_progress' ||
        notification.type === 'no_show' ||
        notification.type === 'provider_no_show' ||
        notification.type === 'no_show_disputed' ||
        notification.type === 'booking_reminder' ||
        notification.type === 'booking_cancelled' ||
        notification.type === 'payment_success' ||
        notification.type === 'review_request' ||
        notification.type === 'reschedule_request' ||
        notification.type === 'reschedule_provider_response' ||
        notification.type === 'reschedule_confirmed' ||
        notification.type === 'reschedule_declined' ||
        notification.type === 'reschedule_expired' ||
        notification.type === 'cancel_window_closing' ||
        notification.type === 'intake_form_received' ||
        notification.type === 'info_pack_received' ||
        notification.type === 'address_released' ||
        notification.type === 'pending_booking_reminder' ||
        notification.type === 'rebooking_nudge' ||
        notification.type === 'daily_recap') {

      const openReschedule = notification.type === 'reschedule_request' ||
                            notification.type === 'reschedule_provider_response';
      // "Rate Now" has to land on the rating form. Without this it fell through
      // to the generic booking deep-link and opened BookingDetail, leaving the
      // client to go and find the rate control themselves — the button promised
      // an action the destination didn't offer.
      const openReview = notification.type === 'review_request';

      defer(() => {
        if (isProviderRef.current) {
          // Provider: always land in the Calendar (ProviderHome) stack, not
          // wherever Notifications happened to be opened from.
          if (notification.bookingId) {
            const bookingId = notification.bookingId;
            navigateProviderHome('BookingDetail', { bookingId, openReschedule: openReschedule || undefined });
            logger.log('Provider — navigating to BookingDetail:', bookingId);
          } else {
            // No specific booking to open (shouldn't normally happen for
            // these types, but tapping the action button must never be a
            // silent no-op) — fall back to the Schedule screen, same as
            // schedule_fully_booked below.
            navigateProviderHome('ProviderSchedule');
            logger.log('Provider — no bookingId, falling back to ProviderSchedule');
          }
        } else {
          // Client: dismiss the sheet first, then navigate — replacing straight
          // from a modal-presented route to a card-presented one fights the
          // native dismiss/push transitions and hangs the screen.
          //
          // Explicitly through the Home tab, for the same reason the provider
          // side targets ProviderHome above: Notifications is registered in
          // EVERY tab's stack, so a replace() landed Bookings in whichever tab
          // Notifications happened to be opened from — open it from Cart and
          // the client's bookings appeared inside the Cart stack.
          const bookingsParams = notification.bookingId
            ? { openBookingId: notification.bookingId, openReschedule, openReview, highlightBookingId: notification.bookingId }
            : {};
          logger.log('Client — navigating to Bookings:', bookingsParams);
          dismissThenNavigate(() => navigateNested('Home', 'Bookings', bookingsParams));
        }
      }, 300);
    } else if (notification.type === 'waitlist_slot_available') {
      // A held slot (waitlist_holds.sql) carries a real booking_id — send the
      // client straight to it so they can confirm/decline (BookingDetailScreen's
      // on_hold branch), same pattern as the other booking-linked types above.
      // Older-style waitlist notifications (or the provider's manual "Schedule
      // & Invite", which books outright rather than holding) have no booking_id
      // — fall back to the provider profile so there's still somewhere to go.
      if (notification.bookingId) {
        const bookingId = notification.bookingId;
        defer(() => {
          dismissThenNavigate(() =>
            navigateNested('Home', 'Bookings', { openBookingId: bookingId, highlightBookingId: bookingId })
          );
        }, 300);
      } else if (notification.providerId) {
        const providerId = notification.providerId;
        defer(() => {
          dismissThenNavigate(() =>
            navigateNested('Home', 'ProviderProfile', { providerId, source: 'notification' })
          );
        }, 300);
      }
    } else if (notification.type === 'new_provider') {
      logger.log('Navigating to ProviderProfile');
      logger.log('Provider ID:', notification.providerId);

      if (!notification.providerId) {
        logger.error('No providerId found in notification');
        return;
      }
      const providerId = notification.providerId;

      defer(() => {
        logger.log('Navigation to ProviderProfile executed with ID:', providerId);
        dismissThenNavigate(() =>
          navigateNested('Home', 'ProviderProfile', { providerId, source: 'notification' })
        );
      }, 300);
    } else if (notification.type === 'promotion') {
      // A promotion has no specific destination — dismissing the sheet returns the
      // user to whatever they were on. (This previously logged "Navigating to Home"
      // but only ever called goBack(); it reached Home by coincidence of Home being
      // underneath, and warned when it wasn't.)
      logger.log('Promotion — dismissing notifications');
      defer(dismissOnly, 300);
    } else if (notification.type === 'announcement' ||
               notification.type === 'birthday_greeting' ||
               notification.type === 'post_appt_check_in') {
      // Provider broadcast (or an automated birthday/check-in message from
      // them) — open that provider's profile if we know them
      if (notification.providerId) {
        const providerId = notification.providerId;
        defer(() => {
          dismissThenNavigate(() =>
            navigateNested('Home', 'ProviderProfile', { providerId, source: 'notification' })
          );
        }, 300);
      } else {
        defer(dismissOnly, 300);
      }
    } else if (notification.type === 'intake_form_reminder' || notification.type === 'intake_form_completed') {
      // reminder → open the send-a-form flow; completed → open responses readonly
      const viewResponses = notification.type === 'intake_form_completed';
      if (!notification.bookingId) return;
      const bookingId = notification.bookingId;
      defer(async () => {
        const booking = await getBookingWithAddOnsById(bookingId);
        // Re-check liveness: the await means the sheet may already be dismissed.
        if (!booking || !isMountedRef.current) return;
        navigateProviderHome('ProviderIntakeForm', {
          bookingId,
          clientUserId: booking.user_id,
          serviceName: booking.service_name_snapshot,
          ...(viewResponses ? { formId: 'view' } : {}),
        });
        logger.log('Provider — navigating to ProviderIntakeForm:', bookingId);
      }, 300);
    } else if (notification.type === 'review_received') {
      // A review lands on the provider's own profile, where the Reviews card
      // actually lives — not on the booking it came from. The booking is not
      // what "View Review" is promising, and BookingDetail shows no review at
      // all. The profile is the ROOT of the MyServices tab, hence navigateTab.
      defer(() => {
        dismissThenNavigate(() => navigateTab('MyServices'));
      }, 300);
    } else if (notification.type === 'provider_message') {
      logger.log('Navigating to ProviderInbox (Messages)');
      defer(() => {
        navigateProviderHome('ProviderInbox', { initialFilter: 'messages' });
      }, 300);
    } else if (notification.type === 'new_message') {
      // Chat message — providers land in the inbox Messages tab; clients open
      // the chat with that provider (slug + name looked up from provider_id)
      if (isProviderRef.current) {
        defer(() => {
          navigateProviderHome('ProviderInbox', { initialFilter: 'messages' });
        }, 300);
      } else {
        if (!notification.providerId) return;
        const providerDbId = notification.providerId;
        defer(async () => {
          const prov = await getProviderBasicById(providerDbId);
          // This await gives the user ample time to dismiss the sheet themselves,
          // so re-check liveness before touching the navigator.
          if (!prov || !isMountedRef.current) return;
          dismissThenNavigate(() =>
            navigateNested('Home', 'ProviderChat', {
              providerId: prov.slug,
              providerDbId,
              providerName: prov.display_name,
            })
          );
        }, 300);
      }
    } else if (notification.type === 'schedule_fully_booked') {
      // Provider-only — carries no booking_id (it's about the whole
      // calendar, not one appointment), so go straight to the Schedule
      // screen rather than through BookingDetail like the booking types.
      defer(() => {
        navigateProviderHome('ProviderSchedule');
      }, 300);
    } else if (notification.type === 'points_earned') {
      // Client-only (guarded by CLIENT_ONLY_TYPES above) — the Rewards screen
      // is nested under the Profile tab, not Home.
      defer(() => {
        dismissThenNavigate(() => navigateNested('Profile', 'Points'));
      }, 300);
    }
  }, [navigation, navigateProviderHome, defer, dismissThenNavigate, dismissOnly]);

  // ✅ Format timestamp (relative time)
  const formatTimestamp = (timestamp: string) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffInMinutes = Math.floor(diffMs / (1000 * 60));
    const diffInHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  // ✅ Refresh control
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  }, [loadNotifications]);

  if (notificationsLoading) {
    return (
      <ThemedBackground style={{ flex: 1 }}>
        <SafeAreaView style={styles.safeArea}>
          <View style={{ paddingTop: 16 }}>
            {[1, 2, 3, 4, 5, 6].map(k => (
              <SkeletonNotifRow key={k} isDarkMode={isDarkMode} />
            ))}
          </View>
        </SafeAreaView>
      </ThemedBackground>
    );
  }

  // ✅ Bell color logic based on notification type
  const getBellColor = (type: string) => {
    if (['booking_cancelled', 'booking_declined', 'no_show', 'provider_no_show', 'reschedule_declined'].includes(type)) return '#FF1744';
    // Amber, not the red the no-show itself uses: nothing was decided here.
    // The booking is untouched and the disagreement is open, which is
    // exactly what amber means everywhere else on this screen.
    if (type === 'no_show_disputed') return '#FF9500';
    if (['booking_confirmed', 'payment_success', 'reschedule_confirmed', 'booking_in_progress', 'intake_form_completed', 'address_released'].includes(type)) return '#4CAF50';
    // Amber, not the red used by _declined/_cancelled: nothing was decided and
    // the booking itself is untouched, so red would read as "your appointment
    // is off" when the appointment is exactly as it was.
    if (['booking_pending', 'reschedule_request', 'reschedule_provider_response', 'reschedule_expired', 'cancel_window_closing', 'intake_form_reminder', 'intake_form_received', 'info_pack_received', 'pending_booking_reminder', 'booking_reminder', 'rebooking_nudge', 'daily_recap', 'schedule_fully_booked', 'waitlist_slot_available'].includes(type)) return '#FF9500';
    if (['review_received', 'review_request', 'points_earned'].includes(type)) return '#FFD700';
    if (['promotion', 'new_provider', 'provider_message', 'new_message', 'announcement', 'birthday_greeting', 'post_appt_check_in'].includes(type)) return P.accentText;
    return '#FF9800';
  };

  // ✅ Get action button text based on notification type
  const getActionButtonText = (type: string) => {
    switch (type) {
      case 'booking_pending':
        return 'View Booking';
      case 'booking_confirmed':
      case 'booking_reminder':
      case 'booking_in_progress':
      case 'rebooking_nudge':
      case 'daily_recap':
        return 'View Booking';
      case 'booking_declined':
      case 'booking_cancelled':
        return 'View Past Bookings';
      case 'no_show':
      case 'provider_no_show':
      case 'no_show_disputed':
        return 'View Booking';
      case 'reschedule_declined':
      // The request is closed and the booking is unchanged, so the only useful
      // destination is the booking itself — not "Reschedule Now", which would
      // point at a flow the provider's notice window may now refuse.
      case 'reschedule_expired':
        return 'View Booking';
      // The point of this one is that cancelling is still possible, but not
      // for much longer — the booking is where that decision gets made.
      case 'cancel_window_closing':
        return 'View Booking';
      case 'pending_booking_reminder':
        return 'Respond Now';
      case 'payment_success':
        return 'View Booking';
      case 'reschedule_request':
      case 'reschedule_provider_response':
        return 'Reschedule Now';
      case 'reschedule_confirmed':
        return 'View Booking';
      case 'new_provider':
        return 'View Provider';
      case 'promotion':
        return 'Shop Now';
      case 'review_request':
        return 'Rate Now';
      case 'review_received':
        return 'View Review';
      case 'intake_form_reminder':
        return 'Send Form';
      case 'intake_form_received':
        return 'Fill In Form';
      case 'intake_form_completed':
        return 'View Responses';
      case 'info_pack_received':
        return 'Read Info';
      case 'announcement':
      case 'birthday_greeting':
      case 'post_appt_check_in':
        return 'View Provider';
      case 'provider_message':
        return 'Open Inbox';
      case 'new_message':
        return 'Open Chat';
      case 'address_released':
        return 'View Address';
      case 'schedule_fully_booked':
        return 'View Schedule';
      case 'points_earned':
        return 'View Rewards';
      default:
        return 'View';
    }
  };

  // ✅ Render swipe-to-delete action — Apple Mail-style: a round red "bubble"
  // pinned to the trailing edge (Swipeable already positions this container
  // as the row is dragged, so no extra translateX here) that pops in with a
  // spring overshoot as it crosses the reveal threshold, rather than a flat
  // rectangular bar.
  const renderRightActions = (progress: Animated.AnimatedInterpolation<number>, _dragX: Animated.AnimatedInterpolation<number>, item: Notification) => {
    const scale = progress.interpolate({
      inputRange: [0, 0.5, 0.7, 1],
      outputRange: [0.4, 1.15, 0.92, 1],
      extrapolate: 'clamp',
    });

    return (
      <View style={styles.deleteAction}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <TouchableOpacity
            style={styles.deleteBubble}
            onPress={() => deleteNotification(item.id)}
            activeOpacity={0.75}
          >
            <Ionicons name="trash" size={22} color="#FFF" />
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  };

  // ✅ Render individual notification card
  const renderNotification = ({ item }: { item: Notification }) => (
    <Swipeable
      ref={(ref) => {
        if (ref) rowSwipeablesRef.current.set(item.id, ref);
        else rowSwipeablesRef.current.delete(item.id);
      }}
      renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, item)}
      overshootRight={false}
      onSwipeableWillOpen={() => {
        if (openRowIdRef.current && openRowIdRef.current !== item.id) {
          rowSwipeablesRef.current.get(openRowIdRef.current)?.close();
        }
        openRowIdRef.current = item.id;
      }}
      onSwipeableClose={() => {
        if (openRowIdRef.current === item.id) openRowIdRef.current = null;
      }}
    >
      <GestureTouchableOpacity
        activeOpacity={0.8}
        onPress={() => showFullMessage(item)}
        style={styles.notificationItem}
      >
        <View
          style={[
            styles.notificationBlur,
            item.read
              ? { backgroundColor: P.card, borderColor: P.border }
              : {
                  backgroundColor: P.accentDim,
                  borderColor: P.accent,
                  borderLeftWidth: 3,
                  borderLeftColor: P.accent,
                },
          ]}
        >
          <View style={styles.notificationHeader}>
            <View style={styles.notificationLeft}>
              <View style={[
                styles.iconContainer,
                { backgroundColor: `${getBellColor(item.type)}${item.read ? '0D' : '15'}` },
                item.read && { opacity: 0.6 },
              ]}>
                <BellIcon
                  size={24}
                  color={getBellColor(item.type)}
                />
              </View>
              {item.providerImage && (
                <Image
                  source={item.providerImage}
                  style={styles.providerImage}
                  contentFit="cover"
                />
              )}
            </View>

            <View style={styles.notificationContent}>
              <View style={styles.notificationTitleRow}>
                <Text style={[
                  textStyles.button,
                  styles.notificationTitle,
                  styles.notificationTitleBold,
                  { color: item.read ? P.sub : P.text },
                  !item.read && styles.unreadTitle
                ]} numberOfLines={1}>
                  {item.title}
                </Text>
                {!item.read && <View style={[styles.unreadDot, { backgroundColor: P.accent }]} />}
              </View>

              <Text style={[textStyles.body, styles.notificationMessage, { color: P.sub }]} numberOfLines={2}>
                {item.message}
              </Text>

              <View style={styles.notificationFooter}>
                <Text style={[textStyles.caption, styles.notificationTime, { color: P.sub }]}>
                  {formatTimestamp(item.timestamp)}
                </Text>

                <TouchableOpacity
                  style={[styles.readMoreButton, { backgroundColor: P.accentDim, borderColor: P.border }]}
                  onPress={() => showFullMessage(item)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.readMoreText, { color: P.accentText }]}>Read More</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </GestureTouchableOpacity>
    </Swipeable>
  );

  return (
    <ThemedBackground>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={theme.statusBar} translucent={true} />

        {/* Pull-down indicator bar */}
        <View style={styles.pullBarContainer}>
          <View style={[styles.pullBar, { backgroundColor: P.border }]} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerCenter}>
            <Text
              style={[styles.headerTitle, { color: P.text }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {isProvider ? 'Business Notifications' : 'Notifications'}
            </Text>
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </View>

          {unreadCount > 0 && (
            <TouchableOpacity
              style={[styles.markAllButton, { backgroundColor: P.accentDim, borderColor: P.border }]}
              onPress={markAllAsRead}
              activeOpacity={0.7}
            >
              <Text style={[styles.markAllText, { color: P.accentText }]}>Mark All Read</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ✅ Filter Tabs */}
        <View style={styles.filterContainer}>
          <SlidingTabs
            tabs={(isProvider
              ? [
                  { key: 'all', label: 'All' },
                  { key: 'unread', label: 'Unread', count: unreadCount },
                  { key: 'bookings', label: 'Bookings' },
                  { key: 'reviews', label: 'Reviews' },
                ]
              : [
                  { key: 'all', label: 'All' },
                  { key: 'unread', label: 'Unread', count: unreadCount },
                  { key: 'bookings', label: 'Bookings' },
                  { key: 'promotions', label: 'Offers' },
                ]
            )}
            activeKey={selectedFilter}
            onPress={setSelectedFilter}
            accentColor={P.accent}
            inactiveTextColor={P.sub}
            activeTextColor={P.onAccent}
          />
        </View>

        {/* Error Banner */}
        {loadError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{loadError}</Text>
            <TouchableOpacity onPress={loadNotifications}>
              <Text style={styles.errorRetryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ✅ Notifications List */}
        <FlatList
          data={filteredNotifications}
          renderItem={renderNotification}
          keyExtractor={item => item.id}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh}
              tintColor={P.accent}
              colors={[P.accent]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={[styles.emptyStateBlur, { borderColor: P.border, backgroundColor: P.accentDim }]}>
                <BellIcon size={64} color={P.sub} />
                <Text style={[textStyles.h3, styles.emptyStateTitle, { color: P.text }]}>
                  {isProvider ? 'No business notifications' : 'No beauty notifications'}
                </Text>
                <Text style={[textStyles.body, styles.emptyStateText, { color: P.sub }]}>
                  {selectedFilter !== 'all'
                    ? `No ${selectedFilter} notifications to show.`
                    : otherHatUnread > 0
                      // Point at the other hat rather than letting an empty list
                      // read as "nothing happened" when items are waiting there.
                      ? `You're all caught up here — but you have ${otherHatUnread} unread in ${isProvider ? 'client' : 'provider'} mode.`
                      : "You're all caught up! New notifications will appear here."}
                </Text>
              </View>
            </View>
          }
          contentContainerStyle={styles.notificationsContent}
        />

        {/* ✅ Full Message Popup Modal */}
        <Modal
          visible={showMessagePopup}
          transparent={true}
          animationType="fade"
          onRequestClose={closeMessagePopup}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={closeMessagePopup}
          >
            <View style={styles.modalContainer}>
              <TouchableOpacity activeOpacity={1} onPress={() => {}}>
                <View style={[styles.messagePopup, { backgroundColor: P.card, borderColor: P.border }]}>
                  {selectedNotification && (
                    <>
                      <View style={styles.popupHeader}>
                        <View style={styles.popupHeaderLeft}>
                          <View style={[
                            styles.popupIconContainer,
                            { backgroundColor: `${getBellColor(selectedNotification.type)}20`, borderColor: P.border }
                          ]}>
                            <BellIcon
                              size={40}
                              color={getBellColor(selectedNotification.type)}
                            />
                          </View>
                          {selectedNotification.providerImage && (
                            <Image
                              source={selectedNotification.providerImage}
                              style={styles.popupProviderImage}
                              contentFit="cover"
                            />
                          )}
                        </View>

                        <TouchableOpacity
                          style={[styles.closeButton, { backgroundColor: P.surface }]}
                          onPress={closeMessagePopup}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.closeButtonText, { color: P.text }]}>×</Text>
                        </TouchableOpacity>
                      </View>

                      <Text style={[textStyles.h3, styles.popupTitle, { color: P.text }]}>
                        {selectedNotification.title}
                      </Text>

                      <ScrollView style={styles.popupMessageScroll}>
                        <Text style={[textStyles.body, styles.popupMessage, { color: P.sub }]}>
                          {selectedNotification.message}
                        </Text>
                      </ScrollView>

                      <View style={[styles.popupFooter, { borderTopColor: P.sep }]}>
                        <Text style={[textStyles.caption, styles.popupTime, { color: P.sub }]}>
                          {formatTimestamp(selectedNotification.timestamp)}
                        </Text>

                        {selectedNotification.actionable && (
                          <TouchableOpacity
                            style={[
                              styles.popupActionButton,
                              { backgroundColor: getBellColor(selectedNotification.type) }
                            ]}
                            onPress={() => handleNotificationAction(selectedNotification)}
                            activeOpacity={0.8}
                          >
                            <Text style={[textStyles.button, styles.popupActionText]}>
                              {getActionButtonText(selectedNotification.type)}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </>
                  )}
                </View>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      </SafeAreaView>
    </ThemedBackground>
  );
}

// ✅ COMPLETE STYLES WITH GLASSMORPHISM
const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  pullBarContainer: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  pullBar: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(126,102,103,0.2)',
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    minHeight: 60,
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    flex: 1,
    minWidth: 0,
    marginLeft: 14,
    marginTop: 0,
  },
  headerTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: fonts.title.large,
    fontWeight: 'bold',
    letterSpacing: 1,
    flexShrink: 1,
  },
  unreadBadge: {
    backgroundColor: '#FF1744',
    // More rounded badge (pill shape)
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    flexShrink: 0,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: fonts.body.small,
    fontWeight: 'bold',
    fontFamily: 'BakbakOne-Regular',
  },
  markAllButton: {
    marginLeft: spacing.md,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  markAllText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },

  // Filter Tabs
  filterContainer: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg },

  // Notifications List
  notificationsContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  notificationItem: { marginBottom: spacing.lg },
  notificationBlur: {
    borderRadius: dimensions.card.smallBorderRadius,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
  },
  notificationHeader: { flexDirection: 'row', gap: spacing.gap.md },
  notificationLeft: { alignItems: 'center', gap: spacing.gap.sm },
  iconContainer: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  providerImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: dimensions.card.gap,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  notificationContent: { flex: 1 },
  notificationTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  notificationTitle: { flex: 1 },
  unreadTitle: { fontWeight: 'bold' },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  notificationMessage: {
    lineHeight: 16,
    marginBottom: 8
  },
  notificationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  notificationTime: {},
  readMoreButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  readMoreText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },

  // Popup Modal
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  modalContainer: { width: '90%', maxWidth: 400, maxHeight: '80%' },
  messagePopup: {
    borderRadius: 25,
    padding: 24,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  popupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  popupHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  popupIconContainer: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 30,
    borderWidth: StyleSheet.hairlineWidth,
  },
  popupProviderImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(74,35,64,0.3)',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: { fontSize: 24, fontWeight: 'bold' },
  popupTitle: {
    marginBottom: 16,
    textAlign: 'center',
    fontFamily: 'BakbakOne-Regular',
  },
  popupMessageScroll: {
    maxHeight: 200,
    marginBottom: 16,
  },
  popupMessage: {
    lineHeight: 22,
    textAlign: 'center'
  },
  popupFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  popupTime: {},
  popupActionButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 16,
  },
  popupActionText: { 
    color: '#fff', 
    letterSpacing: 0.5,
    fontFamily: 'BakbakOne-Regular',
    fontSize: 12,
  },

  // Empty State
  emptyState: { marginTop: 100, paddingHorizontal: 20 },
  emptyStateBlur: {
    padding: 40,
    borderRadius: 25,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  emptyStateTitle: {
    marginTop: 20,
    marginBottom: 10,
    fontFamily: 'BakbakOne-Regular',
  },
  emptyStateText: {
    textAlign: 'center',
    lineHeight: 20
  },

  // Swipe to delete styles
  deleteAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 74,
    marginBottom: 16,
  },
  deleteBubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Bold notification title
  notificationTitleBold: {
    fontWeight: 'bold',
    fontFamily: 'BakbakOne-Regular',
  },

  // Error banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(244, 67, 54, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(244, 67, 54, 0.3)',
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  errorBannerText: {
    color: '#D32F2F',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  errorRetryText: {
    color: '#D32F2F',
    fontSize: 13,
    fontWeight: 'bold',
    marginLeft: 12,
  },
});
