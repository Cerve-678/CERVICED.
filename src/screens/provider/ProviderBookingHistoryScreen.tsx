import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import SlidingTabs from '../../components/SlidingTabs';
import {
  getProviderBookings,
  getMyProviderProfile,
  getServiceBookingDefaults,
  insertDirectBooking,
  getProviderWaitlist,
  inviteFromWaitlist,
  leaveWaitlist,
  getProviderUnreadConversationCount,
  updateBookingStatus,
  updateGroupBookingStatus,
  getActiveRescheduleRequestsForBookings,
  type WaitlistEntry,
} from '../../services/databaseService';
import { mapDbBookingToConfirmed } from '../../contexts/BookingContext';
import { mapDbBookingStatus, BookingStatus } from '../../types/booking';
import type { BookingWithAddOns, DbBookingRescheduleRequest } from '../../types/database';
import { logger } from '../../utils/logger';
import { formatTime12, formatShortDate, formatLongDate, dateToYMD } from '../../utils/dateUtils';
import { MULTI_SERVICE_BOOKING_ENABLED } from '../../constants/featureFlags';
import { WAITLIST_HOLD_MS } from '../../constants/waitlist';

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
  { key: 'history', label: 'History' },
  { key: 'todo',    label: 'To Do' },
] as const;

type TabKey = typeof TABS[number]['key'];

// Secondary filter shown only under the History tab — status chips over the
// combined agenda list, replacing the old top-level per-status tabs.
const HISTORY_FILTERS = [
  { key: 'all',         label: 'All' },
  { key: 'upcoming',    label: 'Upcoming' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed',   label: 'Completed' },
  { key: 'cancelled',   label: 'Cancelled' },
] as const;

type HistoryFilterKey = typeof HISTORY_FILTERS[number]['key'];

// History is everything not still awaiting the provider's action — one
// combined agenda list (upcoming, in progress, completed, cancelled/no-show)
// rather than the old per-status tabs. Status still shows as a pill per card.
function isHistoryStatus(status: string): boolean {
  const mapped = mapDbBookingStatus(status);
  return mapped === BookingStatus.UPCOMING
    || mapped === BookingStatus.IN_PROGRESS
    || mapped === BookingStatus.COMPLETED
    || mapped === BookingStatus.CANCELLED
    || mapped === BookingStatus.NO_SHOW;
}

function matchesHistoryFilter(status: string, filter: HistoryFilterKey): boolean {
  if (filter === 'all') return true;
  const mapped = mapDbBookingStatus(status);
  switch (filter) {
    case 'upcoming':    return mapped === BookingStatus.UPCOMING;
    case 'in_progress': return mapped === BookingStatus.IN_PROGRESS;
    case 'completed':   return mapped === BookingStatus.COMPLETED;
    case 'cancelled':   return mapped === BookingStatus.CANCELLED || mapped === BookingStatus.NO_SHOW;
  }
}

// A list row: `booking` is the representative (earliest appointment) of a
// group-booking's siblings, or the booking itself when it's not grouped.
// `siblings` is always non-empty and always includes `booking`.
interface GroupedBooking {
  booking: BookingWithAddOns;
  siblings: BookingWithAddOns[];
}

function agendaSort(items: BookingWithAddOns[]): BookingWithAddOns[] {
  const upcoming = items
    .filter(b => b.booking_date >= TODAY_STR)
    .sort((a, b) => a.booking_date.localeCompare(b.booking_date) || a.booking_time.localeCompare(b.booking_time));
  const past = items
    .filter(b => b.booking_date < TODAY_STR)
    .sort((a, b) => b.booking_date.localeCompare(a.booking_date) || b.booking_time.localeCompare(a.booking_time));
  return [...upcoming, ...past];
}

function filterBookings(bookings: BookingWithAddOns[], tab: TabKey, historyFilter: HistoryFilterKey): BookingWithAddOns[] {
  if (tab === 'todo') {
    return agendaSort(bookings.filter(b => mapDbBookingStatus(b.status) === BookingStatus.PENDING));
  }
  // History: agenda-sorted (soonest upcoming first) down to most-recent-past —
  // completed/cancelled bookings dominate this list day to day, so lead with
  // recency rather than the live-tabs' future-first ordering.
  const items = bookings.filter(b => isHistoryStatus(b.status) && matchesHistoryFilter(b.status, historyFilter));
  return items.sort((a, b) => b.booking_date.localeCompare(a.booking_date) || b.booking_time.localeCompare(a.booking_time));
}

// ─── Booking card ─────────────────────────────────────────────────────────────

function BookingCard({ booking, siblingCount, total, dark, P, onPress }: {
  booking: BookingWithAddOns; siblingCount: number; total: number; dark: boolean; P: Palette; onPress: () => void;
}) {
  const st    = statusFor(booking.status);
  const mappedStatus = mapDbBookingStatus(booking.status);
  const done  = mappedStatus === BookingStatus.CANCELLED || mappedStatus === BookingStatus.NO_SHOW;
  const name  = booking.customer_name ?? 'Client';
  const initials = name.trim().split(/\s+/).map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase();
  const isGroup = siblingCount > 1;
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
              <Ionicons name="link" size={10} color={P.accent} />
              <Text style={[bc.groupCount, { color: P.accent }]}>{siblingCount}</Text>
            </View>
          )}
        </View>
        <Text style={[bc.service, { color: P.sub, textDecorationLine: done ? 'line-through' : 'none', opacity: done ? 0.6 : 1 }]} numberOfLines={1}>
          {isGroup ? `${booking.service_name_snapshot} + ${siblingCount - 1} more` : booking.service_name_snapshot}
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

