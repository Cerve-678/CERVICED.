import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
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
import { useTheme } from '../contexts/ThemeContext';
import { getProviderBookings } from '../services/databaseService';
import { mapDbBookingToConfirmed } from '../contexts/BookingContext';
import type { BookingWithAddOns } from '../types/database';
import { ThemedBackground } from '../components/ThemedBackground';
import { supabase } from '../lib/supabase';
import * as WaitlistService from '../services/WaitlistService';
import type { WaitlistEntry } from '../services/WaitlistService';
import { logger } from '../utils/logger';

// ─── Design tokens ──────────────────────────────────────────────────────────

const LIGHT = {
  bg:        '#F5F1EC',
  card:      '#FFFFFF',
  strip:     '#EDE8E2',
  tile:      '#E3DDD7',
  indicator: '#0A84FF',
  text:      '#1C1A18',
  sub:       '#8A8680',
  sep:       'rgba(0,0,0,0.06)',
};

const DARK = {
  bg:        '#1A1815',
  card:      '#252220',
  strip:     '#201D1A',
  tile:      '#2E2B27',
  indicator: '#2F91FF',
  text:      '#F0ECE7',
  sub:       '#8A8580',
  sep:       'rgba(255,255,255,0.06)',
};

// ─── Status pills ───────────────────────────────────────────────────────────

const STATUS: Record<string, { bg: string; darkBg: string; color: string; label: string }> = {
  confirmed:   { bg: '#E8F5EE', darkBg: '#1B3D2A', color: '#2E7D52', label: 'Confirmed' },
  pending:     { bg: '#FBF1E0', darkBg: '#3D2E10', color: '#B8730A', label: 'Pending' },
  completed:   { bg: '#E8F5EE', darkBg: '#1B3D2A', color: '#2E7D52', label: 'Completed' },
  cancelled:   { bg: '#FDEAEA', darkBg: '#3D1B1B', color: '#C73535', label: 'Cancelled' },
  no_show:     { bg: '#FDEAEA', darkBg: '#3D1B1B', color: '#C73535', label: 'No Show' },
  in_progress: { bg: '#F3EAFF', darkBg: '#2E1A40', color: '#7B2FBE', label: 'In Progress' },
};

function statusFor(s: string) {
  return STATUS[s] ?? { bg: '#EDEDF0', darkBg: '#2E2E32', color: '#6C6C72', label: s };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const toStr = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const TODAY_STR = toStr(new Date());

function fmtTime(s: string): string {
  const [h, m] = s.split(':').map(Number);
  const ap  = h! >= 12 ? 'pm' : 'am';
  const h12 = h === 0 ? 12 : h! > 12 ? h! - 12 : h!;
  return `${h12}:${String(m).padStart(2, '0')}${ap}`;
}

function fmtRange(start: string, end: string | null): string {
  return end ? `${fmtTime(start)} – ${fmtTime(end)}` : fmtTime(start);
}

function fmtDate(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const date = new Date(y!, mo! - 1, d!);
  if (dateStr === TODAY_STR) return 'Today';
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === toStr(yesterday)) return 'Yesterday';
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  if (dateStr === toStr(tomorrow)) return 'Tomorrow';
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'all',         label: 'All' },
  { key: 'pending',     label: 'Pending' },
  { key: 'waitlist',    label: 'Waitlist' },
  { key: 'upcoming',    label: 'Upcoming' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed',   label: 'Completed' },
  { key: 'cancelled',   label: 'Cancelled' },
] as const;

type TabKey = typeof TABS[number]['key'];

