import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';
import { getProviderBookings } from '../services/databaseService';
import { mapDbBookingToConfirmed } from '../contexts/BookingContext';
import type { BookingWithAddOns } from '../types/database';

// ── Types ────────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'completed' | 'confirmed' | 'cancelled' | 'no_show' | 'pending';

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'no_show', label: 'No Show' },
];

const STATUS_COLORS: Record<string, string> = {
  completed: '#34C759',
  cancelled: '#FF3B30',
  no_show: '#FF9500',
  pending: '#FF9500',
  confirmed: '#007AFF',
  in_progress: '#5856D6',
};

const STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No Show',
  pending: 'Pending',
  confirmed: 'Confirmed',
  in_progress: 'In Progress',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h! >= 12 ? 'pm' : 'am';
  const h12 = h === 0 ? 12 : h! > 12 ? h! - 12 : h!;
  return `${h12}:${String(m).padStart(2, '0')}${ampm}`;
}

function getRef(id: string): string {
  return id.replace(/-/g, '').substring(0, 10).toUpperCase();
}

// ── Skeleton Loader ──────────────────────────────────────────────────────────

function SkeletonRow({ isDarkMode }: { isDarkMode: boolean }) {
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

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });
  const base = isDarkMode ? '#3A3A3C' : '#E5E5EA';

  return (
    <View style={[skeletonStyles.card, { backgroundColor: isDarkMode ? 'rgba(28,28,30,0.95)' : '#fff' }]}>
      <View style={[skeletonStyles.bar, { backgroundColor: base }]} />
      <View style={skeletonStyles.content}>
        <Animated.View style={[skeletonStyles.line, { width: '60%', backgroundColor: base, opacity }]} />
        <Animated.View style={[skeletonStyles.line, { width: '40%', backgroundColor: base, opacity }]} />
        <Animated.View style={[skeletonStyles.line, { width: '50%', backgroundColor: base, opacity }]} />
        <Animated.View style={[skeletonStyles.line, { width: '30%', backgroundColor: base, opacity }]} />
      </View>
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  bar: { width: 4 },
  content: { flex: 1, padding: 14, gap: 10 },
  line: { height: 12, borderRadius: 6 },
});

// ── Booking Row ───────────────────────────────────────────────────────────────

interface BookingRowProps {
  booking: BookingWithAddOns;
  theme: any;
  isDarkMode: boolean;
  onPress: () => void;
}

function BookingRow({ booking, theme, isDarkMode, onPress }: BookingRowProps) {
  const statusColor = STATUS_COLORS[booking.status] ?? '#8E8E93';
  const statusLabel = STATUS_LABELS[booking.status] ?? booking.status;
  const addOnsTotal = booking.add_ons?.reduce((s, a) => s + a.price_snapshot, 0) ?? 0;
  const total = booking.base_price + addOnsTotal;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[
        styles.row,
        {
          backgroundColor: isDarkMode ? 'rgba(28,28,30,0.95)' : '#fff',
          borderColor: theme.border,
        },
      ]}
    >
      {/* Left color bar */}
      <View style={[styles.colorBar, { backgroundColor: statusColor }]} />

      <View style={styles.rowContent}>
        {/* Top line */}
        <View style={styles.rowTop}>
          <Text style={[styles.serviceName, { color: theme.text }]} numberOfLines={1}>
            {booking.service_name_snapshot}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>

        {/* Client name */}
        {booking.customer_name ? (
          <Text style={[styles.clientName, { color: theme.secondaryText }]}>
            {booking.customer_name}
          </Text>
        ) : null}

        {/* Date / time row */}
        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={13} color={theme.secondaryText} />
          <Text style={[styles.metaText, { color: theme.secondaryText }]}>
            {formatDate(booking.booking_date)}
          </Text>
          <Ionicons name="time-outline" size={13} color={theme.secondaryText} style={styles.metaIcon} />
          <Text style={[styles.metaText, { color: theme.secondaryText }]}>
            {formatTime(booking.booking_time)}
          </Text>
        </View>

        {/* Ref / total */}
        <View style={styles.metaRow}>
          <Text style={[styles.ref, { color: theme.secondaryText }]}>#{getRef(booking.id)}</Text>
          <Text style={[styles.total, { color: theme.text }]}>£{total.toFixed(2)}</Text>
        </View>

        {/* Add-ons */}
        {booking.add_ons && booking.add_ons.length > 0 && (
          <Text style={[styles.addOns, { color: '#FF9500' }]} numberOfLines={1}>
            + {booking.add_ons.map((a) => a.name_snapshot).join(', ')}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ProviderBookingHistoryScreen({ navigation }: any) {
  const { theme, isDarkMode } = useTheme();
  const [bookings, setBookings] = useState<BookingWithAddOns[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const fetchBookings = useCallback(async () => {
    try {
      const all = await getProviderBookings();
      setBookings(all);
    } catch {
      // leave list empty on error
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchBookings().finally(() => setLoading(false));
  }, [fetchBookings]);

  // Refresh when navigating back from BookingDetail
  useFocusEffect(
    useCallback(() => {
      fetchBookings();
    }, [fetchBookings])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchBookings();
    setRefreshing(false);
  }, [fetchBookings]);

  const filtered = activeTab === 'all'
    ? bookings
    : bookings.filter((b) => b.status === activeTab);

  // Sort most-recent first
  const sorted = [...filtered].sort(
    (a, b) =>
      new Date(b.booking_date + 'T' + b.booking_time).getTime() -
      new Date(a.booking_date + 'T' + a.booking_time).getTime()
  );

  return (
    <ThemedBackground>
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={26} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Booking History</Text>
          <View style={{ width: 26 }} />
        </View>

        {/* Filter tabs */}
        <View style={[styles.tabBar, { borderBottomColor: theme.border }]}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[
                styles.tab,
                activeTab === tab.key && { borderBottomColor: theme.accent, borderBottomWidth: 2 },
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === tab.key ? theme.accent : theme.secondaryText },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.skeletonList}>
            {[1, 2, 3, 4, 5].map((k) => (
              <SkeletonRow key={k} isDarkMode={isDarkMode} />
            ))}
          </View>
        ) : sorted.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="receipt-outline" size={48} color={theme.secondaryText} />
            <Text style={[styles.emptyText, { color: theme.secondaryText }]}>No bookings found</Text>
          </View>
        ) : (
          <FlatList
            data={sorted}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <BookingRow
                booking={item}
                theme={theme}
                isDarkMode={isDarkMode}
                onPress={() =>
                  navigation.navigate('BookingDetail', {
                    bookingId: item.id,
                    booking: mapDbBookingToConfirmed(item),
                  })
                }
              />
            )}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.accent}
              />
            }
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    </ThemedBackground>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: { fontSize: 13, fontWeight: '500' },
  list: { padding: 16, gap: 12 },
  skeletonList: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 15 },
  row: {
    flexDirection: 'row',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  colorBar: { width: 4 },
  rowContent: { flex: 1, padding: 14, gap: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  serviceName: { fontSize: 15, fontWeight: '600', flex: 1, marginRight: 8 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  clientName: { fontSize: 13 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12 },
  metaIcon: { marginLeft: 8 },
  ref: { fontSize: 11, flex: 1 },
  total: { fontSize: 14, fontWeight: '600' },
  addOns: { fontSize: 12 },
});