// ─── Pending pill row (To Do tab) ───────────────────────────────────────────
// Compact calendar-agenda-style row for a still-pending booking: time,
// client + service, and a Confirm button that accepts it (pending →
// confirmed) right from the list — replaces the larger BookingCard for this
// tab only, since a pending booking's whole point here is "act on this now,"
// not browse detail. Labeled "Confirm", not "Complete" — this app has a
// separate, later `completed` status once the appointment actually happens.

function PendingPill({ group, dark, P, busy, onPress, onComplete }: {
  group: GroupedBooking; dark: boolean; P: Palette; busy: boolean; onPress: () => void; onComplete: () => void;
}) {
  const { booking, siblings } = group;
  const isGroup = siblings.length > 1;
  const name = booking.customer_name ?? 'Client';

  return (
    <TouchableOpacity activeOpacity={0.75} onPress={onPress} style={[pp.pill, { backgroundColor: P.card }, !dark && bc.shadow]}>
      <Text style={[pp.time, { color: P.accent }]} numberOfLines={1}>{fmtTime(booking.booking_time)}</Text>
      <View style={pp.divider} />
      <View style={pp.body}>
        <Text style={[pp.line, { color: P.text }]} numberOfLines={1}>
          <Text style={pp.name}>{name}</Text>
          <Text style={{ color: P.sub }}> · {isGroup ? `${booking.service_name_snapshot} + ${siblings.length - 1} more` : booking.service_name_snapshot}</Text>
        </Text>
      </View>
      <TouchableOpacity
        activeOpacity={0.8}
        disabled={busy}
        onPress={onComplete}
        style={[pp.completeBtn, { backgroundColor: P.accent, opacity: busy ? 0.6 : 1 }]}
      >
        {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={pp.completeBtnText}>Confirm</Text>}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const pp = StyleSheet.create({
  pill:           { flexDirection: 'row', alignItems: 'center', borderRadius: 24, paddingVertical: 8, paddingLeft: 14, paddingRight: 8, gap: 10 },
  time:           { fontSize: 12, fontWeight: '800', letterSpacing: -0.1, width: 52, flexShrink: 0 },
  divider:        { width: StyleSheet.hairlineWidth, height: 18, backgroundColor: 'rgba(128,128,128,0.3)' },
  body:           { flex: 1 },
  line:           { fontSize: 13 },
  name:           { fontWeight: '700' },
  completeBtn:    { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, flexShrink: 0, minWidth: 78, alignItems: 'center', justifyContent: 'center' },
  completeBtnText:{ fontSize: 12, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },
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

export default function ProviderBookingHistoryScreen({ navigation, route }: any) {
  const { isDarkMode: dark } = useTheme();
  const P = dark ? DARK : LIGHT;

  const [bookings, setBookings]         = useState<BookingWithAddOns[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [activeTab, setActiveTab]       = useState<TabKey>(route?.params?.initialTab ?? 'todo');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilterKey>('all');
  const [waitlist, setWaitlist]         = useState<WaitlistEntry[]>([]);
  const [unreadMessages, setUnreadMessages] = useState(0);
  // Client-requested reschedules still awaiting the provider's response
  // (status 'pending' — distinct from 'provider_responded', which is
  // awaiting the CLIENT). Keyed by booking_id so each row can look up its
  // booking for the client/service name.
  const [pendingRescheduleRequests, setPendingRescheduleRequests] = useState<Record<string, DbBookingRescheduleRequest>>({});
  const [providerDbId, setProviderDbId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);

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
    // This screen's "Completed"/"Cancelled"/"All" tabs and header counts are a
    // full booking ledger, not a recent-activity view — unlike
    // ProviderHomeScreen/ProviderInboxScreen, older bookings here don't get
    // cleared out by the auto-complete/expire-stale-pending cron, so a
    // windowed fetch would silently hide real history. Request everything,
    // same opt-in getProviderBookings() gives ProviderAnalyticsScreen.
    try {
      const rows = await getProviderBookings(Infinity);
      setBookings(rows);
      // Batched .in() lookup over every loaded booking id — same pattern
      // BookingContext's loadBookings uses client-side — rather than a
      // per-booking await in a loop.
      const requests = await getActiveRescheduleRequestsForBookings(rows.map(b => b.id));
      const pending: Record<string, DbBookingRescheduleRequest> = {};
      for (const [bookingId, req] of Object.entries(requests)) {
        if (req.status === 'pending') pending[bookingId] = req;
      }
      setPendingRescheduleRequests(pending);
    } catch {}
  }, []);

  const fetchWaitlist = useCallback(async () => {
    if (!providerDbId) return;
    try { setWaitlist(await getProviderWaitlist(providerDbId)); } catch {}
  }, [providerDbId]);

  const fetchUnreadMessages = useCallback(async () => {
    try {
      setUnreadMessages(await getProviderUnreadConversationCount());
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    void Promise.all([fetchBookings(), fetchUnreadMessages()]).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [fetchBookings, fetchUnreadMessages]));

  useFocusEffect(useCallback(() => {
    if (providerDbId) void fetchWaitlist();
  }, [fetchWaitlist, providerDbId]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchBookings(), fetchWaitlist(), fetchUnreadMessages()]);
    setRefreshing(false);
  }, [fetchBookings, fetchWaitlist, fetchUnreadMessages]);

  const handleTabPress = useCallback((key: TabKey) => {
    setActiveTab(key);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  const handleHistoryFilterPress = useCallback((key: HistoryFilterKey) => {
    setHistoryFilter(key);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  // ── Derived data ─────────────────────────────────────────────────────────

  const pendingCount  = useMemo(() => bookings.filter(b => mapDbBookingStatus(b.status) === BookingStatus.PENDING).length, [bookings]);
  const waitlistCount = useMemo(() => waitlist.filter(e => e.status === 'waiting').length, [waitlist]);
  const rescheduleRequestCount = useMemo(() => Object.keys(pendingRescheduleRequests).length, [pendingRescheduleRequests]);
  // Booking rows the reschedule-request rows below link to, keyed by id —
  // a request whose booking fell out of the loaded ledger (shouldn't happen,
  // but the fetch is a separate round-trip) is skipped rather than crashing.
  const rescheduleRequestRows = useMemo(() => {
    return Object.values(pendingRescheduleRequests)
      .map(req => ({ req, booking: bookings.find(b => b.id === req.booking_id) }))
      .filter((r): r is { req: DbBookingRescheduleRequest; booking: BookingWithAddOns } => !!r.booking);
  }, [pendingRescheduleRequests, bookings]);

  const counts = useMemo(() => ({
    todo:    pendingCount + waitlistCount + unreadMessages + rescheduleRequestCount,
    history: bookings.filter(b => isHistoryStatus(b.status)).length,
  }), [pendingCount, waitlistCount, unreadMessages, rescheduleRequestCount, bookings]);

  // Collapse group-booking siblings (same client, same group_booking_id,
  // same tab) into one card — a provider's own multi-service group booking
  // (see bookingBatchId in CartScreen) otherwise shows as N separate cards
  // for what the client experiences as one booking. Siblings are only
  // collapsed together if they land in the SAME tab: a group with one
  // confirmed and one still-pending sibling must show separately in each
  // tab rather than being silently merged into one status. The earliest
  // appointment in the group is the representative card (same convention
  // as the notify_address_released/handle_booking_status_change dedup),
  // carrying the full sibling list so the card can show the group badge
  // and the detail screen can list every service.
  const items = useMemo((): GroupedBooking[] => {
    const filtered = filterBookings(bookings, activeTab, historyFilter);
    const byGroup = new Map<string, BookingWithAddOns[]>();
    const singles: GroupedBooking[] = [];
    for (const b of filtered) {
      // Multi-service booking is gated off (MULTI_SERVICE_BOOKING_ENABLED):
      // don't collapse siblings into one group card. Any pre-existing group
      // booking's rows each show as their own single card and are managed
      // individually (per-booking RPCs), instead of showing a group badge and
      // routing through the all-or-nothing group RPCs. See FUTURE_LOGIC.md.
      if (MULTI_SERVICE_BOOKING_ENABLED && b.group_booking_id) {
        const key = b.group_booking_id;
        const list = byGroup.get(key);
        if (list) list.push(b); else byGroup.set(key, [b]);
      } else {
        singles.push({ booking: b, siblings: [b] });
      }
    }
    const grouped: GroupedBooking[] = singles;
    for (const siblings of byGroup.values()) {
      siblings.sort((a, b) => a.booking_date.localeCompare(b.booking_date) || a.booking_time.localeCompare(b.booking_time));
      grouped.push({ booking: siblings[0]!, siblings });
    }
    // Re-apply the tab's ordering using each group's representative booking.
    const order = filterBookings(grouped.map(g => g.booking), activeTab, historyFilter);
    const byRepresentativeId = new Map(grouped.map(g => [g.booking.id, g]));
    return order.map(b => byRepresentativeId.get(b.id)!);
  }, [bookings, activeTab, historyFilter]);

  const tabEmptyText: Record<TabKey, string> = {
    todo:    'No pending bookings',
    history: 'No bookings yet',
  };

  // ── Complete (pending → confirmed) ───────────────────────────────────────

  // Group siblings route through the atomic group RPC so every one of this
  // provider's own services in the same client group confirms together —
  // same rule ProviderBookingDetailScreen's updateBookingStatus follows (see
  // fix_group_booking_atomic_actions.sql: all-or-nothing server-side).
  const handleComplete = useCallback((group: GroupedBooking) => {
    const groupSuffix = group.siblings.length > 1
      ? ` This confirms all ${group.siblings.length} of this client's services with you.`
      : '';
    Alert.alert(
      'Confirm Booking',
      `The client will be notified that their booking is confirmed.${groupSuffix}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setCompletingId(group.booking.id);
            try {
              if (group.siblings.length > 1 && group.booking.group_booking_id) {
                await updateGroupBookingStatus(group.booking.group_booking_id, 'confirmed');
              } else {
                await updateBookingStatus(group.booking.id, 'confirmed');
              }
              await fetchBookings();
            } catch (err: any) {
              logger.error('Failed to confirm booking:', err);
              // provider_update_booking_status has a real state-machine guard
              // that raises a specific reason (e.g. already cancelled/completed
              // by the time this fired) — surface it instead of always
              // defaulting to a connection message that may not be true.
              const message =
                typeof err?.message === 'string' && err.message.length > 0 && !err.message.includes('Network')
                  ? err.message
                  : 'Please check your connection and try again.';
              Alert.alert('Could not confirm', message);
            } finally {
              setCompletingId(null);
            }
          },
        },
      ],
    );
  }, [fetchBookings]);

  // ── Waitlist invite ───────────────────────────────────────────────────────

  const openInvitePicker = useCallback((which: 'date' | 'time') => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: (which === 'date' ? inviteDate : inviteTime) ?? new Date(),
        mode: which,
        ...(which === 'date' ? { minimumDate: new Date() } : {}),
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
      // Length matters as much as price here: without it the booking is
      // written with no end_time, which leaves the DB overlap constraint
      // nothing to measure and shows up on the provider's day as a block of
      // unknown length. An hour is the same fallback the database itself
      // uses (get_provider_busy_spans COALESCEs to booking_time + 1 hour),
      // so a service with no duration set still produces a real span.
      let durationMinutes = 60;
      if (entry.service_id) {
        const defaults = await getServiceBookingDefaults(entry.service_id);
        basePrice = defaults.price;
        if (defaults.durationMinutes > 0) durationMinutes = defaults.durationMinutes;
      }
      const bookingDate = inviteDate.toISOString().split('T')[0]!;
      const bookingTime = inviteTime.toTimeString().split(' ')[0]!;
      const endAt = new Date(inviteTime.getTime() + durationMinutes * 60_000);
      const endTime = endAt.toTimeString().split(' ')[0]!;
      await insertDirectBooking({
        user_id: entry.user_id,
        provider_id: providerDbId,
        service_id: entry.service_id,
        status: 'pending',
        booking_date: bookingDate,
        booking_time: bookingTime,
        end_time: endTime,
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
    } catch (err: any) {
      logger.error('Invite failed:', err);
      // The invite RPC throws a real, specific reason (blocked date,
      // overlapping slot, provider closed that day) — surface it instead of
      // always showing the generic connection copy, which previously hid
      // exactly that kind of actionable message.
      const message =
        typeof err?.message === 'string' && err.message.length > 0 && !err.message.includes('Network')
          ? err.message
          : 'The booking could not be created. Please check your connection and try again.';
      Alert.alert('Invite failed', message);
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
              {counts.todo > 0 ? `${counts.todo} to do` : 'All caught up'}
            </Text>
          </View>

          {/* Debug-only entry point. The client-side equivalent (BookingsScreen)
              has always been __DEV__-gated; this one was not, so release builds
              showed real providers a DEV button opening destructive reset tools. */}
          {__DEV__ && (
            <TouchableOpacity
              style={s.devBtn}
              onPress={() => navigation.navigate('DevSettings')}
              activeOpacity={0.8}
            >
              <Text style={s.devBtnText}>DEV</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Tabs — plain underline indicator (not SlidingTabs' filled
            capsule): just enough to show selection, not a heavy pill, for
            this screen's top-level History/To Do switch specifically. ──── */}
        <View style={[s.primaryTabsRow, { borderBottomColor: P.sep }]}>
          {TABS.map(tab => {
            const active = tab.key === activeTab;
            const count = counts[tab.key];
            return (
              <TouchableOpacity
                key={tab.key}
                style={[s.primaryTab, active && { borderBottomColor: P.accent }]}
                onPress={() => handleTabPress(tab.key)}
                activeOpacity={0.7}
              >
                <Text style={[s.primaryTabText, { color: active ? P.text : P.sub, fontWeight: active ? '700' : '600' }]}>
                  {tab.label}{count && count > 0 ? `  ${count}` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Content ─────────────────────────────────────────────────── */}
        {loading ? (
          <SkeletonList dark={dark} P={P} />
        ) : activeTab === 'todo' ? (
          <ScrollView
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P.accent} />}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              s.listContent,
              unreadMessages === 0 && rescheduleRequestRows.length === 0 && waitlist.length === 0 && items.length === 0 && s.listCentered,
            ]}
          >
            {unreadMessages === 0 && rescheduleRequestRows.length === 0 && waitlist.length === 0 && items.length === 0 ? (
              <View style={s.emptyWrap}>
                <Ionicons name="checkmark-done-outline" size={44} color={P.faint} style={{ marginBottom: 12 }} />
                <Text style={[s.emptyTitle, { color: P.text }]}>Nothing here</Text>
                <Text style={[s.emptySub, { color: P.sub }]}>{tabEmptyText['todo']}</Text>
              </View>
            ) : (
              <>
                {unreadMessages > 0 && (
                  <TouchableOpacity
                    style={[wl.card, { backgroundColor: P.card, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }, !dark && bc.shadow]}
                    activeOpacity={0.75}
                    onPress={() => navigation.navigate('ProviderInbox', { initialFilter: 'messages' })}
                  >
                    <View style={[wl.avatar, { backgroundColor: P.accentSoft }]}>
                      <Ionicons name="chatbubble-ellipses-outline" size={18} color={P.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[wl.clientName, { color: P.text }]}>
                        {unreadMessages} unread {unreadMessages === 1 ? 'message' : 'messages'}
                      </Text>
                      <Text style={[wl.serviceName, { color: P.sub }]}>Tap to open Inbox</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={P.sub} style={{ opacity: 0.5 }} />
                  </TouchableOpacity>
                )}

                {rescheduleRequestRows.length > 0 && (
                  <>
                    <Text style={[wl.popupLabel, { color: P.sub, marginTop: 0 }]}>RESCHEDULE REQUESTS</Text>
                    {rescheduleRequestRows.map(({ req, booking }) => (
                      <TouchableOpacity
                        key={req.id}
                        style={[wl.card, { backgroundColor: P.card, marginBottom: 10 }, !dark && bc.shadow]}
                        activeOpacity={0.75}
                        onPress={() => navigation.navigate('BookingDetail', {
                          bookingId: booking.id,
                          booking: mapDbBookingToConfirmed(booking),
                          openReschedule: true,
                        })}
                      >
                        <View style={wl.cardTop}>
                          <View style={[wl.avatar, { backgroundColor: P.tile }]}>
                            <Ionicons name="calendar-outline" size={16} color={P.text} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[wl.clientName, { color: P.text }]} numberOfLines={1}>
                              {booking.customer_name ?? 'Client'}
                            </Text>
                            <Text style={[wl.serviceName, { color: P.sub }]} numberOfLines={1}>
                              {booking.service_name_snapshot}
                            </Text>
                          </View>
                          <View style={[wl.posBadge, { backgroundColor: 'rgba(255,149,0,0.15)' }]}>
                            <Text style={[wl.posBadgeText, { color: '#FF9500' }]}>Awaiting response</Text>
                          </View>
                        </View>
                        <Text style={[wl.preferredDates, { color: P.sub }]}>
                          Was {formatShortDate(req.original_date)} at {formatTime12(req.original_time)}
                          {req.requested_dates && req.requested_dates.length > 0
                            ? ` — client asked for ${req.requested_dates.length > 1 ? `${req.requested_dates.length} alternatives` : formatShortDate(req.requested_dates[0]!)}`
                            : ''}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </>
                )}

                {waitlist.length > 0 && (
                  <>
                    <Text style={[wl.popupLabel, { color: P.sub, marginTop: (unreadMessages > 0 || rescheduleRequestRows.length > 0) ? 8 : 0 }]}>WAITLIST</Text>
                    {waitlist.map(entry => (
                      <View key={entry.id} style={[wl.card, { backgroundColor: P.card, marginBottom: 10 }, !dark && bc.shadow]}>
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
                        {/* A hold reserves the slot for WAITLIST_HOLD_MINUTES from
                            notified_at — an estimate, not fetched from the linked
                            bookings row, since this list is optimised for provider
                            skimming rather than authoritative countdown precision.
                            The window is the DB's (waitlist_hold_duration()); the
                            constant only mirrors it for display. */}
                        {entry.status === 'notified' && entry.notified_at ? (
                          <Text style={[wl.preferredDates, { color: '#34C759' }]}>
                            Expires around {formatTime12(new Date(new Date(entry.notified_at).getTime() + WAITLIST_HOLD_MS))} if not confirmed
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
                    ))}
                  </>
                )}

                {items.length > 0 && (
                  <>
                    <Text style={[wl.popupLabel, { color: P.sub, marginTop: waitlist.length > 0 ? 8 : 0 }]}>PENDING</Text>
                    {items.map(group => (
                      <View key={group.booking.id} style={{ marginBottom: 8 }}>
                        <PendingPill
                          group={group}
                          dark={dark}
                          P={P}
                          busy={completingId === group.booking.id}
                          onPress={() => navigation.navigate('BookingDetail', {
                            bookingId: group.booking.id,
                            booking: mapDbBookingToConfirmed(group.booking),
                            groupSiblings: group.siblings.length > 1 ? group.siblings.map(mapDbBookingToConfirmed) : undefined,
                          })}
                          onComplete={() => handleComplete(group)}
                        />
                      </View>
                    ))}
                  </>
                )}
              </>
            )}
          </ScrollView>
        ) : (
          <>
            <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 }}>
              <SlidingTabs
                tabs={HISTORY_FILTERS}
                activeKey={historyFilter}
                onPress={handleHistoryFilterPress}
                accentColor={P.accent}
                inactiveTextColor={P.sub}
                inactiveBackgroundColor={P.tile}
                height={30}
                gap={8}
              />
            </View>
            <FlatList
              ref={listRef}
              data={items}
              keyExtractor={g => g.booking.id}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P.accent} />}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[s.listContent, items.length === 0 && s.listCentered]}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              renderItem={({ item: group }) => (
                <BookingCard
                  booking={group.booking}
                  siblingCount={group.siblings.length}
                  total={group.siblings.reduce((sum: number, b: BookingWithAddOns) => sum + (b.base_price ?? 0) + (b.add_ons_total ?? 0), 0)}
                  dark={dark}
                  P={P}
                  onPress={() => navigation.navigate('BookingDetail', {
                    bookingId: group.booking.id,
                    booking: mapDbBookingToConfirmed(group.booking),
                    groupSiblings: group.siblings.length > 1 ? group.siblings.map(mapDbBookingToConfirmed) : undefined,
                  })}
                />
              )}
              ListEmptyComponent={
                <View style={s.emptyWrap}>
                  <Ionicons name="calendar-outline" size={44} color={P.faint} style={{ marginBottom: 12 }} />
                  <Text style={[s.emptyTitle, { color: P.text }]}>Nothing here</Text>
                  <Text style={[s.emptySub, { color: P.sub }]}>
                    {historyFilter === 'all' ? tabEmptyText[activeTab] : `No ${HISTORY_FILTERS.find(f => f.key === historyFilter)?.label.toLowerCase()} bookings`}
                  </Text>
                </View>
              }
            />
          </>
        )}

        {/* ── Waitlist invite modal ────────────────────────────────────── */}
        <Modal visible={inviteModal.visible} transparent statusBarTranslucent navigationBarTranslucent animationType="fade"
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

  // Primary History/To Do tabs — plain underline, not SlidingTabs' filled
  // capsule. paddingTop sits it further down from the header than the old
  // SlidingTabs row did.
  primaryTabsRow: {
    flexDirection: 'row',
    paddingTop: 18,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  primaryTab: {
    paddingTop: 12,
    // More space below the label than above it, so the underline indicator
    // doesn't sit tight against the text — was paddingVertical: 12 (equal
    // top/bottom), which read as cramped against the border.
    paddingBottom: 14,
    marginRight: 24,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  primaryTabText: {
    fontSize: 15,
    letterSpacing: -0.1,
  },

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