function filterBookings(bookings: BookingWithAddOns[], tab: Exclude<TabKey, 'waitlist'>): BookingWithAddOns[] {
  let filtered: BookingWithAddOns[];
  switch (tab) {
    case 'pending':     filtered = bookings.filter(b => b.status === 'pending'); break;
    case 'upcoming':    filtered = bookings.filter(b => b.status === 'confirmed' && b.booking_date >= TODAY_STR); break;
    case 'in_progress': filtered = bookings.filter(b => b.status === 'in_progress'); break;
    case 'completed':   filtered = bookings.filter(b => b.status === 'completed'); break;
    case 'cancelled':   filtered = bookings.filter(b => b.status === 'cancelled' || b.status === 'no_show'); break;
    default:            filtered = bookings;
  }
  if (tab === 'completed' || tab === 'cancelled') {
    return filtered.sort((a, b) =>
      b.booking_date.localeCompare(a.booking_date) || b.booking_time.localeCompare(a.booking_time)
    );
  }
  return filtered.sort((a, b) =>
    a.booking_date.localeCompare(b.booking_date) || a.booking_time.localeCompare(b.booking_time)
  );
}

// ─── Event card ─────────────────────────────────────────────────────────────

function EventCard({
  booking,
  dark,
  P,
  onPress,
}: {
  booking: BookingWithAddOns;
  dark: boolean;
  P: typeof LIGHT;
  onPress: () => void;
}) {
  const st     = statusFor(booking.status);
  const time   = fmtRange(booking.booking_time, booking.end_time);
  const date   = fmtDate(booking.booking_date);
  const done   = booking.status === 'cancelled' || booking.status === 'no_show';
  const pillBg = dark ? st.darkBg : st.bg;

  return (
    <TouchableOpacity
      activeOpacity={0.78}
      onPress={onPress}
      style={[ec.wrap, { backgroundColor: P.card, shadowColor: dark ? 'transparent' : '#000' }]}
    >
      <View style={ec.left}>
        <View style={[ec.pill, { backgroundColor: pillBg }]}>
          <Text style={[ec.pillText, { color: st.color }]}>{st.label}</Text>
        </View>
        <Text
          style={[ec.title, { color: P.text, textDecorationLine: done ? 'line-through' : 'none' }]}
          numberOfLines={1}
        >
          {booking.service_name_snapshot}
        </Text>
        {booking.customer_name ? (
          <Text style={[ec.sub, { color: P.sub }]} numberOfLines={1}>
            {booking.customer_name}
          </Text>
        ) : null}
      </View>

      <View style={ec.right}>
        <Text style={[ec.time, { color: P.text }]}>{time}</Text>
        <Text style={[ec.date, { color: P.sub }]}>{date}</Text>
      </View>
    </TouchableOpacity>
  );
}

