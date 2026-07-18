import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Modal,
  ScrollView,
  Image,
  StatusBar,
  Animated,
  Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { useFont } from '../contexts/FontContext';
import { BellIcon } from '../components/IconLibrary';
import { NotificationService } from '../services/notificationService';
import {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification as dbDeleteNotification,
  getBookingWithAddOnsById,
  getProviderBasicById,
} from '../services/databaseService';
import { supabase } from '../lib/supabase';
import type { DbNotification } from '../types/database';
import Swipeable from 'react-native-gesture-handler/Swipeable';

import { HomeScreenProps } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';
import { useAuth } from '../contexts/AuthContext';
import { CommonActions, StackActions } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { dimensions, fonts, spacing } from '../constants/PlatformDimensions';
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const NL = {
  bg: '#F5F1EC', surface: '#EDE8E2', card: '#FFFFFF',
  accent: '#AF9197', text: '#000000',
  sub: '#7E6667', border: 'rgba(126,102,103,0.14)',
  sep: 'rgba(126,102,103,0.08)', iconBg: 'rgba(175,145,151,0.12)',
};
const ND = {
  bg: '#1A1815', surface: '#201D1A', card: '#252220',
  accent: '#AF9197', text: '#F0ECE7',
  sub: '#7E6667', border: 'rgba(126,102,103,0.18)',
  sep: 'rgba(126,102,103,0.10)', iconBg: 'rgba(175,145,151,0.10)',
};

