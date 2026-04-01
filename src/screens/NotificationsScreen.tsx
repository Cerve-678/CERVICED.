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
import { BlurView } from 'expo-blur';
import { useFonts } from 'expo-font';
import { useFont } from '../contexts/FontContext';
import { ThemedBackground } from '../components/ThemedBackground';
import { BellIcon } from '../components/IconLibrary';
import { NotificationService } from '../services/notificationService';
import { getMyNotifications, markNotificationRead, markAllNotificationsRead } from '../services/databaseService';
import { supabase } from '../lib/supabase';
import type { DbNotification } from '../types/database';
import Swipeable from 'react-native-gesture-handler/Swipeable';

import { HomeScreenProps } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import { dimensions, fonts, spacing } from '../constants/PlatformDimensions';
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Notification {
  id: string;
  type: 'booking_pending'   | 'booking_confirmed'   | 'booking_declined'
      | 'booking_cancelled'  | 'booking_reminder'    | 'booking_in_progress'
      | 'no_show'            | 'payment_success'     | 'new_provider'
      | 'reschedule_request' | 'reschedule_response' | 'reschedule_provider_response'
      | 'reschedule_confirmed'| 'review_request'     | 'review_received'
      | 'promotion';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  priority: 'high' | 'medium' | 'low';
  actionable: boolean;
  provider: string;
  service: string;
  providerImage?: any;
  bookingId?: string;
  status?: string;
  providerId?: string; // For new_provider notifications
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

export default function NotificationsScreen({ navigation }: HomeScreenProps<'Notifications'>) {
  const { theme, isDarkMode } = useTheme();
  const { textStyles } = useFont();
  const [fontsLoaded] = useFonts({
    BakbakOne: require('../../assets/fonts/BakbakOne-Regular.ttf'),
    Jura: require('../../assets/fonts/Jura-VariableFont_wght.ttf'),
  });
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

    // Realtime subscription — new notifications pop in instantly
    const channel = supabase
      .channel('notifications-screen')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          const n = mapDbNotification(payload.new as DbNotification);
          setNotifications(prev => [n, ...prev]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications' },
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

  // ✅ Filter notifications based on selected filter
  const filteredNotifications = useMemo(() => {
    switch (selectedFilter) {
      case 'unread':
        return notifications.filter(n => !n.read);
      case 'bookings':
        return notifications.filter(n => 
          ['booking_confirmed', 'booking_reminder', 'booking_cancelled', 
           'reschedule_request', 'reschedule_provider_response', 'reschedule_confirmed'].includes(n.type)
        );
      case 'promotions':
        return notifications.filter(n => 
          ['promotion', 'new_provider'].includes(n.type)
        );
      default:
        return notifications;
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
      supabase.from('notifications').delete().eq('id', notificationId).then(() => {});
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
        notification.type === 'reschedule_confirmed') {

      const openReschedule = notification.type === 'reschedule_request' ||
                            notification.type === 'reschedule_provider_response';

      if (__DEV__) console.log('Navigating to Bookings with params:', {
        openBookingId: notification.bookingId,
        openReschedule,
      });

      // BookingsScreen auto-detects the correct tab (past vs upcoming) from the booking data
      const bookingsParams = notification.bookingId
        ? { openBookingId: notification.bookingId, openReschedule, highlightBookingId: notification.bookingId }
        : undefined;

      // Keep modal visible for 3 seconds before navigating
      setTimeout(() => {
        setShowMessagePopup(false);
        setSelectedNotification(null);

        setTimeout(() => {
          navigation.goBack();
          setTimeout(() => {
            navigation.navigate('Bookings', bookingsParams);
            if (__DEV__) console.log('Navigation to Bookings executed successfully');
          }, 100);
        }, 300);
      }, 3000);
    } else if (notification.type === 'new_provider') {
      if (__DEV__) console.log('Navigating to ProviderProfile');
      if (__DEV__) console.log('Provider ID:', notification.providerId);

      if (!notification.providerId) {
        console.error('No providerId found in notification');
        return;
      }

      // Keep modal visible for 3 seconds before navigating
      setTimeout(() => {
        setShowMessagePopup(false);
        setSelectedNotification(null);

        setTimeout(() => {
          navigation.goBack();
          setTimeout(() => {
            navigation.navigate('ProviderProfile', { providerId: notification.providerId!, source: 'notification' });
            if (__DEV__) console.log('Navigation to ProviderProfile executed with ID:', notification.providerId);
          }, 100);
        }, 300);
      }, 3000);
    } else if (notification.type === 'promotion') {
      if (__DEV__) console.log('Navigating to Home');

      // Keep modal visible for 3 seconds before navigating
      setTimeout(() => {
        setShowMessagePopup(false);
        setSelectedNotification(null);

        setTimeout(() => {
          navigation.goBack();
          if (__DEV__) console.log('Navigation to Home executed');
        }, 300);
      }, 3000);
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
      <ThemedBackground style={styles.background}>
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
    if (['booking_confirmed', 'payment_success', 'reschedule_confirmed', 'booking_in_progress'].includes(type)) return '#4CAF50';
    if (['booking_pending', 'reschedule_request', 'reschedule_response', 'reschedule_provider_response'].includes(type)) return '#FF9500';
    if (['review_received', 'review_request'].includes(type)) return '#FFD700';
    if (['promotion', 'new_provider'].includes(type)) return '#9C27B0';
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
        <BlurView
          intensity={25}
          tint={theme.blurTint}
          style={[
            styles.notificationBlur,
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
                  { color: theme.text },
                  !item.read && styles.unreadTitle
                ]} numberOfLines={1}>
                  {item.title}
                </Text>
                {!item.read && <View style={styles.unreadDot} />}
              </View>

              <Text style={[textStyles.body, styles.notificationMessage, { color: theme.secondaryText }]} numberOfLines={2}>
                {item.message}
              </Text>

              <View style={styles.notificationFooter}>
                <Text style={[textStyles.caption, styles.notificationTime, { color: theme.secondaryText }]}>
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
        </BlurView>
      </TouchableOpacity>
    </Swipeable>
  );

  return (
    <ThemedBackground style={styles.background}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle={theme.statusBar} translucent={true} />

        {/* Pull-down indicator bar */}
        <View style={styles.pullBarContainer}>
          <View style={styles.pullBar} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Notifications</Text>
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
            {[
              { key: 'all', label: 'All' },
              { key: 'unread', label: 'Unread' },
              { key: 'bookings', label: 'Bookings' },
              { key: 'promotions', label: 'Offers' }
            ].map((filter) => (
              <TouchableOpacity
                key={filter.key}
                style={styles.filterButton}
                onPress={() => setSelectedFilter(filter.key)}
                activeOpacity={0.7}
              >
                <BlurView
                  intensity={25}
                  tint={theme.blurTint}
                  style={[
                    styles.filterButtonBlur,
                    selectedFilter === filter.key && styles.filterButtonActive
                  ]}
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
                </BlurView>
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
              tintColor="#9C27B0"
              colors={['#9C27B0']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <BlurView intensity={25} tint={theme.blurTint} style={styles.emptyStateBlur}>
                <BellIcon size={64} color={isDarkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'} />
                <Text style={[textStyles.h3, styles.emptyStateTitle, { color: theme.text }]}>No notifications</Text>
                <Text style={[textStyles.body, styles.emptyStateText, { color: theme.secondaryText }]}>
                  {selectedFilter === 'all'
                    ? "You're all caught up! New notifications will appear here."
                    : `No ${selectedFilter} notifications to show.`}
                </Text>
              </BlurView>
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
                <BlurView intensity={80} tint={theme.blurTint} style={styles.messagePopup}>
                  {selectedNotification && (
                    <>
                      <View style={styles.popupHeader}>
                        <View style={styles.popupHeaderLeft}>
                          <View style={[
                            styles.popupIconContainer,
                            { backgroundColor: `${getBellColor(selectedNotification.type)}20` }
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
                          style={styles.closeButton}
                          onPress={closeMessagePopup}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.closeButtonText, { color: theme.text }]}>×</Text>
                        </TouchableOpacity>
                      </View>

                      <Text style={[textStyles.h3, styles.popupTitle, { color: theme.text }]}>
                        {selectedNotification.title}
                      </Text>

                      <ScrollView style={styles.popupMessageScroll}>
                        <Text style={[textStyles.body, styles.popupMessage, { color: theme.secondaryText }]}>
                          {selectedNotification.message}
                        </Text>
                      </ScrollView>

                      <View style={styles.popupFooter}>
                        <Text style={[textStyles.caption, styles.popupTime, { color: theme.secondaryText }]}>
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
                </BlurView>
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
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  backArrow: {
    fontSize: 28,
    color: '#000',
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
    fontFamily: 'BakbakOne',
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
    fontFamily: 'BakbakOne',
  },
  markAllButton: {
    backgroundColor: 'rgba(156,39,176,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    // Pill shape
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(156,39,176,0.3)',
  },
  markAllText: {
    fontFamily: 'BakbakOne',
    fontSize: 10,
    color: '#9C27B0',
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
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.gap.xs,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  filterButtonActive: {
    backgroundColor: 'rgba(156,39,176,0.2)',
    borderColor: '#9C27B0'
  },
  filterButtonText: {
    fontFamily: 'BakbakOne',
    fontSize: fonts.body.medium,
    color: '#666',
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  filterButtonTextActive: { color: '#9C27B0' },
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
    fontFamily: 'BakbakOne',
  },

  // Notifications List
  notificationsContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  notificationItem: { marginBottom: spacing.lg },
  notificationBlur: {
    borderRadius: dimensions.card.smallBorderRadius,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    overflow: 'hidden',
    padding: spacing.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  unreadNotification: {
    backgroundColor: 'rgba(156, 39, 176, 0.08)',
    borderColor: 'rgba(156, 39, 176, 0.3)',
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
    backgroundColor: '#9C27B0' 
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
    backgroundColor: 'rgba(156,39,176,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(156,39,176,0.3)',
  },
  readMoreText: {
    fontFamily: 'BakbakOne',
    fontSize: 10,
    color: '#9C27B0',
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
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
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
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  popupProviderImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  closeButton: {
    width: 36,
    height: 36,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: { fontSize: 24, color: '#000', fontWeight: 'bold' },
  popupTitle: { 
    color: '#000', 
    marginBottom: 16, 
    textAlign: 'center',
    fontFamily: 'BakbakOne',
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
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
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
    fontFamily: 'BakbakOne',
    fontSize: 12,
  },

  // Empty State
  emptyState: { marginTop: 100, paddingHorizontal: 20 },
  emptyStateBlur: {
    padding: 40,
    borderRadius: 25,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  emptyStateTitle: { 
    color: '#000', 
    marginTop: 20, 
    marginBottom: 10,
    fontFamily: 'BakbakOne',
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
    fontFamily: 'BakbakOne',
  },

  // Bold notification title
  notificationTitleBold: {
    fontWeight: 'bold',
    fontFamily: 'BakbakOne',
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