const ec = StyleSheet.create({
  wrap:     { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 14, shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  left:     { flex: 1, gap: 4 },
  pill:     { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20 },
  pillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  title:    { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  sub:      { fontSize: 12 },
  right:    { alignItems: 'flex-end', gap: 3, minWidth: 72 },
  time:     { fontSize: 13, fontWeight: '600' },
  date:     { fontSize: 11 },
});

// ─── Skeleton ────────────────────────────────────────────────────────────────

function SkeletonList({ dark, P }: { dark: boolean; P: typeof LIGHT }) {
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
      {[1, 2, 3, 4].map(k => (
        <Animated.View
          key={k}
          style={{
            backgroundColor: P.card,
            borderRadius: 16,
            height: 90,
            opacity,
            shadowColor: dark ? 'transparent' : '#000',
            shadowOpacity: 0.06,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
          }}
        />
      ))}
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function ProviderBookingHistoryScreen({ navigation }: any) {
  const { isDarkMode: dark } = useTheme();
  const P = dark ? DARK : LIGHT;

  const [bookings, setBookings]         = useState<BookingWithAddOns[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [activeTab, setActiveTab]       = useState<TabKey>('all');
  const [waitlist, setWaitlist]         = useState<WaitlistEntry[]>([]);
  const [providerDbId, setProviderDbId] = useState<string | null>(null);
  const [inviteModal, setInviteModal]   = useState<{ visible: boolean; entry: WaitlistEntry | null }>({ visible: false, entry: null });
  const [inviteDate, setInviteDate]     = useState<Date | null>(null);
  const [inviteTime, setInviteTime]     = useState<Date | null>(null);
  const [showInviteDatePicker, setShowInviteDatePicker] = useState(false);
  const [showInviteTimePicker, setShowInviteTimePicker] = useState(false);
  const [inviting, setInviting]         = useState(false);

  // Load the current provider's DB id for waitlist queries
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('providers').select('id').eq('user_id', user.id).maybeSingle()
        .then(({ data }) => { if (data?.id) setProviderDbId(data.id); });
    });
  }, []);

  const listRef     = useRef<FlatList>(null);
  const sliderLeft  = useRef(new Animated.Value(0)).current;
  const sliderWidth = useRef(new Animated.Value(0)).current;
  const tabLayouts  = useRef<Record<string, { x: number; width: number }>>({});
  const sliderReady = useRef(false);

  const handleTabLayout = useCallback((key: string, x: number, width: number) => {
    tabLayouts.current[key] = { x, width };
    if (!sliderReady.current && key === 'all') {
      sliderLeft.setValue(x);
      sliderWidth.setValue(width);
      sliderReady.current = true;
    }
  }, [sliderLeft, sliderWidth]);

  const handleTabPress = useCallback((key: TabKey) => {
    setActiveTab(key);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    const layout = tabLayouts.current[key];
    if (layout) {
      Animated.parallel([
        Animated.timing(sliderLeft,  { toValue: layout.x,     duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        Animated.timing(sliderWidth, { toValue: layout.width, duration: 240, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      ]).start();
    }
  }, [sliderLeft, sliderWidth]);

  const fetchBookings = useCallback(async () => {
    try { setBookings(await getProviderBookings()); } catch {}
  }, []);

  const fetchWaitlist = useCallback(async () => {
    if (!providerDbId) return;
    try { setWaitlist(await WaitlistService.getProviderWaitlist(providerDbId)); } catch {}
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

  const visibleBookings = useMemo(
    () => activeTab === 'waitlist' ? [] : filterBookings(bookings, activeTab as Exclude<TabKey, 'waitlist'>),
    [bookings, activeTab]
  );

  const counts = useMemo(() => ({
    all:         bookings.length,
    pending:     bookings.filter(b => b.status === 'pending').length,
    upcoming:    bookings.filter(b => b.status === 'confirmed' && b.booking_date >= TODAY_STR).length,
    in_progress: bookings.filter(b => b.status === 'in_progress').length,
    completed:   bookings.filter(b => b.status === 'completed').length,
    cancelled:   bookings.filter(b => b.status === 'cancelled' || b.status === 'no_show').length,
    waitlist:    waitlist.filter(e => e.status === 'waiting').length,
  }), [bookings, waitlist]);

  const tabEmptyText: Record<TabKey, string> = {
    all:         'No bookings yet',
    pending:     'No pending bookings',
    upcoming:    'No upcoming bookings',
    in_progress: 'No bookings in progress',
    completed:   'No completed bookings',
    cancelled:   'No cancelled bookings',
    waitlist:    'No one on the waitlist',
  };

  const openInvitePicker = useCallback((which: 'date' | 'time') => {
    if (Platform.OS === 'android') {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
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
        const { data: svc } = await supabase.from('services').select('price').eq('id', entry.service_id).maybeSingle();
        basePrice = Number(svc?.price ?? 0);
      }
      const bookingDate = inviteDate.toISOString().split('T')[0]!;
      const bookingTime = inviteTime.toTimeString().split(' ')[0]!;
      const { error } = await supabase.from('bookings').insert({
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
      if (error) throw error;
      await WaitlistService.inviteFromWaitlist(entry);
      setWaitlist(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'notified' as const } : e));
      setInviteModal({ visible: false, entry: null });
      setInviteDate(null);
      setInviteTime(null);
    } catch (err) {
      logger.error('Invite failed:', err);
      Alert.alert('Invite failed', 'The booking could not be created. Please check your connection and try again.');
    }
    setInviting(false);
  }, [inviteModal.entry, providerDbId, inviteDate, inviteTime]);

  return (
    <View style={[s.root, { backgroundColor: P.bg }]}>
      <SafeAreaView style={s.safe} edges={['top']}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <View style={[s.header, { borderBottomColor: P.sep }]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={[s.iconBtn, { backgroundColor: P.tile }]}
          >
            <Ionicons name="chevron-back" size={18} color={P.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: P.text }]}>Booking History</Text>
          <View style={s.iconBtn} />
        </View>

        {/* ── Tab bar ─────────────────────────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tabBarOuter}
          style={{ backgroundColor: P.strip }}
        >
          <View style={s.tabBarInner}>
            <Animated.View
              style={[s.tabSlider, { backgroundColor: P.text, left: sliderLeft, width: sliderWidth }]}
            />
            {TABS.map((tab, i) => {
              const active = tab.key === activeTab;
              const count  = counts[tab.key];
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[s.tab, i < TABS.length - 1 && s.tabGap]}
                  onLayout={e => handleTabLayout(tab.key, e.nativeEvent.layout.x, e.nativeEvent.layout.width)}
                  onPress={() => handleTabPress(tab.key)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.tabText, { color: active ? P.bg : P.sub }]}>{tab.label}</Text>
                  {count > 0 && (
                    <View style={[s.tabBadge, { backgroundColor: active ? (dark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.25)') : P.tile }]}>
                      <Text style={[s.tabBadgeText, { color: active ? P.bg : P.text }]}>{count}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* ── Booking list ────────────────────────────────────────────── */}
        {loading ? (
          <SkeletonList dark={dark} P={P} />
        ) : activeTab === 'waitlist' ? (
            <FlatList
              data={waitlist}
              keyExtractor={e => e.id}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P.indicator} />}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[s.listContent, waitlist.length === 0 && s.listCentered]}
              ItemSeparatorComponent={() => <View style={[s.listSep, { backgroundColor: P.sep }]} />}
              renderItem={({ item: entry }) => (
                <View style={[wl.card, { backgroundColor: P.card }]}>
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
                        {entry.status === 'notified' ? 'Invited' : 'Waiting'}
                      </Text>
                    </View>
                  </View>
                  {entry.notes ? (
                    <Text style={[wl.notes, { color: P.sub }]} numberOfLines={2}>{entry.notes}</Text>
                  ) : null}
                  {entry.preferred_dates && entry.preferred_dates.length > 0 ? (
                    <Text style={[wl.preferredDates, { color: P.sub }]}>
                      Preferred: {entry.preferred_dates.map(d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })).join(', ')}
                    </Text>
                  ) : null}
                  <View style={wl.actions}>
                    {entry.status === 'waiting' && (
                      <TouchableOpacity
                        style={[wl.inviteBtn, { backgroundColor: P.indicator }]}
                        activeOpacity={0.8}
                        onPress={() => setInviteModal({ visible: true, entry })}
                      >
                        <Text style={wl.inviteBtnText}>Schedule & Invite</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[wl.removeBtn, { borderColor: P.sep }]}
                      activeOpacity={0.8}
                      onPress={() => {
                        WaitlistService.leaveWaitlist(entry.id).then(() => {
                          setWaitlist(prev => prev.filter(e => e.id !== entry.id));
                        }).catch(() => {});
                      }}
                    >
                      <Text style={[wl.removeBtnText, { color: P.sub }]}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <View style={s.emptyWrap}>
                  <Ionicons name="people-outline" size={44} color={P.sub} style={{ opacity: 0.45, marginBottom: 12 }} />
                  <Text style={[s.emptyTitle, { color: P.text }]}>Nothing here</Text>
                  <Text style={[s.emptySub, { color: P.sub }]}>{tabEmptyText['waitlist']}</Text>
                </View>
              }
            />
          ) : (
          <FlatList
            ref={listRef}
            data={visibleBookings}
            keyExtractor={b => b.id}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={P.indicator}
              />
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              s.listContent,
              visibleBookings.length === 0 && s.listCentered,
            ]}
            ItemSeparatorComponent={() => <View style={[s.listSep, { backgroundColor: P.sep }]} />}
            renderItem={({ item }) => (
              <EventCard
                booking={item}
                dark={dark}
                P={P}
                onPress={() =>
                  navigation.navigate('BookingDetail', {
                    bookingId: item.id,
                    booking: mapDbBookingToConfirmed(item),
                  })
                }
              />
            )}
            ListEmptyComponent={
              <View style={s.emptyWrap}>
                <Ionicons
                  name="calendar-outline"
                  size={44}
                  color={P.sub}
                  style={{ opacity: 0.45, marginBottom: 12 }}
                />
                <Text style={[s.emptyTitle, { color: P.text }]}>Nothing here</Text>
                <Text style={[s.emptySub, { color: P.sub }]}>{tabEmptyText[activeTab]}</Text>
              </View>
            }
          />
        )}
        {/* Schedule & Invite Modal */}
        <Modal
          visible={inviteModal.visible}
          transparent
          animationType="fade"
          onRequestClose={() => setInviteModal({ visible: false, entry: null })}
        >
          <View style={wl.popupBackdrop}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setInviteModal({ visible: false, entry: null })} />
            <View style={[wl.popupCard, { backgroundColor: P.card }]}>

              {/* Header */}
              <View style={wl.popupHeader}>
                <View style={[wl.popupIcon, { backgroundColor: P.indicator + '18' }]}>
                  <Ionicons name="calendar-outline" size={20} color={P.indicator} />
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

              {/* Preferred dates (if client set them) */}
              {inviteModal.entry?.preferred_dates && inviteModal.entry.preferred_dates.length > 0 && (
                <View style={[wl.prefDatesRow, { backgroundColor: P.indicator + '10', borderColor: P.indicator + '30' }]}>
                  <Ionicons name="information-circle-outline" size={14} color={P.indicator} />
                  <Text style={[wl.prefDatesText, { color: P.indicator }]}>
                    Client prefers: {inviteModal.entry.preferred_dates.map(d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })).join(' – ')}
                  </Text>
                </View>
              )}

              {/* Date row */}
              <Text style={[wl.popupLabel, { color: P.sub }]}>DATE</Text>
              <View style={[wl.dateBlock, { borderColor: P.sub + '30' }]}>
                <TouchableOpacity style={[wl.dateRow, { borderBottomColor: P.sub + '20' }]} onPress={() => openInvitePicker('date')} activeOpacity={0.7}>
                  <Ionicons name="calendar-outline" size={15} color={P.sub} />
                  <Text style={[wl.dateLabel, { color: P.sub }]}>Date</Text>
                  <Text style={[wl.dateValue, { color: inviteDate ? P.text : P.sub, opacity: inviteDate ? 1 : 0.5 }]}>
                    {inviteDate ? inviteDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'Select date'}
                  </Text>
                  <Ionicons name="chevron-forward" size={13} color={P.sub} style={{ opacity: 0.4 }} />
                </TouchableOpacity>
                <TouchableOpacity style={wl.dateRow} onPress={() => openInvitePicker('time')} activeOpacity={0.7}>
                  <Ionicons name="time-outline" size={15} color={P.sub} />
                  <Text style={[wl.dateLabel, { color: P.sub }]}>Time</Text>
                  <Text style={[wl.dateValue, { color: inviteTime ? P.text : P.sub, opacity: inviteTime ? 1 : 0.5 }]}>
                    {inviteTime ? inviteTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'Select time'}
                  </Text>
                  <Ionicons name="chevron-forward" size={13} color={P.sub} style={{ opacity: 0.4 }} />
                </TouchableOpacity>
              </View>

              {/* iOS inline pickers */}
              {Platform.OS === 'ios' && showInviteDatePicker && (
                <View>
                  <TouchableOpacity style={[wl.pickerDone, { borderBottomColor: P.sub + '20' }]} onPress={() => setShowInviteDatePicker(false)} activeOpacity={0.7}>
                    <Text style={[wl.pickerDoneText, { color: P.indicator }]}>Done</Text>
                  </TouchableOpacity>
                  <DateTimePicker value={inviteDate ?? new Date()} mode="date" display="spinner" minimumDate={new Date()} onChange={(_, d) => { if (d) setInviteDate(d); }} />
                </View>
              )}
              {Platform.OS === 'ios' && showInviteTimePicker && (
                <View>
                  <TouchableOpacity style={[wl.pickerDone, { borderBottomColor: P.sub + '20' }]} onPress={() => setShowInviteTimePicker(false)} activeOpacity={0.7}>
                    <Text style={[wl.pickerDoneText, { color: P.indicator }]}>Done</Text>
                  </TouchableOpacity>
                  <DateTimePicker value={inviteTime ?? new Date()} mode="time" display="spinner" onChange={(_, d) => { if (d) setInviteTime(d); }} />
                </View>
              )}

              {/* Action buttons */}
              <View style={wl.popupActions}>
                <TouchableOpacity style={[wl.popupCancelBtn, { borderColor: P.sub + '40' }]} onPress={() => setInviteModal({ visible: false, entry: null })} activeOpacity={0.7}>
                  <Text style={[wl.popupCancelText, { color: P.sub }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[wl.popupConfirmBtn, { backgroundColor: P.indicator, opacity: (!inviteDate || !inviteTime || inviting) ? 0.5 : 1 }]}
                  onPress={handleConfirmInvite}
                  disabled={!inviteDate || !inviteTime || inviting}
                  activeOpacity={0.8}
                >
                  <Text style={wl.popupConfirmText}>{inviting ? 'Sending...' : 'Confirm & Invite'}</Text>
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
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  iconBtn:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },

  // Tab bar
  tabBarOuter: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4 },
  tabBarInner: { flexDirection: 'row', alignItems: 'center', height: 34 },
  tabSlider:   { position: 'absolute', top: 0, bottom: 0, borderRadius: 20 },
  tabGap:      { marginRight: 3 },
  tab:         { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  tabText:     { fontSize: 13, fontWeight: '600' },
  tabBadge:    { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10, minWidth: 20, alignItems: 'center' },
  tabBadgeText:{ fontSize: 11, fontWeight: '700' },

  // List
  listContent:  { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 110, gap: 10 },
  listCentered: { flex: 1, justifyContent: 'center' },
  listSep:      { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },

  // Empty state
  emptyWrap:  { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 17, fontWeight: '600', marginBottom: 6 },
  emptySub:   { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
});

