import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import SlidingTabs from '../../components/SlidingTabs';
import {
  getProviderBookings,
  getMyProviderProfile,
  getServicePrice,
  insertDirectBooking,
  getProviderWaitlist,
  inviteFromWaitlist,
  leaveWaitlist,
  type WaitlistEntry,
} from '../../services/databaseService';
import { mapDbBookingToConfirmed } from '../../contexts/BookingContext';
import type { BookingWithAddOns } from '../../types/database';
import { logger } from '../../utils/logger';
import { formatTime12, formatShortDate, formatLongDate, dateToYMD } from '../../utils/dateUtils';

// ─── Design tokens ────────────────────────────────────────────────────────────

const LIGHT = {
  bg:         '#F5F1EC',
  card:       '#FFFFFF',
  tile:       '#EDE8E2',
  accent:     '#5C4033',
  accentSoft: 'rgba(92,64,51,0.12)',
  text:       '#1C1A18',
  sub:        '#8A8680',
  faint:      '#B4ADA6',
  sep:        'rgba(0,0,0,0.06)',
};

const DARK = {
  bg:         '#1A1815',
  card:       '#252220',
  tile:       '#2E2B27',
  accent:     '#C7AAB0',
  accentSoft: 'rgba(199,170,176,0.16)',
  text:       '#F0ECE7',
  sub:        '#9A938C',
  faint:      '#6E6862',
  sep:        'rgba(255,255,255,0.06)',
};

type Palette = typeof LIGHT;

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS: Record<string, { bg: string; darkBg: string; color: string; label: string }> = {
  confirmed:   { bg: '#E8F5EE', darkBg: '#1B3D2A', color: '#2E7D52', label: 'Confirmed' },
  pending:     { bg: '#FBF1E0', darkBg: '#3D2E10', color: '#B8730A', label: 'Pending' },
  completed:   { bg: '#EAF0F6', darkBg: '#1E2C3A', color: '#3D6EA5', label: 'Completed' },
  cancelled:   { bg: '#FDEAEA', darkBg: '#3D1B1B', color: '#C73535', label: 'Cancelled' },
  no_show:     { bg: '#FDEAEA', darkBg: '#3D1B1B', color: '#C73535', label: 'No Show' },
  in_progress: { bg: '#F3EAFF', darkBg: '#2E1A40', color: '#7B2FBE', label: 'In Progress' },
};

function statusFor(s: string) {
  return STATUS[s] ?? { bg: '#EDEDF0', darkBg: '#2E2E32', color: '#6C6C72', label: s };
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

const toStr = (d: Date): string => dateToYMD(d);

const TODAY_STR = toStr(new Date());

function fmtTime(s: string): string {
  return formatTime12(s);
}

function fmtDayLabel(dateStr: string): string {
  if (dateStr === TODAY_STR) return 'Today';
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === toStr(yesterday)) return 'Yesterday';
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  if (dateStr === toStr(tomorrow)) return 'Tomorrow';
  return formatShortDate(dateStr);
}

