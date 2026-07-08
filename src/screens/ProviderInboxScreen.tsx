import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { getProviderBookings } from '../services/databaseService';
import type { BookingWithAddOns } from '../types/database';
import { ThemedBackground } from '../components/ThemedBackground';

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterKey = 'all' | 'pending' | 'confirmed' | 'done';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',       label: 'All'       },
  { key: 'pending',   label: 'Pending'   },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'done',      label: 'Done'      },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string, timeStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, m]     = timeStr.split(':').map(Number);
  const dt   = new Date(y!, mo! - 1, d!, h!, m!);
  const diff = Date.now() - dt.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days}d ago`;
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

function fmtDate(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const dt = new Date(y!, mo! - 1, d!);
  return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function fmtTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const ap  = h! >= 12 ? 'pm' : 'am';
  const h12 = h === 0 ? 12 : h! > 12 ? h! - 12 : h!;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; dbg: string; label: string; icon: string }> = {
  pending:     { color: '#FF9F0A', bg: '#FBF1E0', dbg: '#3D2E10', label: 'Pending',     icon: 'time-outline'          },
  confirmed:   { color: '#0A84FF', bg: '#E5F2FF', dbg: '#102840', label: 'Confirmed',   icon: 'checkmark-circle-outline'},
  in_progress: { color: '#BF5AF2', bg: '#F4EAFF', dbg: '#2E1A40', label: 'In Progress', icon: 'play-circle-outline'   },
  completed:   { color: '#30D158', bg: '#E5F9EC', dbg: '#102A1A', label: 'Completed',   icon: 'checkmark-done-outline' },
  cancelled:   { color: '#FF453A', bg: '#FDEAEA', dbg: '#3D1B1B', label: 'Cancelled',   icon: 'close-circle-outline'  },
  no_show:     { color: '#FF9F0A', bg: '#FBF1E0', dbg: '#3D2E10', label: 'No Show',     icon: 'person-remove-outline' },
};

// ─── Shimmer skeleton ─────────────────────────────────────────────────────────

function SkeletonRow({ dark }: { dark: boolean }) {
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
  const op   = anim.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] });
  const base = dark ? '#3A3A3C' : '#D8D8DC';
  return (
    <View style={[sk.row, { borderBottomColor: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
      <Animated.View style={[sk.avatar, { backgroundColor: base, opacity: op }]} />
      <View style={sk.body}>
        <View style={sk.topRow}>
          <Animated.View style={[sk.name,      { backgroundColor: base, opacity: op }]} />
          <Animated.View style={[sk.timestamp, { backgroundColor: base, opacity: op }]} />
        </View>
        <Animated.View style={[sk.line1, { backgroundColor: base, opacity: op }]} />
        <Animated.View style={[sk.line2, { backgroundColor: base, opacity: op }]} />
      </View>
    </View>
  );
}

const sk = StyleSheet.create({
  row:       { flexDirection: 'row', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'flex-start' },
  avatar:    { width: 48, height: 48, borderRadius: 24, marginRight: 14, flexShrink: 0 },
  body:      { flex: 1, gap: 8 },
  topRow:    { flexDirection: 'row', justifyContent: 'space-between' },
  name:      { height: 14, width: '42%', borderRadius: 7 },
  timestamp: { height: 11, width: '20%', borderRadius: 5 },
  line1:     { height: 12, width: '78%', borderRadius: 6 },
  line2:     { height: 11, width: '52%', borderRadius: 5 },
});

// ─── Inbox row ────────────────────────────────────────────────────────────────

function InboxRow({
  booking,
  isUnread,
  index,
  dark,
  text,
  sub,
  border,
  onPress,
}: {
  booking: BookingWithAddOns;
  isUnread: boolean;
  index: number;
  dark: boolean;
  text: string;
  sub: string;
  border: string;
  onPress: () => void;
}) {
  const slideAnim = useRef(new Animated.Value(20)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const delay = Math.min(index * 45, 300);
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 280, delay, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 90, friction: 14, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  const cfg  = STATUS_CONFIG[booking.status] ?? STATUS_CONFIG['confirmed']!;
  const init = initials(booking.customer_name ?? '?');
  const ago  = timeAgo(booking.booking_date, booking.booking_time);
  const avatarBg = dark ? cfg.dbg : cfg.bg;

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <TouchableOpacity
        activeOpacity={0.72}
        onPress={onPress}
        style={[row.wrap, { borderBottomColor: border }]}
      >
        {/* Unread indicator */}
        {isUnread && (
          <View style={[row.unreadBar, { backgroundColor: cfg.color }]} />
        )}

        {/* Avatar */}
        <View style={[row.avatar, { backgroundColor: avatarBg }]}>
          <Text style={[row.avatarText, { color: cfg.color }]}>{init}</Text>
        </View>

        {/* Body */}
        <View style={row.body}>
          <View style={row.topLine}>
            <Text style={[row.name, { color: text, fontWeight: isUnread ? '700' : '500' }]} numberOfLines={1}>
              {booking.customer_name ?? 'Client'}
            </Text>
            <Text style={[row.timestamp, { color: sub }]}>{ago}</Text>
          </View>

          <Text style={[row.service, { color: isUnread ? text : sub, fontWeight: isUnread ? '600' : '400' }]} numberOfLines={1}>
            {booking.service_name_snapshot}
          </Text>

          <View style={row.footer}>
            <View style={[row.statusPill, { backgroundColor: dark ? cfg.dbg : cfg.bg }]}>
              <Ionicons name={cfg.icon as any} size={11} color={cfg.color} />
              <Text style={[row.statusText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
            <Text style={[row.dateChip, { color: sub }]}>
              {fmtDate(booking.booking_date)} · {fmtTime(booking.booking_time)}
            </Text>
          </View>
        </View>

        <Ionicons name="chevron-forward" size={14} color={sub} style={{ opacity: 0.35, marginTop: 2, marginLeft: 4 }} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const row = StyleSheet.create({
  wrap:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  unreadBar:   { width: 3, height: 40, borderRadius: 2, marginRight: 10, flexShrink: 0 },
  avatar:      { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginRight: 14, flexShrink: 0 },
  avatarText:  { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  body:        { flex: 1, gap: 3 },
  topLine:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name:        { fontSize: 15, flex: 1, marginRight: 8, letterSpacing: -0.2 },
  timestamp:   { fontSize: 12 },
  service:     { fontSize: 13 },
  footer:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  statusPill:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  statusText:  { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
  dateChip:    { fontSize: 11 },
});

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ label, count, dark, text, sub }: { label: string; count: number; dark: boolean; text: string; sub: string }) {
  return (
    <View style={[sec.wrap, { backgroundColor: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.035)' }]}>
      <Text style={[sec.label, { color: sub }]}>{label.toUpperCase()}</Text>
      <View style={[sec.badge, { backgroundColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)' }]}>
        <Text style={[sec.badgeText, { color: text }]}>{count}</Text>
      </View>
    </View>
  );
}

const sec = StyleSheet.create({
  wrap:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  label:     { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  badge:     { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '600' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

// ─── Brand palette ────────────────────────────────────────────────────────────
const LIGHT_P = {
  bg:      '#F5F1EC',
  surface: '#EDE8E2',
  card:    '#FFFFFF',
  accent:  '#AF9197',
  text:    '#000000',
  sub:     '#7E6667',
  border:  'rgba(126,102,103,0.14)',
  iconBg:  'rgba(175,145,151,0.12)',
};
const DARK_P = {
  bg:      '#1A1815',
  surface: '#201D1A',
  card:    '#252220',
  accent:  '#AF9197',
  text:    '#F0ECE7',
  sub:     '#7E6667',
  border:  'rgba(126,102,103,0.18)',
  iconBg:  'rgba(175,145,151,0.10)',
};

export default function ProviderInboxScreen({ navigation }: any) {
  const { isDarkMode: dark } = useTheme();
  const P = dark ? DARK_P : LIGHT_P;

  const [bookings,   setBookings]   = useState<BookingWithAddOns[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter,     setFilter]     = useState<FilterKey>('all');

  const fetchBookings = useCallback(async () => {
    try { setBookings(await getProviderBookings()); } catch {}
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchBookings().finally(() => setLoading(false));
  }, [fetchBookings]);

  useFocusEffect(useCallback(() => { fetchBookings(); }, [fetchBookings]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchBookings();
    setRefreshing(false);
  }, [fetchBookings]);

  const pendingIds = useMemo(
    () => new Set(bookings.filter(b => b.status === 'pending').map(b => b.id)),
    [bookings]
  );

  const filtered = useMemo(() => {
    const sorted = [...bookings].sort(
      (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
    );
    switch (filter) {
      case 'pending':   return sorted.filter(b => b.status === 'pending');
      case 'confirmed': return sorted.filter(b => b.status === 'confirmed' || b.status === 'in_progress');
      case 'done':      return sorted.filter(b => b.status === 'completed' || b.status === 'cancelled' || b.status === 'no_show');
      default:          return sorted;
    }
  }, [bookings, filter]);

  // Group into sections: pending first, then upcoming, then past
  const listData = useMemo(() => {
    if (filter !== 'all') {
      return [{ type: 'rows' as const, data: filtered }];
    }
    const pending   = filtered.filter(b => b.status === 'pending');
    const active    = filtered.filter(b => b.status === 'confirmed' || b.status === 'in_progress');
    const done      = filtered.filter(b => b.status === 'completed' || b.status === 'cancelled' || b.status === 'no_show');
    const sections: Array<{ type: 'section'; label: string; count: number } | { type: 'rows'; data: BookingWithAddOns[] }> = [];
    if (pending.length > 0) {
      sections.push({ type: 'section', label: 'Needs attention', count: pending.length });
      sections.push({ type: 'rows', data: pending });
    }
    if (active.length > 0) {
      sections.push({ type: 'section', label: 'Upcoming', count: active.length });
      sections.push({ type: 'rows', data: active });
    }
    if (done.length > 0) {
      sections.push({ type: 'section', label: 'Past', count: done.length });
      sections.push({ type: 'rows', data: done });
    }
    return sections;
  }, [filtered, filter]);

  const pendingCount = pendingIds.size;

  // Flat items for FlatList
  type ListItem =
    | { key: string; t: 'section'; label: string; count: number }
    | { key: string; t: 'booking'; booking: BookingWithAddOns; idx: number };

  const flatItems = useMemo((): ListItem[] => {
    const out: ListItem[] = [];
    let bookingIdx = 0;
    for (const s of listData) {
      if (s.type === 'section') {
        out.push({ key: `sec-${s.label}`, t: 'section', label: s.label, count: s.count });
      } else {
        for (const b of s.data) {
          out.push({ key: b.id, t: 'booking', booking: b, idx: bookingIdx++ });
        }
      }
    }
    return out;
  }, [listData]);

  const headerFade = useRef(new Animated.Value(0)).current;
  const headerY    = useRef(new Animated.Value(-6)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFade, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(headerY,    { toValue: 0, tension: 90, friction: 14, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={[s.root, { backgroundColor: P.bg }]}>
      <SafeAreaView style={s.safe} edges={['top']}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <Animated.View style={[s.header, { opacity: headerFade, transform: [{ translateY: headerY }] }]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={[s.iconBtn, { backgroundColor: P.iconBg }]}
          >
            <Ionicons name="chevron-back" size={18} color={P.text} />
          </TouchableOpacity>

          <View style={s.headerCenter}>
            <Text style={[s.title, { color: P.text }]}>Inbox</Text>
            {pendingCount > 0 && (
              <View style={[s.badge, { backgroundColor: '#FF3B30' }]}>
                <Text style={s.badgeText}>{pendingCount}</Text>
              </View>
            )}
          </View>

          <View style={[s.iconBtn, { backgroundColor: 'transparent' }]} />
        </Animated.View>

        {/* ── Filter tabs ─────────────────────────────────────────── */}
        <View style={[s.filterRow, { backgroundColor: P.card, borderBottomColor: P.border }]}>
          {FILTERS.map(f => {
            const active = filter === f.key;
            const isNew  = f.key === 'pending' && pendingCount > 0;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[s.filterChip, active && { borderBottomColor: P.accent, borderBottomWidth: 2 }]}
              >
                <Text style={[s.filterLabel, { color: active ? P.accent : P.sub }]}>{f.label}</Text>
                {isNew && (
                  <View style={[s.filterBadge, { backgroundColor: '#FF3B30' }]}>
                    <Text style={s.filterBadgeText}>{pendingCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── List ────────────────────────────────────────────────── */}
        {loading ? (
          <View style={{ backgroundColor: P.card, flex: 1 }}>
            {[1, 2, 3, 4, 5, 6].map(k => <SkeletonRow key={k} dark={dark} />)}
          </View>
        ) : (
          <FlatList
            data={flatItems}
            keyExtractor={item => item.key}
            style={{ backgroundColor: P.card, flex: 1 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P.accent} />
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 60 }}
            renderItem={({ item }) => {
              if (item.t === 'section') {
                return (
                  <SectionHeader
                    label={item.label}
                    count={item.count}
                    dark={dark}
                    text={P.text}
                    sub={P.sub}
                  />
                );
              }
              return (
                <InboxRow
                  booking={item.booking}
                  isUnread={pendingIds.has(item.booking.id)}
                  index={item.idx}
                  dark={dark}
                  text={P.text}
                  sub={P.sub}
                  border={P.border}
                  onPress={() => navigation.navigate('BookingDetail', { bookingId: item.booking.id })}
                />
              );
            }}
            ListEmptyComponent={
              <View style={s.empty}>
                <View style={[s.emptyIcon, { backgroundColor: P.iconBg }]}>
                  <Ionicons name="mail-open-outline" size={36} color={P.sub} />
                </View>
                <Text style={[s.emptyTitle, { color: P.text }]}>All clear</Text>
                <Text style={[s.emptySub, { color: P.sub }]}>No bookings in this category</Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },

  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14 },
  iconBtn:      { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  title:        { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  badge:        { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  badgeText:    { color: '#fff', fontSize: 12, fontWeight: '700' },

  filterRow:    { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  filterChip:   { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent', position: 'relative' },
  filterLabel:  { fontSize: 13, fontWeight: '600' },
  filterBadge:  { position: 'absolute', top: 7, right: 8, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  filterBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },

  empty:      { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyIcon:  { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  emptySub:   { fontSize: 14 },
});