// ─── Waitlist card styles ─────────────────────────────────────────────────────
const wl = StyleSheet.create({
  card:         { borderRadius: 16, padding: 14, shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  cardTop:      { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  avatar:       { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText:   { fontSize: 16, fontWeight: '700' },
  clientName:   { fontSize: 14, fontWeight: '600', letterSpacing: -0.2 },
  serviceName:  { fontSize: 11, marginTop: 2 },
  posBadge:     { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  posBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  notes:        { fontSize: 12, lineHeight: 17, marginBottom: 6 },
  preferredDates: { fontSize: 11, marginBottom: 6 },
  actions:      { flexDirection: 'row', gap: 8, marginTop: 6 },
  inviteBtn:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 20 },
  inviteBtnText:{ fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },
  removeBtn:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 20, borderWidth: 1 },
  removeBtnText:{ fontSize: 12 },
  // Invite modal
  popupBackdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 22 },
  popupCard:      { width: '100%', borderRadius: 22, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 28, elevation: 12 },
  popupHeader:    { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 12 },
  popupIcon:      { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  popupTitle:     { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  popupSub:       { fontSize: 11, marginTop: 2 },
  popupLabel:     { fontSize: 9, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 7, marginTop: 14 },
  prefDatesRow:   { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 10, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8, marginBottom: 4 },
  prefDatesText:  { fontSize: 11, fontWeight: '600', flex: 1 },
  dateBlock:      { borderRadius: 13, borderWidth: 1, overflow: 'hidden', marginBottom: 4 },
  dateRow:        { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  dateLabel:      { fontSize: 10, fontWeight: '700', width: 30, letterSpacing: 0.3 },
  dateValue:      { flex: 1, fontSize: 12 },
  pickerDone:     { alignItems: 'flex-end', paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerDoneText: { fontSize: 14, fontWeight: '700' },
  popupActions:   { flexDirection: 'row', gap: 9, marginTop: 16 },
  popupCancelBtn: { flex: 1, borderRadius: 13, borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
  popupCancelText:{ fontSize: 12, fontWeight: '600' },
  popupConfirmBtn:{ flex: 1.6, borderRadius: 13, paddingVertical: 12, alignItems: 'center' },
  popupConfirmText:{ fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
});