function fmtMoney(n: number): string {
  return `£${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'all',          label: 'All' },
  { key: 'pending',      label: 'Pending' },
  { key: 'waitlist',     label: 'Waitlist' },
  { key: 'upcoming',     label: 'Upcoming' },
  { key: 'in_progress',  label: 'In Progress' },
  { key: 'completed',    label: 'Completed' },
  { key: 'cancelled',    label: 'Cancelled' },
] as const;

type TabKey = typeof TABS[number]['key'];
type BookingTab = Exclude<TabKey, 'waitlist'>;

function agendaSort(items: BookingWithAddOns[]): BookingWithAddOns[] {
  const upcoming = items
    .filter(b => b.booking_date >= TODAY_STR)
    .sort((a, b) => a.booking_date.localeCompare(b.booking_date) || a.booking_time.localeCompare(b.booking_time));
  const past = items
    .filter(b => b.booking_date < TODAY_STR)
    .sort((a, b) => b.booking_date.localeCompare(a.booking_date) || b.booking_time.localeCompare(a.booking_time));
  return [...upcoming, ...past];
}

function filterBookings(bookings: BookingWithAddOns[], tab: BookingTab): BookingWithAddOns[] {
  let items = bookings;
  switch (tab) {
    case 'pending':     items = items.filter(b => b.status === 'pending'); break;
    case 'upcoming':    items = items.filter(b => b.status === 'confirmed' && b.booking_date >= TODAY_STR); break;
    case 'in_progress': items = items.filter(b => b.status === 'in_progress'); break;
    case 'completed':   items = items.filter(b => b.status === 'completed'); break;
    case 'cancelled':   items = items.filter(b => b.status === 'cancelled' || b.status === 'no_show'); break;
  }
  if (tab === 'completed' || tab === 'cancelled') {
    return items.sort((a, b) => b.booking_date.localeCompare(a.booking_date) || b.booking_time.localeCompare(a.booking_time));
  }
  return agendaSort(items);
}

// ─── Booking card ─────────────────────────────────────────────────────────────

function BookingCard({ booking, dark, P, onPress }: {
  booking: BookingWithAddOns; dark: boolean; P: Palette; onPress: () => void;
}) {
  const st    = statusFor(booking.status);
  const total = (booking.base_price ?? 0) + (booking.add_ons_total ?? 0);
  const done  = booking.status === 'cancelled' || booking.status === 'no_show';
  const name  = booking.customer_name ?? 'Client';
  const initials = name.trim().split(/\s+/).map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase();
  const isGroup = booking.is_group_booking && booking.group_booking_count > 1;
  const timeStr = fmtTime(booking.booking_time) + (booking.end_time ? ` – ${fmtTime(booking.end_time)}` : '');

  return (
    <TouchableOpacity activeOpacity={0.75} onPress={onPress} style={[bc.card, { backgroundColor: P.card }, !dark && bc.shadow]}>

      {/* Avatar */}
      <View style={[bc.avatar, { backgroundColor: st.color + (dark ? '28' : '18') }]}>
        <Text style={[bc.avatarText, { color: st.color, opacity: done ? 0.5 : 1 }]}>{initials}</Text>
      </View>

      {/* Body */}
      <View style={bc.body}>
        <View style={bc.nameRow}>
          <Text style={[bc.name, { color: P.text, opacity: done ? 0.5 : 1 }]} numberOfLines={1}>
            {name}
          </Text>
          {isGroup && (
            <View style={[bc.groupTag, { backgroundColor: P.accentSoft }]}>
              <Ionicons name="people" size={10} color={P.accent} />
              <Text style={[bc.groupCount, { color: P.accent }]}>{booking.group_booking_count}</Text>
            </View>
          )}
        </View>
        <Text style={[bc.service, { color: P.sub, textDecorationLine: done ? 'line-through' : 'none', opacity: done ? 0.6 : 1 }]} numberOfLines={1}>
          {booking.service_name_snapshot}
        </Text>
        <Text style={[bc.time, { color: P.faint }]}>{fmtDayLabel(booking.booking_date)} · {timeStr}</Text>
      </View>

      {/* Right side */}
      <View style={bc.right}>
        <View style={[bc.pill, { backgroundColor: dark ? st.darkBg : st.bg }]}>
          <Text style={[bc.pillText, { color: st.color }]}>{st.label}</Text>
        </View>
        {total > 0 ? (
          <Text style={[bc.price, { color: done ? P.faint : P.text }]}>{fmtMoney(total)}</Text>
        ) : (
          <View />
        )}
      </View>

    </TouchableOpacity>
  );
}

const bc = StyleSheet.create({
  card:      { flexDirection: 'row', alignItems: 'center', borderRadius: 18, padding: 14, gap: 13 },
  shadow:    { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  avatar:    { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText:{ fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  body:      { flex: 1, gap: 3 },
  nameRow:   { flexDirection: 'row', alignItems: 'center', gap: 7 },
  name:      { fontSize: 15, fontWeight: '700', letterSpacing: -0.2, flex: 1 },
  groupTag:  { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  groupCount:{ fontSize: 10, fontWeight: '800' },
  service:   { fontSize: 13, fontWeight: '500' },
  time:      { fontSize: 12, fontWeight: '500' },
  right:     { alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, flexShrink: 0, minHeight: 46 },
  pill:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  pillText:  { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  price:     { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
});

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function SkeletonList({ dark, P }: { dark: boolean; P: Palette }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.65] });
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Animated.View style={{ backgroundColor: P.card, borderRadius: 10, height: 14, width: 100, opacity, marginBottom: 2 }} />
      {[1, 2, 3, 4].map(k => (
        <Animated.View key={k} style={[{ backgroundColor: P.card, borderRadius: 18, height: 80, opacity }, !dark && bc.shadow]} />
      ))}
    </View>
  );
}

// Sliding tab bar now lives in ../components/SlidingTabs (shared across the
// app) — this screen was the original source of that look/animation.

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ProviderBookingHistoryScreen({ navigation }: any) {
  const { isDarkMode: dark } = useTheme();
  const P = dark ? DARK : LIGHT;

  const [bookings, setBookings]         = useState<BookingWithAddOns[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [activeTab, setActiveTab]       = useState<TabKey>('all');
  const [waitlist, setWaitlist]         = useState<WaitlistEntry[]>([]);
  const [providerDbId, setProviderDbId] = useState<string | null>(null);

  // Waitlist invite modal
  const [inviteModal, setInviteModal]   = useState<{ visible: boolean; entry: WaitlistEntry | null }>({ visible: false, entry: null });
  const [inviteDate, setInviteDate]     = useState<Date | null>(null);
  const [inviteTime, setInviteTime]     = useState<Date | null>(null);
  const [showInviteDatePicker, setShowInviteDatePicker] = useState(false);
  const [showInviteTimePicker, setShowInviteTimePicker] = useState(false);
  const [inviting, setInviting]         = useState(false);

  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    getMyProviderProfile().then(p => { if (p?.id) setProviderDbId(p.id); });
  }, []);

  const fetchBookings = useCallback(async () => {
    try { setBookings(await getProviderBookings()); } catch {}
  }, []);

  const fetchWaitlist = useCallback(async () => {
    if (!providerDbId) return;
    try { setWaitlist(await getProviderWaitlist(providerDbId)); } catch {}
  }, [providerDbId]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchBookings(), fetchWaitlist()]).finally(() => setLoading(false));
  }, [fetchBookings, fetchWaitlist]);

  useFocusEffect(useCallback(() => {
    fetchBookings();
    fetchWaitlist();
  }, [fetchBookings, fetchWaitlist]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchBookings(), fetchWaitlist()]);
    setRefreshing(false);
  }, [fetchBookings, fetchWaitlist]);

  const handleTabPress = useCallback((key: TabKey) => {
    setActiveTab(key);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  // ── Derived data ─────────────────────────────────────────────────────────

  const counts = useMemo(() => ({
    all:         bookings.length,
    pending:     bookings.filter(b => b.status === 'pending').length,
    upcoming:    bookings.filter(b => b.status === 'confirmed' && b.booking_date >= TODAY_STR).length,
    in_progress: bookings.filter(b => b.status === 'in_progress').length,
    completed:   bookings.filter(b => b.status === 'completed').length,
    cancelled:   bookings.filter(b => b.status === 'cancelled' || b.status === 'no_show').length,
    waitlist:    waitlist.filter(e => e.status === 'waiting').length,
  }), [bookings, waitlist]);

  const items = useMemo(() => {
    if (activeTab === 'waitlist') return [];
    return filterBookings(bookings, activeTab as BookingTab);
  }, [bookings, activeTab]);

  const tabEmptyText: Record<TabKey, string> = {
    all:         'No bookings yet',
    pending:     'No pending bookings',
    upcoming:    'No upcoming bookings',
    in_progress: 'No bookings in progress',
    completed:   'No completed bookings',
    cancelled:   'No cancelled bookings',
    waitlist:    'No one on the waitlist',
  };

  // ── Waitlist invite ───────────────────────────────────────────────────────

  const openInvitePicker = useCallback((which: 'date' | 'time') => {
    if (Platform.OS === 'android') {
      const { DateTimePickerAndroid } = require('@react-native-community/datetimepicker');
      DateTimePickerAndroid.open({
        value: (which === 'date' ? inviteDate : inviteTime) ?? new Date(),
        mode: which,
        minimumDate: which === 'date' ? new Date() : undefined,
        onChange: (_: unknown, d?: Date) => { if (d) { if (which === 'date') setInviteDate(d); else setInviteTime(d); } },
      });
    } else {
      if (which === 'date') { setShowInviteTimePicker(false); setShowInviteDatePicker(true); }
      else { setShowInviteDatePicker(false); setShowInviteTimePicker(true); }
    }
  }, [inviteDate, inviteTime]);

  const handleConfirmInvite = useCallback(async () => {
    if (!inviteModal.entry || !providerDbId || !inviteDate || !inviteTime) return;
    setInviting(true);
    try {
      const entry = inviteModal.entry;
      let basePrice = 0;
      if (entry.service_id) {
        basePrice = await getServicePrice(entry.service_id);
      }
      const bookingDate = inviteDate.toISOString().split('T')[0]!;
      const bookingTime = inviteTime.toTimeString().split(' ')[0]!;
      await insertDirectBooking({
        user_id: entry.user_id,
        provider_id: providerDbId,
        service_id: entry.service_id,
        status: 'pending',
        booking_date: bookingDate,
        booking_time: bookingTime,
        payment_type: 'full',
        base_price: basePrice,
        add_ons_total: 0,
        service_charge: 0,
        deposit_amount: 0,
        amount_paid: 0,
        remaining_balance: basePrice,
        payment_status: 'pending',
        is_group_booking: false,
        group_booking_count: 1,
        provider_name_snapshot: entry.provider_name_snapshot,
        service_name_snapshot: entry.service_name_snapshot,
      });
      await inviteFromWaitlist(entry);
      setWaitlist(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'booked' as const } : e));
      setInviteModal({ visible: false, entry: null });
      setInviteDate(null);
      setInviteTime(null);
    } catch (err) {
      logger.error('Invite failed:', err);
      Alert.alert('Invite failed', 'The booking could not be created. Please check your connection and try again.');
    }
    setInviting(false);
  }, [inviteModal.entry, providerDbId, inviteDate, inviteTime]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[s.root, { backgroundColor: P.bg }]}>
      <SafeAreaView style={s.safe} edges={['top']}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <View style={s.header}>
          <TouchableOpacity
            style={[s.iconBtn, { backgroundColor: P.tile }]}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={18} color={P.text} />
          </TouchableOpacity>

          <View style={s.headerBody}>
            <Text style={[s.headerTitle, { color: P.text }]}>Bookings</Text>
            <Text style={[s.headerSub, { color: P.sub }]} numberOfLines={1}>
              {counts.upcoming > 0 ? `${counts.upcoming} upcoming` : 'Nothing upcoming'}
              {counts.pending > 0 ? ` · ${counts.pending} pending` : ''}
            </Text>
          </View>

          <TouchableOpacity
            style={s.devBtn}
            onPress={() => navigation.navigate('DevSettings')}
            activeOpacity={0.8}
          >
            <Text style={s.devBtnText}>DEV</Text>
          </TouchableOpacity>
        </View>

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <View style={{ paddingBottom: 16 }}>
          <SlidingTabs
            tabs={TABS.map(tab => ({ ...tab, count: counts[tab.key] }))}
            activeKey={activeTab}
            onPress={handleTabPress}
            accentColor={P.accent}
            inactiveTextColor={P.sub}
          />
        </View>

        {/* ── Content ─────────────────────────────────────────────────── */}
        {loading ? (
          <SkeletonList dark={dark} P={P} />
        ) : activeTab === 'waitlist' ? (
          <FlatList
            data={waitlist}
            keyExtractor={e => e.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P.accent} />}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[s.listContent, waitlist.length === 0 && s.listCentered]}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item: entry }) => (
              <View style={[wl.card, { backgroundColor: P.card }, !dark && bc.shadow]}>
                <View style={wl.cardTop}>
                  <View style={[wl.avatar, { backgroundColor: P.tile }]}>
                    <Text style={[wl.avatarText, { color: P.text }]}>
                      {(entry.user_name_snapshot?.[0] ?? '?').toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[wl.clientName, { color: P.text }]} numberOfLines={1}>
                      {entry.user_name_snapshot ?? 'Client'}
                    </Text>
                    <Text style={[wl.serviceName, { color: P.sub }]} numberOfLines={1}>
                      {entry.service_name_snapshot}
                    </Text>
                  </View>
                  <View style={[wl.posBadge, { backgroundColor: entry.status === 'notified' ? 'rgba(52,199,89,0.15)' : 'rgba(255,149,0,0.15)' }]}>
                    <Text style={[wl.posBadgeText, { color: entry.status === 'notified' ? '#34C759' : '#FF9500' }]}>
                      {entry.status === 'notified' ? 'Holding Slot' : `Waiting · #${entry.position}`}
                    </Text>
                  </View>
                </View>
                {/* A hold (waitlist_holds.sql) reserves the slot for 3 hours from
                    notified_at — shown as an estimate rather than fetched from
                    the linked bookings row, since this list is optimised for
                    provider skimming, not authoritative countdown precision. */}
                {entry.status === 'notified' && entry.notified_at ? (
                  <Text style={[wl.preferredDates, { color: '#34C759' }]}>
                    Expires around {formatTime12(new Date(new Date(entry.notified_at).getTime() + 3 * 60 * 60 * 1000))} if not confirmed
                  </Text>
                ) : null}
                {entry.notes ? <Text style={[wl.notes, { color: P.sub }]} numberOfLines={2}>{entry.notes}</Text> : null}
                {entry.preferred_dates && entry.preferred_dates.length > 0 ? (
                  <Text style={[wl.preferredDates, { color: P.sub }]}>
                    Preferred: {entry.preferred_dates.length > 1
                      ? `${formatShortDate(entry.preferred_dates[0]!)} – ${formatShortDate(entry.preferred_dates[1]!)}`
                      : `${formatShortDate(entry.preferred_dates[0]!)} onward`}
                  </Text>
                ) : null}
                <View style={wl.actions}>
                  {entry.status === 'waiting' && (
                    <TouchableOpacity style={[wl.inviteBtn, { backgroundColor: P.accent }]} activeOpacity={0.8}
                      onPress={() => setInviteModal({ visible: true, entry })}>
                      <Text style={wl.inviteBtnText}>Schedule & Invite</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[wl.removeBtn, { borderColor: P.sep }]} activeOpacity={0.8}
                    onPress={() => {
                      leaveWaitlist(entry.id)
                        .then(() => setWaitlist(prev => prev.filter(e => e.id !== entry.id)))
                        .catch(() => {});
                    }}>
                    <Text style={[wl.removeBtnText, { color: P.sub }]}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={s.emptyWrap}>
                <Ionicons name="people-outline" size={44} color={P.faint} style={{ marginBottom: 12 }} />
                <Text style={[s.emptyTitle, { color: P.text }]}>Nothing here</Text>
                <Text style={[s.emptySub, { color: P.sub }]}>{tabEmptyText['waitlist']}</Text>
              </View>
            }
          />
        ) : (
          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={b => b.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P.accent} />}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[s.listContent, items.length === 0 && s.listCentered]}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item }) => (
              <BookingCard
                booking={item}
                dark={dark}
                P={P}
                onPress={() => navigation.navigate('BookingDetail', { bookingId: item.id, booking: mapDbBookingToConfirmed(item) })}
              />
            )}
            ListEmptyComponent={
              <View style={s.emptyWrap}>
                <Ionicons name="calendar-outline" size={44} color={P.faint} style={{ marginBottom: 12 }} />
                <Text style={[s.emptyTitle, { color: P.text }]}>Nothing here</Text>
                <Text style={[s.emptySub, { color: P.sub }]}>{tabEmptyText[activeTab]}</Text>
              </View>
            }
          />
        )}

        {/* ── Waitlist invite modal ────────────────────────────────────── */}
        <Modal visible={inviteModal.visible} transparent animationType="fade"
          onRequestClose={() => setInviteModal({ visible: false, entry: null })}>
          <View style={wl.backdrop}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setInviteModal({ visible: false, entry: null })} />
            <View style={[wl.popupCard, { backgroundColor: P.card }]}>
              <View style={wl.popupHeader}>
                <View style={[wl.popupIcon, { backgroundColor: P.accentSoft }]}>
                  <Ionicons name="calendar-outline" size={20} color={P.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[wl.popupTitle, { color: P.text }]}>Schedule Appointment</Text>
                  <Text style={[wl.popupSub, { color: P.sub }]} numberOfLines={1}>
                    {inviteModal.entry?.user_name_snapshot ?? 'Client'} · {inviteModal.entry?.service_name_snapshot}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setInviteModal({ visible: false, entry: null })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.6}>
                  <Ionicons name="close" size={20} color={P.sub} />
                </TouchableOpacity>
              </View>
              {inviteModal.entry?.preferred_dates && inviteModal.entry.preferred_dates.length > 0 && (
                <View style={[wl.prefRow, { backgroundColor: P.accentSoft, borderColor: P.accent + '30' }]}>
                  <Ionicons name="information-circle-outline" size={14} color={P.accent} />
                  <Text style={[wl.prefText, { color: P.accent }]}>
                    Client prefers: {inviteModal.entry.preferred_dates.map(d => formatShortDate(d)).join(' – ')}
                  </Text>
                </View>
              )}
              <Text style={[wl.popupLabel, { color: P.sub }]}>DATE</Text>
              <View style={[wl.dateBlock, { borderColor: P.sub + '30' }]}>
                <TouchableOpacity style={[wl.dateRow, { borderBottomColor: P.sub + '20' }]} onPress={() => openInvitePicker('date')} activeOpacity={0.7}>
                  <Ionicons name="calendar-outline" size={15} color={P.sub} />
                  <Text style={[wl.dateLabel, { color: P.sub }]}>Date</Text>
                  <Text style={[wl.dateValue, { color: inviteDate ? P.text : P.sub, opacity: inviteDate ? 1 : 0.5 }]}>
                    {inviteDate ? formatLongDate(inviteDate) : 'Select date'}
                  </Text>
                  <Ionicons name="chevron-forward" size={13} color={P.sub} style={{ opacity: 0.4 }} />
                </TouchableOpacity>
                <TouchableOpacity style={wl.dateRow} onPress={() => openInvitePicker('time')} activeOpacity={0.7}>
                  <Ionicons name="time-outline" size={15} color={P.sub} />
                  <Text style={[wl.dateLabel, { color: P.sub }]}>Time</Text>
                  <Text style={[wl.dateValue, { color: inviteTime ? P.text : P.sub, opacity: inviteTime ? 1 : 0.5 }]}>
                    {inviteTime ? formatTime12(inviteTime) : 'Select time'}
                  </Text>
                  <Ionicons name="chevron-forward" size={13} color={P.sub} style={{ opacity: 0.4 }} />
                </TouchableOpacity>
              </View>
              {Platform.OS === 'ios' && showInviteDatePicker && (
                <View>
                  <TouchableOpacity style={[wl.pickerDone, { borderBottomColor: P.sub + '20' }]} onPress={() => setShowInviteDatePicker(false)} activeOpacity={0.7}>
                    <Text style={[wl.pickerDoneText, { color: P.accent }]}>Done</Text>
                  </TouchableOpacity>
                  <DateTimePicker value={inviteDate ?? new Date()} mode="date" display="spinner" minimumDate={new Date()} onChange={(_, d) => { if (d) setInviteDate(d); }} />
                </View>
              )}
              {Platform.OS === 'ios' && showInviteTimePicker && (
                <View>
                  <TouchableOpacity style={[wl.pickerDone, { borderBottomColor: P.sub + '20' }]} onPress={() => setShowInviteTimePicker(false)} activeOpacity={0.7}>
                    <Text style={[wl.pickerDoneText, { color: P.accent }]}>Done</Text>
                  </TouchableOpacity>
                  <DateTimePicker value={inviteTime ?? new Date()} mode="time" display="spinner" onChange={(_, d) => { if (d) setInviteTime(d); }} />
                </View>
              )}
              <View style={wl.popupActions}>
                <TouchableOpacity style={[wl.cancelBtn, { borderColor: P.sub + '40' }]} onPress={() => setInviteModal({ visible: false, entry: null })} activeOpacity={0.7}>
                  <Text style={[wl.cancelText, { color: P.sub }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[wl.confirmBtn, { backgroundColor: P.accent, opacity: (!inviteDate || !inviteTime || inviting) ? 0.5 : 1 }]}
                  onPress={handleConfirmInvite}
                  disabled={!inviteDate || !inviteTime || inviting}
                  activeOpacity={0.8}
                >
                  <Text style={wl.confirmText}>{inviting ? 'Sending…' : 'Confirm & Invite'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },

  // Header
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 14, gap: 12 },
  iconBtn:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerBody:  { flex: 1 },
  headerTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.7 },
  headerSub:   { fontSize: 12, marginTop: 1 },
  devBtn:      { backgroundColor: '#FF3B30', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8 },
  devBtnText:  { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },

  // List
  listContent:  { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 120 },
  listCentered: { flexGrow: 1, justifyContent: 'center' },

  // Empty state
  emptyWrap:    { alignItems: 'center', paddingTop: 40 },
  emptyTitle:   { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  emptySub:     { fontSize: 14, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 },
});