interface Notification {
  id: string;
  type: 'booking_pending'   | 'booking_confirmed'   | 'booking_declined'
      | 'booking_cancelled'  | 'booking_reminder'    | 'booking_in_progress'
      | 'booking_not_started'
      | 'no_show'            | 'payment_success'     | 'new_provider'
      | 'reschedule_request' | 'reschedule_response' | 'reschedule_provider_response'
      | 'reschedule_confirmed'| 'review_request'     | 'review_received'
      | 'promotion'          | 'intake_form_reminder' | 'provider_message'
      | 'balance_collected'  | 'balance_reminder'     | 'new_message'
      | 'announcement'       | 'intake_form_received' | 'waitlist_slot_available'
      | 'info_pack_received' | 'intake_form_completed';
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

// Notification types that only make sense for a provider
const PROVIDER_ONLY_TYPES: Notification['type'][] = [
  'booking_pending', 'no_show', 'review_received',
  'booking_not_started', 'intake_form_reminder', 'provider_message', 'balance_reminder',
  'intake_form_completed',
];
// Notification types that only make sense for a client
const CLIENT_ONLY_TYPES: Notification['type'][] = [
  'new_provider', 'promotion', 'review_request',
  'reschedule_provider_response', 'booking_declined',
  'announcement', 'intake_form_received', 'waitlist_slot_available',
  'info_pack_received',
];

export default function NotificationsScreen({ navigation }: HomeScreenProps<'Notifications'>) {
  const { theme, isDarkMode } = useTheme();
  const P = isDarkMode ? ND : NL;
  const { textStyles } = useFont();
  const [fontsLoaded] = useFonts({
    BakbakOne: require('../../assets/fonts/BakbakOne-Regular.ttf'),
    Jura: require('../../assets/fonts/Jura-VariableFont_wght.ttf'),
  });
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

  // ✅ Load notifications on mount and when screen focuses
  useEffect(() => {
    loadNotifications();
    Notifications.setBadgeCountAsync(0).catch(() => {});

    // Realtime subscription — new notifications pop in instantly
    const channel = supabase
      .channel('notifications-screen')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user?.id}` },
        (payload) => {
          const n = mapDbNotification(payload.new as DbNotification);
          setNotifications(prev => [n, ...prev]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user?.id}` },
        (payload) => {
          const updated = mapDbNotification(payload.new as DbNotification);
          setNotifications(prev =>
            prev.map(n => n.id === updated.id ? updated : n)
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadNotifications = async () => {
    try {
      setLoadError(null);
      const dbRows = await getMyNotifications();
      setNotifications(dbRows.map(mapDbNotification));
    } catch (error) {
      console.error('Failed to load notifications:', error);
      setLoadError('Failed to load notifications. Pull down to retry.');
    } finally {
      setNotificationsLoading(false);
    }
  };

  // Reset active filter tab whenever the user switches between provider/client mode
  useEffect(() => {
    setSelectedFilter('all');
  }, [activeMode]);

  // ✅ Filter notifications based on selected filter
  const filteredNotifications = useMemo(() => {
    // First strip notifications that belong to the other mode
    const modeFiltered = notifications.filter(n =>
      isProvider
        ? !CLIENT_ONLY_TYPES.includes(n.type)
        : !PROVIDER_ONLY_TYPES.includes(n.type)
    );

    switch (selectedFilter) {
      case 'unread':
        return modeFiltered.filter(n => !n.read);
      case 'bookings':
        return modeFiltered.filter(n =>
          ['booking_pending', 'booking_confirmed', 'booking_reminder',
           'booking_cancelled', 'booking_in_progress', 'no_show',
           'reschedule_request', 'reschedule_provider_response',
           'reschedule_confirmed'].includes(n.type)
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
  }, [notifications, selectedFilter, isProvider]);

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
      console.error('Failed to mark as read:', error);
    }
  }, []);

  // ✅ Mark all as read
  const markAllAsRead = useCallback(async () => {
    try {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      // Sync to Supabase (silent fail)
      markAllNotificationsRead().catch(() => {});
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  }, [notifications]);

  // ✅ Delete notification (no confirmation for swipe)
  const deleteNotification = useCallback(async (notificationId: string) => {
    try {
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      // Delete from Supabase (silent fail)
      dbDeleteNotification(notificationId).catch(() => {});
    } catch (error) {
      console.error('Failed to delete notification:', error);
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

  // ✅ Handle notification action (View Booking, Reschedule, etc.)
  const handleNotificationAction = useCallback((notification: Notification) => {
    if (__DEV__) console.log('[NotificationsScreen] handleNotificationAction called');
    if (__DEV__) console.log('Notification type:', notification.type);
    if (__DEV__) console.log('Booking ID:', notification.bookingId);

    // Close modal immediately so the user gets instant feedback
    setShowMessagePopup(false);
    setSelectedNotification(null);

    // Navigate based on notification type
    if (notification.type === 'booking_pending' ||
        notification.type === 'booking_confirmed' ||
        notification.type === 'booking_declined' ||
        notification.type === 'booking_in_progress' ||
        notification.type === 'no_show' ||
        notification.type === 'booking_reminder' ||
        notification.type === 'booking_cancelled' ||
        notification.type === 'payment_success' ||
        notification.type === 'review_request' ||
        notification.type === 'review_received' ||
        notification.type === 'reschedule_request' ||
        notification.type === 'reschedule_provider_response' ||
        notification.type === 'reschedule_confirmed' ||
        notification.type === 'booking_not_started' ||
        notification.type === 'balance_reminder' ||
        notification.type === 'balance_collected' ||
        notification.type === 'intake_form_received' ||
        notification.type === 'info_pack_received') {

      const openReschedule = notification.type === 'reschedule_request' ||
                            notification.type === 'reschedule_provider_response';

      setTimeout(() => {
        if (isProviderRef.current) {
          // Provider: dismiss the modal first, then navigate to BookingDetail
          if (notification.bookingId) {
            const bookingId = notification.bookingId;
            // Dismiss Notifications modal
            navigation.dispatch(CommonActions.goBack() as any);
            // After modal dismiss animation, push BookingDetail in same stack
            setTimeout(() => {
              navigation.dispatch(
                CommonActions.navigate({ name: 'BookingDetail', params: { bookingId } }) as any
              );
              if (__DEV__) console.log('Provider — navigating to BookingDetail:', bookingId);
            }, 500);
          }
        } else {
          // Client: replace Notifications with Bookings so the modal dismisses cleanly
          const bookingsParams = notification.bookingId
            ? { openBookingId: notification.bookingId, openReschedule, highlightBookingId: notification.bookingId }
            : {};
          if (__DEV__) console.log('Client — navigating to Bookings:', bookingsParams);
          navigation.dispatch(StackActions.replace('Bookings', bookingsParams));
        }
      }, 300);
    } else if (notification.type === 'waitlist_slot_available') {
      // A slot opened up — take the client straight to the provider to book
      if (!notification.providerId) return;
      setTimeout(() => {
        navigation.dispatch(StackActions.replace('ProviderProfile', { providerId: notification.providerId!, source: 'notification' }));
      }, 300);
    } else if (notification.type === 'new_provider') {
      if (__DEV__) console.log('Navigating to ProviderProfile');
      if (__DEV__) console.log('Provider ID:', notification.providerId);

      if (!notification.providerId) {
        console.error('No providerId found in notification');
        return;
      }

      setTimeout(() => {
        if (__DEV__) console.log('Navigation to ProviderProfile executed with ID:', notification.providerId);
        navigation.dispatch(StackActions.replace('ProviderProfile', { providerId: notification.providerId!, source: 'notification' }));
      }, 300);
    } else if (notification.type === 'promotion') {
      if (__DEV__) console.log('Navigating to Home');
      setTimeout(() => {
        navigation.goBack();
        if (__DEV__) console.log('Navigation to Home executed');
      }, 300);
    } else if (notification.type === 'announcement') {
      // Provider broadcast — open that provider's profile if we know them
      if (notification.providerId) {
        const providerId = notification.providerId;
        setTimeout(() => {
          navigation.dispatch(StackActions.replace('ProviderProfile', { providerId, source: 'notification' }));
        }, 300);
      } else {
        setTimeout(() => navigation.goBack(), 300);
      }
    } else if (notification.type === 'intake_form_reminder' || notification.type === 'intake_form_completed') {
      // reminder → open the send-a-form flow; completed → open responses readonly
      const viewResponses = notification.type === 'intake_form_completed';
      if (!notification.bookingId) return;
      const bookingId = notification.bookingId;
      setTimeout(async () => {
        const booking = await getBookingWithAddOnsById(bookingId);
        if (!booking) return;
        navigation.dispatch(CommonActions.goBack() as any);
        setTimeout(() => {
          navigation.dispatch(
            CommonActions.navigate({
              name: 'ProviderIntakeForm',
              params: {
                bookingId,
                clientUserId: booking.user_id,
                serviceName: booking.service_name_snapshot,
                ...(viewResponses ? { formId: 'view' } : {}),
              },
            }) as any
          );
          if (__DEV__) console.log('Provider — navigating to ProviderIntakeForm:', bookingId);
        }, 500);
      }, 300);
    } else if (notification.type === 'provider_message') {
      if (__DEV__) console.log('Navigating to ProviderInbox (Messages)');
      setTimeout(() => {
        navigation.dispatch(CommonActions.goBack() as any);
        setTimeout(() => {
          navigation.dispatch(
            CommonActions.navigate({ name: 'ProviderInbox', params: { initialFilter: 'messages' } }) as any
          );
        }, 500);
      }, 300);
    } else if (notification.type === 'new_message') {
      // Chat message — providers land in the inbox Messages tab; clients open
      // the chat with that provider (slug + name looked up from provider_id)
      if (isProviderRef.current) {
        setTimeout(() => {
          navigation.dispatch(CommonActions.goBack() as any);
          setTimeout(() => {
            navigation.dispatch(
              CommonActions.navigate({ name: 'ProviderInbox', params: { initialFilter: 'messages' } }) as any
            );
          }, 500);
        }, 300);
      } else {
        if (!notification.providerId) return;
        const providerDbId = notification.providerId;
        setTimeout(async () => {
          const prov = await getProviderBasicById(providerDbId);
          if (!prov) return;
          navigation.dispatch(CommonActions.goBack() as any);
          setTimeout(() => {
            navigation.dispatch(
              CommonActions.navigate({
                name: 'ProviderChat',
                params: { providerId: prov.slug, providerDbId, providerName: prov.display_name },
              }) as any
            );
          }, 500);
        }, 300);
      }
    }
  }, [navigation]);

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
  }, []);

  if (!fontsLoaded || notificationsLoading) {
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
    if (['booking_cancelled', 'booking_declined', 'no_show'].includes(type)) return '#FF1744';
    if (['booking_confirmed', 'payment_success', 'reschedule_confirmed', 'booking_in_progress', 'balance_collected', 'intake_form_completed'].includes(type)) return '#4CAF50';
    if (['booking_pending', 'reschedule_request', 'reschedule_provider_response', 'booking_not_started', 'intake_form_reminder', 'intake_form_received', 'info_pack_received', 'balance_reminder'].includes(type)) return '#FF9500';
    if (['review_received', 'review_request'].includes(type)) return '#FFD700';
    if (['promotion', 'new_provider', 'provider_message', 'new_message', 'announcement'].includes(type)) return '#AF9197';
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
        return 'View Booking';
      case 'booking_declined':
      case 'booking_cancelled':
        return 'View Past Bookings';
      case 'no_show':
        return 'View Booking';
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
      case 'booking_not_started':
        return 'Start Booking';
      case 'intake_form_reminder':
        return 'Send Form';
      case 'intake_form_received':
        return 'Fill In Form';
      case 'intake_form_completed':
        return 'View Responses';
      case 'info_pack_received':
        return 'Read Info';
      case 'announcement':
        return 'View Provider';
      case 'provider_message':
        return 'Open Inbox';
      case 'new_message':
        return 'Open Chat';
      case 'balance_reminder':
        return 'Collect Payment';
      case 'balance_collected':
        return 'View Booking';
      default:
        return 'View';
    }
  };

  // ✅ Render swipe-to-delete action
  const renderRightActions = (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>, item: Notification) => {
    const trans = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [0, 100],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View style={[styles.deleteAction, { transform: [{ translateX: trans }] }]}>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => deleteNotification(item.id)}
        >
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // ✅ Render individual notification card
  const renderNotification = ({ item }: { item: Notification }) => (
    <Swipeable
      renderRightActions={(progress, dragX) => renderRightActions(progress, dragX, item)}
      overshootRight={false}
    >
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => showFullMessage(item)}
        style={styles.notificationItem}
      >
        <View
          style={[
            styles.notificationBlur,
            { backgroundColor: P.card },
            !item.read && styles.unreadNotification
          ]}
        >
          <View style={styles.notificationHeader}>
            <View style={styles.notificationLeft}>
              <View style={[
                styles.iconContainer,
                { backgroundColor: `${getBellColor(item.type)}15` }
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
                  resizeMode="cover"
                />
              )}
            </View>

            <View style={styles.notificationContent}>
              <View style={styles.notificationTitleRow}>
                <Text style={[
                  textStyles.button,
                  styles.notificationTitle,
                  styles.notificationTitleBold,
                  { color: P.text },
                  !item.read && styles.unreadTitle
                ]} numberOfLines={1}>
                  {item.title}
                </Text>
                {!item.read && <View style={styles.unreadDot} />}
              </View>

              <Text style={[textStyles.body, styles.notificationMessage, { color: P.sub }]} numberOfLines={2}>
                {item.message}
              </Text>

              <View style={styles.notificationFooter}>
                <Text style={[textStyles.caption, styles.notificationTime, { color: P.sub }]}>
                  {formatTimestamp(item.timestamp)}
                </Text>

                <TouchableOpacity
                  style={styles.readMoreButton}
                  onPress={() => showFullMessage(item)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.readMoreText}>Read More</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );

  return (
    <View style={[styles.background, { backgroundColor: isDarkMode ? '#1A1815' : '#F5F1EC' }]}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={theme.statusBar} translucent={true} />

        {/* Pull-down indicator bar */}
        <View style={styles.pullBarContainer}>
          <View style={styles.pullBar} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: P.text }]}>Notifications</Text>
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </View>