// ─── Waitlist + invite modal styles ──────────────────────────────────────────

const wl = StyleSheet.create({
  card:         { borderRadius: 18, padding: 14 },
  cardTop:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  avatar:       { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText:   { fontSize: 16, fontWeight: '700' },
  clientName:   { fontSize: 14, fontWeight: '600', letterSpacing: -0.2 },
  serviceName:  { fontSize: 11, marginTop: 2 },
  posBadge:     { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  posBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  notes:        { fontSize: 12, lineHeight: 17, marginBottom: 6 },
  preferredDates:{ fontSize: 11, marginBottom: 6 },
  actions:      { flexDirection: 'row', gap: 8, marginTop: 6 },
  inviteBtn:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 20 },
  inviteBtnText:{ fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },
  removeBtn:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
  removeBtnText:{ fontSize: 12 },

  backdrop:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 22 },
  popupCard:    { width: '100%', borderRadius: 22, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 28, elevation: 12 },
  popupHeader:  { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 12 },
  popupIcon:    { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  popupTitle:   { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  popupSub:     { fontSize: 11, marginTop: 2 },
  popupLabel:   { fontSize: 9, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 7, marginTop: 14 },
  prefRow:      { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 10, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8, marginBottom: 4 },
  prefText:     { fontSize: 11, fontWeight: '600', flex: 1 },
  dateBlock:    { borderRadius: 13, borderWidth: 1, overflow: 'hidden', marginBottom: 4 },
  dateRow:      { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  dateLabel:    { fontSize: 10, fontWeight: '700', width: 30, letterSpacing: 0.3 },
  dateValue:    { flex: 1, fontSize: 12 },
  pickerDone:   { alignItems: 'flex-end', paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerDoneText:{ fontSize: 14, fontWeight: '700' },
  popupActions: { flexDirection: 'row', gap: 9, marginTop: 16 },
  cancelBtn:    { flex: 1, borderRadius: 13, borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
  cancelText:   { fontSize: 12, fontWeight: '600' },
  confirmBtn:   { flex: 1.6, borderRadius: 13, paddingVertical: 12, alignItems: 'center' },
  confirmText:  { fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
});