          {unreadCount > 0 && (
            <TouchableOpacity
              style={styles.markAllButton}
              onPress={markAllAsRead}
              activeOpacity={0.7}
            >
              <Text style={styles.markAllText}>Mark All Read</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ✅ Filter Tabs */}
        <View style={styles.filterContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            {(isProvider
              ? [
                  { key: 'all', label: 'All' },
                  { key: 'unread', label: 'Unread' },
                  { key: 'bookings', label: 'Bookings' },
                  { key: 'reviews', label: 'Reviews' },
                ]
              : [
                  { key: 'all', label: 'All' },
                  { key: 'unread', label: 'Unread' },
                  { key: 'bookings', label: 'Bookings' },
                  { key: 'promotions', label: 'Offers' },
                ]
            ).map((filter) => (
              <TouchableOpacity
                key={filter.key}
                style={[
                  styles.filterButton,
                  styles.filterButtonBlur,
                  selectedFilter === filter.key && styles.filterButtonActive
                ]}
                onPress={() => setSelectedFilter(filter.key)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.filterButtonText,
                  selectedFilter === filter.key && styles.filterButtonTextActive
                ]}>
                  {filter.label}
                </Text>
                {filter.key === 'unread' && unreadCount > 0 && (
                  <View style={styles.filterBadge}>
                    <Text style={styles.filterBadgeText}>{unreadCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
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
              tintColor="#AF9197"
              colors={['#AF9197']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyStateBlur}>
                <BellIcon size={64} color={P.sub} />
                <Text style={[textStyles.h3, styles.emptyStateTitle, { color: P.text }]}>No notifications</Text>
                <Text style={[textStyles.body, styles.emptyStateText, { color: P.sub }]}>
                  {selectedFilter === 'all'
                    ? "You're all caught up! New notifications will appear here."
                    : `No ${selectedFilter} notifications to show.`}
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
                              resizeMode="cover"
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
    </View>
  );
}

// ✅ COMPLETE STYLES WITH GLASSMORPHISM
const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
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
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
  },
  backButtonBlur: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(175,145,151,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(175,145,151,0.2)',
  },
  backArrow: {
    fontSize: 28,
    fontWeight: '300',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 12,
    flex: 1,
    marginLeft: 14,
    marginTop: 0,
  },
  headerTitle: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: fonts.title.large,
    color: '#000',
    fontWeight: 'bold',
    letterSpacing: 1,
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
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: fonts.body.small,
    fontWeight: 'bold',
    fontFamily: 'BakbakOne-Regular',
  },
  markAllButton: {
    backgroundColor: 'rgba(175,145,151,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(175,145,151,0.3)',
  },
  markAllText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 10,
    color: '#AF9197',
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },

  // Filter Tabs
  filterContainer: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  filterScroll: { paddingVertical: spacing.md },
  filterButton: { marginRight: spacing.md },
  filterButtonBlur: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: dimensions.card.smallBorderRadius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(126,102,103,0.18)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.gap.xs,
    backgroundColor: 'rgba(175,145,151,0.06)',
  },
  filterButtonActive: {
    backgroundColor: 'rgba(175,145,151,0.18)',
    borderColor: '#AF9197',
  },
  filterButtonText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: fonts.body.medium,
    color: '#7E6667',
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  filterButtonTextActive: { color: '#AF9197' },
  filterBadge: {
    backgroundColor: '#FF1744',
    borderRadius: spacing.md,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: {
    color: '#fff',
    fontSize: fonts.body.xsmall,
    fontWeight: 'bold',
    fontFamily: 'BakbakOne-Regular',
  },

  // Notifications List
  notificationsContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  notificationItem: { marginBottom: spacing.lg },
  notificationBlur: {
    borderRadius: dimensions.card.smallBorderRadius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(126,102,103,0.14)',
    padding: spacing.lg,
  },
  unreadNotification: {
    backgroundColor: 'rgba(175,145,151,0.06)',
    borderColor: 'rgba(175,145,151,0.3)',
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
  notificationTitle: { color: '#000', flex: 1 },
  unreadTitle: { fontWeight: 'bold' },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#AF9197',
  },
  notificationMessage: { 
    color: 'rgba(0,0,0,0.8)', 
    lineHeight: 16, 
    marginBottom: 8 
  },
  notificationFooter: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  notificationTime: { color: 'rgba(0,0,0,0.5)' },
  readMoreButton: {
    backgroundColor: 'rgba(175,145,151,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(175,145,151,0.3)',
  },
  readMoreText: {
    fontFamily: 'BakbakOne-Regular',
    fontSize: 10,
    color: '#AF9197',
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
    borderColor: 'rgba(175,145,151,0.3)',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: { fontSize: 24, color: '#000', fontWeight: 'bold' },
  popupTitle: { 
    color: '#000', 
    marginBottom: 16, 
    textAlign: 'center',
    fontFamily: 'BakbakOne-Regular',
  },
  popupMessageScroll: {
    maxHeight: 200,
    marginBottom: 16,
  },
  popupMessage: { 
    color: 'rgba(0,0,0,0.8)', 
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
  popupTime: { color: 'rgba(0,0,0,0.5)' },
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
    borderColor: 'rgba(126,102,103,0.14)',
    backgroundColor: 'rgba(175,145,151,0.05)',
  },
  emptyStateTitle: { 
    color: '#000', 
    marginTop: 20, 
    marginBottom: 10,
    fontFamily: 'BakbakOne-Regular',
  },
  emptyStateText: { 
    color: 'rgba(0,0,0,0.7)', 
    textAlign: 'center', 
    lineHeight: 20 
  },

  // Swipe to delete styles
  deleteAction: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'flex-end',
    marginBottom: 16,
    borderRadius: 20,
    overflow: 'hidden',
  },
  deleteButton: {
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
  },
  deleteText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
    fontFamily: 'BakbakOne-Regular',
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
