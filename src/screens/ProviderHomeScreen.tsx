import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  Dimensions,
  PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';
import {
  useBooking,
  ConfirmedBooking,
  BookingStatus,
  PaymentStatus,
} from '../contexts/BookingContext';
import { ProviderHomeScreenProps } from '../navigation/types';
import { supabase } from '../lib/supabase';
import {
  getProviderBookings,
  getMyProviderProfile,
  getProviderAvailability,
  getProviderBlockedDates,
} from '../services/databaseService';
import type { BookingWithAddOns, DbProviderAvailability, DbProviderBlockedDate } from '../types/database';

type Props = ProviderHomeScreenProps<'ProviderHomeMain'>;

const { width: SW } = Dimensions.get('window');

// ─── Design tokens — Brand Palette (light + dark) ────────────────────────────
// iBlack #000000 · Mink Violet #7E6667 · Mulberry Wine #AF9197

const L = {
  bg:        '#F5F1EC',
  surface:   '#EDE8E2',
  card:      '#FFFFFF',
  accent:    '#AF9197',
  ice:       '#FFFFFF',
  text:      '#000000',
  sub:       '#7E6667',
  border:    'rgba(126,102,103,0.14)',
  sep:       'rgba(126,102,103,0.08)',
  iconBg:    'rgba(175,145,151,0.12)',
  strip:     '#EDE8E2',
  indicator: '#AF9197',
  tileText:  '#FFFFFF',
  tileSub:   '#FFFFFF',
  banner:    '#AF9197',
  bannerText:'#FFFFFF',
  todayLabel:'rgba(0,0,0,0.45)',
};

const D = {
  bg:        '#1A1815',
  surface:   '#201D1A',
  card:      '#252220',
  accent:    '#AF9197',
  ice:       '#FFFFFF',
  text:      '#F0ECE7',
  sub:       '#7E6667',
  border:    'rgba(126,102,103,0.18)',
  sep:       'rgba(126,102,103,0.10)',
  iconBg:    'rgba(175,145,151,0.10)',
  strip:     '#201D1A',
  indicator: '#AF9197',
  tileText:  '#1A1815',
  tileSub:   '#1A1815',
  banner:    '#3A2E2F',
  bannerText:'#F0ECE7',
  todayLabel:'rgba(240,236,231,0.50)',
};

const CP = D; // static StyleSheet fallback

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { bg: string; dbg: string; color: string; label: string }> = {
  confirmed:   { bg: '#E8F5EE', dbg: '#1B3D2A', color: '#2E7D52', label: 'Confirmed'   },
  pending:     { bg: '#FBF1E0', dbg: '#3D2E10', color: '#B8730A', label: 'Pending'     },
  completed:   { bg: '#E8F5EE', dbg: '#1B3D2A', color: '#2E7D52', label: 'Completed'   },
  cancelled:   { bg: '#FDEAEA', dbg: '#3D1B1B', color: '#C73535', label: 'Cancelled'   },
  no_show:     { bg: '#FDEAEA', dbg: '#3D1B1B', color: '#C73535', label: 'No Show'     },
  in_progress: { bg: '#F3EAFF', dbg: '#2E1A40', color: '#7B2FBE', label: 'In Progress' },
  upcoming:    { bg: '#E8F5EE', dbg: '#1B3D2A', color: '#2E7D52', label: 'Confirmed'   },
};

const TL_STATUS_COLOR: Record<string, string> = {
  pending:     '#B8730A',
  confirmed:   '#0A84FF',
  upcoming:    '#0A84FF',
  in_progress: '#7B2FBE',
  completed:   '#2E7D52',
  cancelled:   '#C73535',
  no_show:     '#B8730A',
};

function statusCfg(s: string) {
  return STATUS_CFG[s] ?? STATUS_CFG['completed']!;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

const DAY_HEADERS  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_ABBREV   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAY_FULL     = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function formatDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseTimeToMinutes(t: string): number {
  const clean = t.trim().toUpperCase();
  const isPM  = clean.includes('PM');
  const isAM  = clean.includes('AM');
  const part  = clean.replace(/[AP]M/i, '').trim();
  const [hs, ms] = part.split(':');
  let h = parseInt(hs || '0', 10);
  const m = parseInt(ms || '0', 10);
  if (isAM && h === 12) h = 0;
  if (isPM && h !== 12) h += 12;
  return h * 60 + m;
}

function fmtTime12(t: string): string {
  const [hs, ms] = t.split(':');
  let h = parseInt(hs || '0', 10);
  const m = parseInt(ms || '0', 10);
  const ap = h >= 12 ? 'pm' : 'am';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')}${ap}`;
}

function countdownLabel(bookingDate: string, bookingTime: string): string | null {
  const [y, mo, d] = bookingDate.split('-').map(Number);
  const mins = parseTimeToMinutes(bookingTime);
  const dt   = new Date(y!, mo! - 1, d!);
  dt.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  const ms  = dt.getTime() - Date.now();
  if (ms <= 0 || ms > 172_800_000) return null;
  const m = Math.round(ms / 60_000);
  if (m < 60) return `in ${m}m`;
  const h  = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `in ${h}h ${rm}m` : `in ${h}h`;
}

function sectionLabel(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const dt    = new Date(y!, mo! - 1, d!);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff  = Math.round((dt.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0)  return 'today';
  if (diff === 1)  return 'tomorrow';
  if (diff === -1) return 'yesterday';
  return 'other';
}

function sectionTitle(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const dt = new Date(y!, mo! - 1, d!);
  const dayName = DAY_FULL[dt.getDay()] ?? '';
  const date    = dt.getDate();
  const ord     = [,'st','nd','rd'][(date % 100 - 20) % 10] ?? ['th','st','nd','rd'][date % 100] ?? 'th';
  return `${dayName} ${date}${ord}`;
}

function isPastBooking(dateStr: string, timeStr: string): boolean {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const mins = parseTimeToMinutes(timeStr);
  const dt   = new Date(y!, mo! - 1, d!);
  dt.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return dt.getTime() < Date.now();
}

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  let startDay   = firstDay.getDay() - 1;
  if (startDay < 0) startDay = 6;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ date: Date; dateString: string } | null> = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    cells.push({ date, dateString: formatDateString(date) });
  }
  return cells;
}

function getBookingRef(id: string) {
  return id.replace(/-/g, '').substring(0, 10).toUpperCase();
}

function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  const date = d.getDate();
  const ord  = [,'st','nd','rd'][(date % 100 - 20) % 10] ?? ['th','st','nd','rd'][date % 100] ?? 'th';
  const h12  = d.getHours() % 12 || 12;
  return `${DAY_FULL[d.getDay()]} ${date}${ord} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}, ${h12}:${String(d.getMinutes()).padStart(2, '0')}${d.getHours() >= 12 ? 'pm' : 'am'}`;
}

// ─── Date strip ───────────────────────────────────────────────────────────────

const TILE_W   = 58;
const TILE_GAP = 8;
const STRIDE   = TILE_W + TILE_GAP;
const BACK     = 7;
const AHEAD    = 30;

function buildStrip(): string[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Array.from({ length: BACK + AHEAD + 1 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i - BACK);
    return formatDateString(d);
  });
}

const STRIP_DATES = buildStrip();
const TODAY_STR   = formatDateString(new Date());
const TODAY_IDX   = STRIP_DATES.indexOf(TODAY_STR);

// ─── Expansion state ──────────────────────────────────────────────────────────

type ExpansionState = 0 | 1 | 2;

// ─── Booking card ─────────────────────────────────────────────────────────────

function generateDayTabs(): Array<{ label: string; dateString: string }> {
  const tabs: Array<{ label: string; dateString: string }> = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    let label: string;
    if (i === 0)      label = 'Today';
    else if (i === 1) label = 'Tomorrow';
    else              label = DAY_FULL[date.getDay()] ?? '';
    tabs.push({ label, dateString: formatDateString(date) });
  }
  return tabs;
}

interface BookingCardProps {
  booking: ConfirmedBooking;
  expansionState: ExpansionState;
  onToggleExpand: () => void;
  onPress: () => void;
  onViewMessages: () => void;
  dark: boolean;
  P: typeof L;
}

function BookingCard({ booking, expansionState, onToggleExpand, onPress, onViewMessages, dark, P }: BookingCardProps) {
  const cfg   = statusCfg(booking.status);
  const past  = isPastBooking(booking.bookingDate, booking.bookingTime);
  const eta   = countdownLabel(booking.bookingDate, booking.bookingTime);
  const addOns = booking.addOns?.reduce((s, a) => s + a.price, 0) ?? 0;
  const total  = booking.price + addOns;
  const ref    = getBookingRef(booking.id);
  const pillBg = dark ? cfg.dbg : cfg.bg;

  const expandScale = useRef(new Animated.Value(1)).current;
  const expandLabel = expansionState === 0 ? 'Expand' : expansionState === 1 ? 'More' : 'Collapse';

  const handleExpand = (e: any) => {
    e.stopPropagation?.();
    Animated.sequence([
      Animated.timing(expandScale, { toValue: 0.82, duration: 70,  useNativeDriver: true }),
      Animated.spring(expandScale,  { toValue: 1,    tension: 160, friction: 7, useNativeDriver: true }),
    ]).start();
    onToggleExpand();
  };

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={[bc.wrap, { backgroundColor: P.card, borderColor: P.border, shadowColor: dark ? 'transparent' : '#000' }]}
    >
      {/* Row 1 — pill + time + expand */}
      <View style={bc.topRow}>
        <View style={[bc.pill, { backgroundColor: pillBg }]}>
          <Text style={[bc.pillText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
        <View style={bc.topRight}>
          {!!booking.bookingTime && (
            <Text style={[bc.time, { color: P.text }]}>
              {booking.bookingTime.replace(/\s*(AM|PM)/i, m => m.toLowerCase())}
            </Text>
          )}
          <Animated.View style={{ transform: [{ scale: expandScale }] }}>
            <TouchableOpacity
              onPress={handleExpand}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={[bc.expandBtn, { backgroundColor: P.iconBg }]}
            >
              <Text style={[bc.expandTxt, { color: P.sub }]}>{expandLabel}</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>

      {/* Row 2 — title */}
      <Text
        style={[bc.title, { color: P.text, textDecorationLine: past ? 'line-through' : 'none' }]}
        numberOfLines={1}
      >
        {booking.serviceName}
      </Text>

      {/* Row 3 — client + countdown */}
      <View style={bc.row3}>
        <Text style={[bc.client, { color: P.sub, textDecorationLine: past ? 'line-through' : 'none' }]} numberOfLines={1}>
          {booking.customerName || 'Client'}
        </Text>
        {!!eta && (
          <View style={[bc.etaBadge, { backgroundColor: dark ? P.iconBg : '#E4EEF8' }]}>
            <Text style={[bc.etaTxt, { color: P.indicator }]}>{eta}</Text>
          </View>
        )}
      </View>

      {/* ── Booking Summary (state ≥ 1) ── */}
      {expansionState >= 1 && (
        <View style={[bc.expand, { borderTopColor: P.sep }]}>
          <Text style={[bc.expandHdr, { color: P.sub }]}>BOOKING SUMMARY</Text>
          <SummaryRow label="Service"  value={booking.serviceName} P={P} />
          <SummaryRow label="Time"     value={booking.bookingTime} P={P} />
          <SummaryRow label="Duration" value={booking.duration} P={P} />
          <SummaryRow label="Price"    value={`£${booking.price}`} P={P} />
          {booking.addOns && booking.addOns.length > 0 && booking.addOns.map(a => (
            <Text key={a.id} style={bc.addOn}>With Add-ons – {a.name} – £{a.price}</Text>
          ))}
          {!!booking.notes && (
            <SummaryRow label="Client Notes" value={`"${booking.notes}"`} italic P={P} />
          )}
          <View style={[bc.payRow, { marginTop: 10 }]}>
            <Text style={[bc.summaryLabel, { color: P.sub }]}>Service Total  </Text>
            <Text style={[bc.summaryVal, { color: P.text }]}>£{total}</Text>
          </View>
          <Text style={bc.deposit}>Deposit paid – £{booking.amountPaid}</Text>
          <Text style={bc.balance}>Total due – £{booking.remainingBalance ?? 0}</Text>
          <SummaryRow label="Payment Method" value={booking.paymentMethod || 'Card'} P={P} />
        </View>
      )}

      {/* ── Relevant Info (state ≥ 2) ── */}
      {expansionState >= 2 && (
        <View style={[bc.expand, { borderTopColor: P.sep }]}>
          <Text style={[bc.expandHdr, { color: P.sub }]}>RELEVANT INFORMATION</Text>
          <SummaryRow label="Booked Date" value={formatCreatedAt(booking.createdAt)} P={P} />
          {!!booking.bookingInstructions && (
            <Text style={[bc.instructions, { color: P.sub }]}>*{booking.bookingInstructions}*</Text>
          )}
          <SummaryRow label="Booking Ref/ID" value={ref} P={P} />
          <TouchableOpacity style={[bc.msgBtn, { backgroundColor: P.indicator }]} activeOpacity={0.75} onPress={onViewMessages}>
            <Text style={[bc.msgBtnTxt, { color: '#fff' }]}>View Messages</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

function SummaryRow({ label, value, italic, P }: { label: string; value: string; italic?: boolean; P: typeof L }) {
  return (
    <View style={bc.payRow}>
      <Text style={[bc.summaryLabel, { color: P.sub }]}>{label} – </Text>
      <Text style={[bc.summaryVal, { color: P.text, fontStyle: italic ? 'italic' : 'normal', flex: 1 }]}>{value}</Text>
    </View>
  );
}

const bc = StyleSheet.create({
  wrap:       { borderRadius: 16, padding: 14, marginHorizontal: 16, marginBottom: 10, borderWidth: StyleSheet.hairlineWidth, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  topRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  pill:       { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8 },
  pillText:   { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  topRight:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  time:       { fontSize: 13, fontWeight: '600' },
  expandBtn:  { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  expandTxt:  { fontSize: 11, fontWeight: '600' },
  title:      { fontSize: 16, fontWeight: '600', letterSpacing: -0.3, marginBottom: 5 },
  row3:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  client:     { fontSize: 13, flex: 1, marginRight: 8 },
  etaBadge:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  etaTxt:     { fontSize: 12, fontWeight: '600' },

  expand:     { marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, gap: 4 },
  expandHdr:  { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 6 },
  payRow:     { flexDirection: 'row', flexWrap: 'wrap' },
  summaryLabel:{ fontSize: 13 },
  summaryVal: { fontSize: 13, fontWeight: '500' },
  addOn:      { fontSize: 13, color: '#B8730A', fontWeight: '500', marginBottom: 2 },
  deposit:    { fontSize: 13, color: '#2E7D52', fontWeight: '600', marginBottom: 2 },
  balance:    { fontSize: 13, color: '#C73535', fontWeight: '600', marginBottom: 2 },
  instructions:{ fontSize: 13, fontStyle: 'italic', marginVertical: 6 },
  msgBtn:     { marginTop: 14, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  msgBtnTxt:  { fontSize: 14, fontWeight: '600' },
});

// ─── Timeline view ───────────────────────────────────────────────────────────

const TL_START_HOUR = 7;  // 7 AM
const TL_END_HOUR   = 21; // 9 PM
const TL_HOURS      = TL_END_HOUR - TL_START_HOUR;
const HOUR_H        = 64; // px per hour
const TIMELINE_H    = TL_HOURS * HOUR_H;
const TIME_COL_W    = 48;

function parseDurationToMinutes(dur: string): number {
  if (!dur) return 60;
  const hoursMatch = dur.match(/(\d+)\s*h/i);
  const minsMatch  = dur.match(/(\d+)\s*m/i);
  const h = hoursMatch ? parseInt(hoursMatch[1]!) : 0;
  const m = minsMatch  ? parseInt(minsMatch[1]!)  : 0;
  if (h === 0 && m === 0) return 60;
  return h * 60 + m;
}

const BLOCK_COLORS = [
  { bg: '#0A84FF', dark: '#2F91FF', text: '#FFFFFF' },
  { bg: '#34C759', dark: '#30D158', text: '#FFFFFF' },
  { bg: '#FF9F0A', dark: '#FF9F0A', text: '#FFFFFF' },
  { bg: '#AF52DE', dark: '#BF5AF2', text: '#FFFFFF' },
  { bg: '#FF375F', dark: '#FF453A', text: '#FFFFFF' },
];

interface DayTimelineProps {
  bookings: ConfirmedBooking[];
  onPress: (booking: ConfirmedBooking) => void;
  dark: boolean;
  P: typeof L;
  refreshing: boolean;
  onRefresh: () => void;
  availability: DbProviderAvailability | null;
  isBlocked: boolean;
}

function DayTimeline({ bookings, onPress, dark, P, refreshing, onRefresh, availability, isBlocked }: DayTimelineProps) {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowTop = ((nowMinutes - TL_START_HOUR * 60) / 60) * HOUR_H;
  const showNowLine = nowMinutes >= TL_START_HOUR * 60 && nowMinutes <= TL_END_HOUR * 60;

  // Position each booking
  type Positioned = {
    booking: ConfirmedBooking;
    top: number;
    height: number;
    col: number;
    cols: number;
    colorIdx: number;
  };

  const positioned: Positioned[] = bookings.map((b, i) => {
    const startMin = parseTimeToMinutes(b.bookingTime);
    const dur      = parseDurationToMinutes(b.duration);
    const top      = Math.max(0, ((startMin - TL_START_HOUR * 60) / 60) * HOUR_H);
    const height   = Math.max(30, (dur / 60) * HOUR_H);
    return { booking: b, top, height, col: 0, cols: 1, colorIdx: i % BLOCK_COLORS.length };
  });

  // Simple overlap detection: assign columns
  for (let i = 0; i < positioned.length; i++) {
    const a = positioned[i]!;
    let col = 0;
    const usedCols = new Set<number>();
    for (let j = 0; j < i; j++) {
      const b = positioned[j]!;
      const aEnd = a.top + a.height;
      const bEnd = b.top + b.height;
      if (a.top < bEnd && aEnd > b.top) usedCols.add(b.col);
    }
    while (usedCols.has(col)) col++;
    a.col = col;
  }
  const maxCols = Math.max(1, ...positioned.map(p => p.col + 1));
  positioned.forEach(p => { p.cols = maxCols; });

  const bookingAreaW = SW - TIME_COL_W - 32;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ height: TIMELINE_H + 80, paddingBottom: 100 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P.indicator} />}
    >
      <View style={{ flex: 1, flexDirection: 'row', marginHorizontal: 16 }}>
        {/* Time labels column */}
        <View style={{ width: TIME_COL_W }}>
          {Array.from({ length: TL_HOURS + 1 }, (_, i) => {
            const h = TL_START_HOUR + i;
            const label = h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`;
            return (
              <View key={h} style={{ position: 'absolute', top: i * HOUR_H - 8, width: TIME_COL_W, alignItems: 'flex-end', paddingRight: 10 }}>
                <Text style={{ fontSize: 11, fontWeight: '500', color: P.sub }}>{label}</Text>
              </View>
            );
          })}
        </View>

        {/* Grid + bookings */}
        <View style={{ flex: 1, position: 'relative' }}>
          {/* Hour lines */}
          {Array.from({ length: TL_HOURS + 1 }, (_, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                top: i * HOUR_H,
                left: 0,
                right: 0,
                height: StyleSheet.hairlineWidth,
                backgroundColor: P.border,
              }}
            />
          ))}

          {/* Half-hour lines */}
          {Array.from({ length: TL_HOURS }, (_, i) => (
            <View
              key={`h${i}`}
              style={{
                position: 'absolute',
                top: i * HOUR_H + HOUR_H / 2,
                left: 0,
                right: 0,
                height: StyleSheet.hairlineWidth,
                backgroundColor: P.sep,
              }}
            />
          ))}

          {/* Unavailable-hours overlay */}
          {availability && !isBlocked && !availability.is_closed && (() => {
            const openH  = parseInt(availability.open_time.split(':')[0]!);
            const openM  = parseInt(availability.open_time.split(':')[1]!);
            const closeH = parseInt(availability.close_time.split(':')[0]!);
            const closeM = parseInt(availability.close_time.split(':')[1]!);
            const openMin  = openH  * 60 + openM;
            const closeMin = closeH * 60 + closeM;
            const tlStart  = TL_START_HOUR * 60;
            const tlEnd    = TL_END_HOUR   * 60;
            const dimStyle = { position: 'absolute' as const, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.32)' };
            const blocks: React.ReactElement[] = [];
            if (openMin > tlStart) {
              const top    = 0;
              const height = ((openMin - tlStart) / 60) * HOUR_H;
              blocks.push(<View key="pre" style={[dimStyle, { top, height }]} />);
            }
            if (closeMin < tlEnd) {
              const top    = ((closeMin - tlStart) / 60) * HOUR_H;
              const height = ((tlEnd - closeMin) / 60) * HOUR_H;
              blocks.push(<View key="post" style={[dimStyle, { top, height }]} />);
            }
            return blocks;
          })()}
          {(isBlocked || availability?.is_closed) && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' }} />
          )}

          {/* Now indicator */}
          {showNowLine && (
            <View style={{ position: 'absolute', top: nowTop, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', zIndex: 10 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: P.indicator, marginLeft: -4 }} />
              <View style={{ flex: 1, height: 1.5, backgroundColor: P.indicator }} />
            </View>
          )}

          {/* Booking blocks */}
          {positioned.map(({ booking, top, height, col, cols, colorIdx }) => {
            const cfg   = statusCfg(booking.status);
            const color = BLOCK_COLORS[colorIdx]!;
            const blockW = bookingAreaW / cols - 4;
            const left   = col * (bookingAreaW / cols) + 2;
            const past   = isPastBooking(booking.bookingDate, booking.bookingTime);
            const startMin = parseTimeToMinutes(booking.bookingTime);
            const endMin   = startMin + parseDurationToMinutes(booking.duration);
            const isClash  = availability && !availability.is_closed && !isBlocked && (() => {
              const openMin  = parseInt(availability.open_time.split(':')[0]!)  * 60 + parseInt(availability.open_time.split(':')[1]!);
              const closeMin = parseInt(availability.close_time.split(':')[0]!) * 60 + parseInt(availability.close_time.split(':')[1]!);
              return startMin < openMin || endMin > closeMin;
            })();

            return (
              <TouchableOpacity
                key={booking.id}
                activeOpacity={0.82}
                onPress={() => onPress(booking)}
                style={{
                  position: 'absolute',
                  top,
                  left,
                  width: blockW,
                  height,
                  borderRadius: 10,
                  backgroundColor: color.dark + '40',
                  borderLeftWidth: 3,
                  borderLeftColor: color.dark,
                  paddingHorizontal: 8,
                  paddingVertical: 5,
                  overflow: 'hidden',
                  opacity: past ? 0.50 : 1,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: color.dark }} numberOfLines={1}>
                  {booking.bookingTime.replace(/\s*(AM|PM)/i, m => m.toLowerCase())}
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '600', color: P.text, marginTop: 1 }} numberOfLines={1}>
                  {booking.serviceName}
                </Text>
                {height > 44 && (
                  <Text style={{ fontSize: 11, color: P.sub, marginTop: 1 }} numberOfLines={1}>
                    {booking.customerName || 'Client'}
                  </Text>
                )}
                {height > 60 && (
                  <View style={{ position: 'absolute', top: 4, right: 6, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5, backgroundColor: color.dark + '55' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: color.dark }}>{cfg.label}</Text>
                  </View>
                )}
                {isClash && (
                  <View style={{ position: 'absolute', bottom: 4, right: 6, width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFB340', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 9, fontWeight: '900', color: '#2E1E08' }}>!</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
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
  const op = anim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });

  return (
    <Animated.View style={[bc.wrap, { opacity: op, height: 90, backgroundColor: CP.card, borderColor: CP.border }]} />
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionBanner({ dateStr, P }: { dateStr: string; P: typeof L }) {
  const kind = sectionLabel(dateStr);
  if (kind === 'today') {
    return (
      <View style={sh.todayWrap}>
        <Text style={[sh.todayText, { color: P.todayLabel }]}>Today</Text>
      </View>
    );
  }
  const title    = sectionTitle(dateStr);
  const subtitle = kind === 'tomorrow' ? 'Tomorrow' : kind === 'yesterday' ? 'Yesterday' : undefined;
  return (
    <View style={[sh.banner, { backgroundColor: P.banner }]}>
      <Text style={[sh.bannerTitle, { color: P.bannerText }]}>{title}</Text>
      {!!subtitle && <Text style={[sh.bannerSub, { color: P.bannerText }]}>{subtitle}</Text>}
    </View>
  );
}

const sh = StyleSheet.create({
  todayWrap:   { paddingVertical: 12, alignItems: 'center' },
  todayText:   { fontSize: 14, fontWeight: '600', letterSpacing: 0.1 },
  banner:      { paddingVertical: 13, paddingHorizontal: 20, marginVertical: 6, marginHorizontal: 16, borderRadius: 14, alignItems: 'center' },
  bannerTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  bannerSub:   { fontSize: 12, fontWeight: '500', marginTop: 2, opacity: 0.7 },
});

// ─── Supabase mapper ──────────────────────────────────────────────────────────

function mapDbToProviderBooking(db: BookingWithAddOns): ConfirmedBooking {
  const toDisplay = (t: string) => {
    const [hs, ms] = t.split(':');
    let h = parseInt(hs ?? '0');
    const m = parseInt(ms ?? '0');
    const p = h >= 12 ? 'PM' : 'AM';
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return `${h}:${String(m).padStart(2, '0')} ${p}`;
  };
  const mapStatus = (s: string): BookingStatus => {
    switch (s) {
      case 'pending':     return BookingStatus.PENDING;
      case 'in_progress': return BookingStatus.IN_PROGRESS;
      case 'completed':   return BookingStatus.COMPLETED;
      case 'cancelled':   return BookingStatus.CANCELLED;
      case 'no_show':     return BookingStatus.NO_SHOW;
      default:            return BookingStatus.UPCOMING;
    }
  };
  return {
    id:                  db.id,
    cartItemId:          db.id,
    providerName:        db.provider_name_snapshot,
    providerImage:       db.provider_logo_snapshot ?? null,
    providerService:     '',
    serviceName:         db.service_name_snapshot,
    serviceDescription:  '',
    price:               db.base_price,
    duration:            (() => { const s = db.booking_time.split(':'); const e = db.end_time?.split(':'); const sm = parseInt(s[0]??'0')*60+parseInt(s[1]??'0'); const em = e ? parseInt(e[0]??'0')*60+parseInt(e[1]??'0') : sm+60; const d = Math.max(30, em-sm); const h = Math.floor(d/60); const m = d%60; return m===0 ? `${h}h` : `${h}h ${m}m`; })(),
    quantity:            1,
    bookingDate:         db.booking_date,
    bookingTime:         toDisplay(db.booking_time),
    endTime:             db.end_time ? toDisplay(db.end_time) : toDisplay(db.booking_time),
    status:              mapStatus(db.status),
    address:             db.provider_address_snapshot ?? '',
    coordinates:         { latitude: 0, longitude: 0 },
    phone:               db.provider_phone_snapshot ?? '',
    customerName:        db.customer_name ?? '',
    customerEmail:       db.customer_email ?? '',
    customerPhone:       db.customer_phone ?? '',
    paymentType:         (db.payment_type ?? 'full') as 'full' | 'deposit',
    amountPaid:          db.amount_paid,
    depositAmount:       db.deposit_amount ?? 0,
    remainingBalance:    db.remaining_balance ?? 0,
    serviceCharge:       db.service_charge ?? 2.99,
    paymentStatus:       PaymentStatus.PAID_IN_FULL,
    notes:               db.notes ?? undefined,
    bookingInstructions: db.booking_instructions ?? undefined,
    addOns:              (db.add_ons ?? []).map(a => ({ id: a.add_on_id ?? a.id, name: a.name_snapshot, price: a.price_snapshot })),
    providerId:          db.provider_id,
    groupBookingId:      db.group_booking_id ?? undefined,
    createdAt:           db.created_at ?? new Date().toISOString(),
    updatedAt:           db.updated_at ?? new Date().toISOString(),
  };
}

// ─── Row types for main list ──────────────────────────────────────────────────

type ListRow =
  | { t: 'section'; dateStr: string }
  | { t: 'booking'; booking: ConfirmedBooking }
  | { t: 'empty';   dateStr: string };

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProviderHomeScreen({ navigation }: Props) {
  const { isDarkMode: dark } = useTheme();
  const P = dark ? D : L;
  useBooking();

  const todayStr = TODAY_STR;

  // Selected date
  const [selectedDate, setSelectedDate] = useState(todayStr);

  // Expansion states per booking
  const [expansionStates, setExpansionStates] = useState<Record<string, ExpansionState>>({});

  // View mode: list or timeline (timeline is default — Apple Calendar style)
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('timeline');

  // Month calendar toggle
  const [showMonth, setShowMonth]   = useState(false);
  const [calMonth, setCalMonth]     = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  // Live bookings
  const [bookings,  setBookings]    = useState<ConfirmedBooking[]>([]);
  const [loading,   setLoading]     = useState(true);
  const [refreshing,setRefreshing]  = useState(false);

  // Provider availability
  const [availability,  setAvailability]  = useState<DbProviderAvailability[]>([]);
  const [blockedDates,  setBlockedDates]  = useState<DbProviderBlockedDate[]>([]);

  // Go-live setup checklist. Clients see NO slots and can't book until the
  // schedule exists, so surface exactly what's missing until it's all done.
  const [setupStatus, setSetupStatus] = useState<{
    scheduleSet: boolean;
    servicesSet: boolean;
    addressSet: boolean;
  } | null>(null);
  const [setupDismissed, setSetupDismissed] = useState(false);

  // Add-action sheet
  const [showAddSheet, setShowAddSheet] = useState(false);
  const SHEET_H = 420;
  const sheetY     = useRef(new Animated.Value(SHEET_H)).current;
  const backdropOp = useRef(new Animated.Value(0)).current;

  const openSheet = useCallback(() => {
    sheetY.setValue(SHEET_H);
    backdropOp.setValue(0);
    setShowAddSheet(true);
    Animated.parallel([
      Animated.spring(sheetY,     { toValue: 0,   useNativeDriver: true, damping: 26, stiffness: 320, mass: 0.9 }),
      Animated.timing(backdropOp, { toValue: 1,   duration: 180,         useNativeDriver: true }),
    ]).start();
  }, [sheetY, backdropOp]);

  const closeSheet = useCallback(() => {
    Animated.parallel([
      Animated.timing(sheetY,     { toValue: SHEET_H, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropOp, { toValue: 0,        duration: 200, useNativeDriver: true }),
    ]).start(() => { setShowAddSheet(false); });
  }, [sheetY, backdropOp]);

  // Offset so the sheet doesn't jump when capture fires at dy > 8
  const panStartDy = useRef(0);

  const sheetPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder:        () => false,
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponder:         () => false,
    onMoveShouldSetPanResponderCapture:  (_, g) => g.dy > 8 && g.dy > Math.abs(g.dx),
    onPanResponderGrant: (_, g) => {
      panStartDy.current = g.dy;
    },
    onPanResponderMove: (_, g) => {
      const dy = Math.max(0, g.dy - panStartDy.current);
      sheetY.setValue(dy);
      backdropOp.setValue(Math.max(0, 1 - dy / SHEET_H));
    },
    onPanResponderRelease: (_, g) => {
      const dy = g.dy - panStartDy.current;
      if (dy > 80 || g.vy > 0.4) {
        Animated.parallel([
          Animated.spring(sheetY,     { toValue: SHEET_H, velocity: g.vy, tension: 50, friction: 11, useNativeDriver: true }),
          Animated.timing(backdropOp, { toValue: 0, duration: 180, useNativeDriver: true }),
        ]).start(() => { setShowAddSheet(false); });
      } else {
        Animated.parallel([
          Animated.spring(sheetY,     { toValue: 0, velocity: g.vy, damping: 22, stiffness: 300, useNativeDriver: true }),
          Animated.timing(backdropOp, { toValue: 1, duration: 120, useNativeDriver: true }),
        ]).start();
      }
    },
  })).current;

  const stripRef = useRef<FlatList>(null);
  const listRef  = useRef<FlatList>(null);

  // List entrance animation
  const listOpacity = useRef(new Animated.Value(1)).current;
  const listSlide   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    listOpacity.setValue(0);
    listSlide.setValue(16);
    Animated.parallel([
      Animated.timing(listOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(listSlide,   { toValue: 0, tension: 90, friction: 13, useNativeDriver: true }),
    ]).start();
  }, [selectedDate]);

  // Auto-scroll strip to today on mount
  useEffect(() => {
    const t = setTimeout(() => {
      stripRef.current?.scrollToIndex({ index: TODAY_IDX, animated: false, viewPosition: 0.4 });
    }, 150);
    return () => clearTimeout(t);
  }, []);

  // Fetch bookings
  const loadBookings = useCallback(async (showLoad = false) => {
    if (showLoad) setLoading(true);
    try {
      const rows = await getProviderBookings();
      setBookings(rows.map(mapDbToProviderBooking));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadBookings(true); }, [loadBookings]);
  useFocusEffect(useCallback(() => { loadBookings(); }, [loadBookings]));

  // Reload availability/blocked dates whenever screen is focused (e.g. after editing in ProviderScheduleScreen)
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    getMyProviderProfile().then(profile => {
      if (!profile || cancelled) return;
      return Promise.all([
        getProviderAvailability(profile.id),
        getProviderBlockedDates(profile.id),
        supabase.from('services').select('id', { count: 'exact', head: true }).eq('provider_id', profile.id),
      ]).then(([avail, blocked, servicesRes]) => {
        if (cancelled) return;
        setAvailability(avail);
        setBlockedDates(blocked);
        const p = profile as unknown as { business_type?: string | null; full_address?: string | null; location_text?: string | null };
        setSetupStatus({
          scheduleSet: avail.some(a => !a.is_closed),
          servicesSet: (servicesRes.count ?? 0) > 0,
          addressSet: p.business_type === 'mobile' ? true : !!(p.full_address || p.location_text),
        });
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []));

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    getMyProviderProfile().then(profile => {
      if (!profile || cancelled) return;
      channel = supabase
        .channel('provider-home-v2')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `provider_id=eq.${profile.id}` },
          () => { loadBookings(); })
        .subscribe();
    }).catch(() => {});
    return () => { cancelled = true; if (channel) supabase.removeChannel(channel); };
  }, [loadBookings]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadBookings();
    setRefreshing(false);
  }, [loadBookings]);

  // Availability for the selected date's day of week
  const todayAvailability = useMemo(() => {
    const dow = new Date(selectedDate + 'T00:00:00').getDay();
    return availability.find(a => a.day_of_week === dow) ?? null;
  }, [selectedDate, availability]);

  const isSelectedDateBlocked = useMemo(() =>
    blockedDates.some(b => b.blocked_date === selectedDate),
  [selectedDate, blockedDates]);

  // Booking count per date for dots
  const countByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of bookings) map[b.bookingDate] = (map[b.bookingDate] ?? 0) + 1;
    return map;
  }, [bookings]);

  // Build list rows: show ALL upcoming bookings grouped by day (from selectedDate onwards)
  const listRows = useMemo((): ListRow[] => {
    const sorted = [...bookings].sort((a, b) => {
      const da = a.bookingDate + a.bookingTime;
      const db_ = b.bookingDate + b.bookingTime;
      return da.localeCompare(db_);
    });

    // Group by date
    const groups: Map<string, ConfirmedBooking[]> = new Map();
    for (const b of sorted) {
      if (!groups.has(b.bookingDate)) groups.set(b.bookingDate, []);
      groups.get(b.bookingDate)!.push(b);
    }

    // Only show selectedDate and onward (max 14 days)
    const rows: ListRow[] = [];
    const cutoff = new Date(selectedDate + 'T00:00:00');
    cutoff.setDate(cutoff.getDate() + 14);
    const cutoffStr = formatDateString(cutoff);

    // Always show selected date first, even if empty
    const selectedGroup = groups.get(selectedDate) ?? [];
    rows.push({ t: 'section', dateStr: selectedDate });
    if (selectedGroup.length === 0) {
      rows.push({ t: 'empty', dateStr: selectedDate });
    } else {
      for (const b of selectedGroup) rows.push({ t: 'booking', booking: b });
    }

    // Then following days that have bookings
    for (const [dateStr, dayBookings] of groups) {
      if (dateStr <= selectedDate || dateStr > cutoffStr) continue;
      rows.push({ t: 'section', dateStr });
      for (const b of dayBookings) rows.push({ t: 'booking', booking: b });
    }

    return rows;
  }, [bookings, selectedDate]);

  // Month calendar cells
  const monthCells = useMemo(
    () => getMonthDays(calMonth.getFullYear(), calMonth.getMonth()),
    [calMonth]
  );

  const monthLabel = `${MONTH_NAMES[calMonth.getMonth()]} ${calMonth.getFullYear()}`;

  // Handlers
  const toggleExpand = useCallback((id: string) => {
    setExpansionStates(prev => {
      const cur = (prev[id] ?? 0) as ExpansionState;
      const next: ExpansionState = cur === 0 ? 1 : cur === 1 ? 2 : 0;
      return { ...prev, [id]: next };
    });
  }, []);

  const openConversation = useCallback(async (booking: ConfirmedBooking) => {
    const clientUserId = booking.clientUserId;
    const providerId = booking.providerId;
    if (!clientUserId || !providerId) return;
    try {
      const clientName = booking.customerName || 'Client';
      const { data: existing } = await supabase
        .from('provider_conversations')
        .select('id')
        .eq('provider_id', providerId)
        .eq('user_id', clientUserId)
        .maybeSingle();
      if (existing?.id) {
        navigation.navigate('ProviderConversation', { conversationId: existing.id, clientUserId, clientName });
        return;
      }
      const { data: created, error } = await supabase
        .from('provider_conversations')
        .insert({ provider_id: providerId, user_id: clientUserId })
        .select('id')
        .single();
      if (error || !created) throw error;
      navigation.navigate('ProviderConversation', { conversationId: created.id, clientUserId, clientName });
    } catch {
      Alert.alert('Error', 'Could not open chat. Try again.');
    }
  }, [navigation]);

  const handleDateTap = useCallback((dateStr: string) => {
    setSelectedDate(dateStr);
    const idx = STRIP_DATES.indexOf(dateStr);
    if (idx >= 0) stripRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.4 });
  }, []);

  const toggleMonth = () => {
    setShowMonth(v => !v);
  };

  // Month label derived from selected date
  const displayMonth = useMemo(() => {
    const [y, mo] = selectedDate.split('-').map(Number);
    return `${MONTH_NAMES[mo! - 1]} ${y}`;
  }, [selectedDate]);

  return (
    <View style={[s.root, { backgroundColor: P.bg }]}>
      <SafeAreaView style={s.safe} edges={['top']}>

        {/* ── Header — Apple Calendar style ───────────────────── */}
        <View style={s.header}>
          {/* Month title + chevron dropdown */}
          <TouchableOpacity onPress={toggleMonth} style={s.headerTitle} activeOpacity={0.75}>
            <Text style={[s.headerTitleText, { color: P.text }]}>{displayMonth}</Text>
            <Ionicons name={showMonth ? 'chevron-up' : 'chevron-down'} size={13} color={P.sub} style={{ marginLeft: 4 }} />
          </TouchableOpacity>

          {/* Right actions */}
          <View style={s.headerRight}>
            <TouchableOpacity
              onPress={() => handleDateTap(TODAY_STR)}
              style={[s.todayChip, { backgroundColor: P.accent }]}
            >
              <Text style={[s.todayChipTxt, { color: P.ice }]}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setViewMode(v => v === 'list' ? 'timeline' : 'list')}
              style={[s.iconBtn, { backgroundColor: viewMode === 'timeline' ? P.accent : P.iconBg }]}
            >
              <Ionicons name={viewMode === 'timeline' ? 'list-outline' : 'time-outline'} size={17} color={viewMode === 'timeline' ? P.ice : P.sub} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate('Notifications')}
              style={[s.iconBtn, { backgroundColor: P.iconBg }]}
            >
              <Ionicons name="notifications-outline" size={17} color={P.sub} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Go-live setup checklist ──────────────────────────── */}
        {setupStatus && !setupDismissed &&
         !(setupStatus.scheduleSet && setupStatus.servicesSet && setupStatus.addressSet) && (
          <View style={{
            marginHorizontal: 16, marginBottom: 10, padding: 14, borderRadius: 14,
            backgroundColor: P.surface, borderWidth: 1, borderColor: P.border,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: P.text }}>Finish setting up to go live</Text>
              {/* Only dismissible once bookable (schedule set) — the schedule is the hard blocker */}
              {setupStatus.scheduleSet && (
                <TouchableOpacity onPress={() => setSetupDismissed(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={16} color={P.sub} />
                </TouchableOpacity>
              )}
            </View>
            {!setupStatus.scheduleSet && (
              <Text style={{ fontSize: 12, color: '#FF9500', marginTop: 4 }}>
                Clients can't see any time slots or book you until your schedule is set.
              </Text>
            )}
            {([
              {
                done: setupStatus.scheduleSet,
                label: 'Set your weekly schedule',
                onPress: () => navigation.navigate('ProviderSchedule' as never),
              },
              {
                done: setupStatus.servicesSet,
                label: 'Add at least one service',
                onPress: () => (navigation.getParent() as any)?.navigate('Profile', { screen: 'EditProfile' }),
              },
              {
                done: setupStatus.addressSet,
                label: 'Add your business address',
                onPress: () => (navigation.getParent() as any)?.navigate('Profile', { screen: 'EditProfile' }),
              },
            ]).map((step, i) => (
              <TouchableOpacity
                key={i}
                onPress={step.onPress}
                disabled={step.done}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}
              >
                <Ionicons
                  name={step.done ? 'checkmark-circle' : 'ellipse-outline'}
                  size={18}
                  color={step.done ? '#34C759' : P.sub}
                />
                <Text style={{
                  flex: 1, marginLeft: 8, fontSize: 13,
                  color: step.done ? P.sub : P.text,
                  textDecorationLine: step.done ? 'line-through' : 'none',
                }}>
                  {step.label}
                </Text>
                {!step.done && <Ionicons name="chevron-forward" size={14} color={P.sub} />}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Month calendar (collapsible) ─────────────────────── */}
        {showMonth && (
          <View style={[s.monthView, { backgroundColor: P.surface, borderColor: P.border }]}>

            {/* Nav */}
            <View style={s.monthNav}>
              <TouchableOpacity onPress={() => setCalMonth(m => { const n = new Date(m); n.setMonth(m.getMonth()-1); return n; })} style={s.monthArrow}>
                <Ionicons name="chevron-back" size={20} color={P.text} />
              </TouchableOpacity>
              <Text style={[s.monthNavLabel, { color: P.text }]}>{monthLabel}</Text>
              <TouchableOpacity onPress={() => setCalMonth(m => { const n = new Date(m); n.setMonth(m.getMonth()+1); return n; })} style={s.monthArrow}>
                <Ionicons name="chevron-forward" size={20} color={P.text} />
              </TouchableOpacity>
            </View>

            {/* Day letter headers */}
            <View style={s.dayHeaderRow}>
              {['S','M','T','W','T','F','S'].map((d, i) => (
                <View key={i} style={s.dayHeaderCell}>
                  <Text style={[s.dayHeaderTxt, { color: P.sub }]}>{d}</Text>
                </View>
              ))}
            </View>

            {/* Grid */}
            <View style={s.calGrid}>
              {monthCells.map((cell, i) => {
                if (!cell) return <View key={`e${i}`} style={s.calCell} />;
                const count   = countByDate[cell.dateString] ?? 0;
                const isToday = cell.dateString === todayStr;
                const isSel   = cell.dateString === selectedDate;
                return (
                  <TouchableOpacity
                    key={cell.dateString}
                    style={s.calCell}
                    onPress={() => { handleDateTap(cell.dateString); toggleMonth(); }}
                    activeOpacity={0.6}
                  >
                    <View style={[
                      s.calCircle,
                      isSel && [s.calCircleSel, { backgroundColor: P.indicator }],
                      isToday && !isSel && [s.calCircleToday, { backgroundColor: P.text }],
                    ]}>
                      <Text style={[
                        s.calNum,
                        isSel && { color: '#fff', fontWeight: '700' },
                        isToday && !isSel && { color: P.bg, fontWeight: '700' },
                        !isSel && !isToday && { color: P.text },
                      ]}>
                        {cell.date.getDate()}
                      </Text>
                    </View>
                    {count > 0 && (
                      <View style={[s.calDot, { backgroundColor: isSel ? '#fff' : P.indicator }]} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* ── Date strip — hidden when month calendar is open ──── */}
        {!showMonth && <View style={[s.stripWrap, { backgroundColor: P.strip, borderBottomColor: P.border }]}>
          <FlatList
            ref={stripRef}
            data={STRIP_DATES}
            keyExtractor={d => d}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.stripContent}
            getItemLayout={(_, index) => ({ length: STRIDE, offset: STRIDE * index, index })}
            onScrollToIndexFailed={info => {
              stripRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
            }}
            renderItem={({ item: dateStr }) => {
              const [, , dd] = dateStr.split('-').map(Number);
              const dt       = new Date(dateStr + 'T00:00:00');
              const dayName  = ['S','M','T','W','T','F','S'][dt.getDay()] ?? '';
              const isToday  = dateStr === TODAY_STR;
              const isSel    = dateStr === selectedDate;
              const count    = countByDate[dateStr] ?? 0;

              return (
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => handleDateTap(dateStr)}
                  style={[s.dateTile, { width: TILE_W, marginRight: TILE_GAP }]}
                >
                  {/* Day letter */}
                  <Text style={[s.tileDayLetter, { color: isToday && !isSel ? P.indicator : P.sub }]}>
                    {dayName}
                  </Text>

                  {/* Date circle */}
                  <View style={[
                    s.dateCircle,
                    isSel && [s.dateCircleSel, { backgroundColor: P.indicator }],
                    isToday && !isSel && [s.dateCircleToday, { backgroundColor: P.text }],
                  ]}>
                    <Text style={[
                      s.tileNum,
                      isSel && { color: '#fff', fontWeight: '700' },
                      isToday && !isSel && { color: P.bg, fontWeight: '700' },
                      !isSel && !isToday && { color: P.text },
                    ]}>
                      {dd}
                    </Text>
                  </View>

                  {/* Booking dot */}
                  {count > 0 && (
                    <View style={[s.dot, { backgroundColor: isSel ? '#fff' : P.indicator }]} />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>}

        {/* ── Blocked / closed-day banner ──────────────────────────── */}
        {(isSelectedDateBlocked || todayAvailability?.is_closed) && (
          <View style={{ marginHorizontal: 16, marginTop: 8, marginBottom: 2, borderRadius: 12, backgroundColor: dark ? '#3D1B1B' : '#FDEAEA', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="ban-outline" size={16} color="#C73535" />
            <Text style={{ color: '#C73535', fontSize: 13, fontWeight: '600' }}>
              {isSelectedDateBlocked ? 'This day is blocked' : 'Closed — not available'}
            </Text>
          </View>
        )}

        {/* ── Booking list / Timeline ─────────────────────────────── */}
        <Animated.View style={[s.listWrap, { opacity: listOpacity, transform: [{ translateY: listSlide }] }]}>
          {loading ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, paddingBottom: 80 }}>
              <SectionBanner dateStr={todayStr} P={P} />
              {[1,2,3].map(k => <SkeletonCard key={k} />)}
            </ScrollView>
          ) : viewMode === 'timeline' ? (
            <DayTimeline
              bookings={bookings.filter(b => b.bookingDate === selectedDate)}
              onPress={b => navigation.navigate('BookingDetail', { bookingId: b.id, booking: b })}
              dark={dark}
              P={P}
              refreshing={refreshing}
              onRefresh={onRefresh}
              availability={todayAvailability}
              isBlocked={isSelectedDateBlocked}
            />
          ) : (
            <FlatList
              ref={listRef}
              data={listRows}
              keyExtractor={(item, i) =>
                item.t === 'section' ? `sec-${item.dateStr}` :
                item.t === 'booking' ? `bk-${item.booking.id}` :
                `empty-${i}`
              }
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 100, paddingTop: 4 }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P.indicator} />
              }
              renderItem={({ item }) => {
                if (item.t === 'section') {
                  return <SectionBanner dateStr={item.dateStr} P={P} />;
                }
                if (item.t === 'empty') {
                  return (
                    <View style={s.emptyDay}>
                      <Ionicons name="calendar-outline" size={36} color={P.sub} style={{ opacity: 0.45, marginBottom: 10 }} />
                      <Text style={[s.emptyTitle, { color: P.text }]}>No appointments</Text>
                      <Text style={[s.emptySub, { color: P.sub }]}>
                        {item.dateStr === todayStr ? "You're free today" : 'This day is free'}
                      </Text>
                    </View>
                  );
                }
                return (
                  <BookingCard
                    booking={item.booking}
                    expansionState={expansionStates[item.booking.id] ?? 0}
                    onToggleExpand={() => toggleExpand(item.booking.id)}
                    onPress={() => navigation.navigate('BookingDetail', { bookingId: item.booking.id, booking: item.booking })}
                    onViewMessages={() => openConversation(item.booking)}
                    dark={dark}
                    P={P}
                  />
                );
              }}
            />
          )}
        </Animated.View>
      </SafeAreaView>

      {/* ── FAB ──────────────────────────────────────────────────── */}
      <TouchableOpacity
        activeOpacity={0.85}
        style={[s.fab, { backgroundColor: P.accent }]}
        onPress={openSheet}
      >
        <Ionicons name="add" size={26} color={P.ice} />
      </TouchableOpacity>

      {/* ── Add-action sheet ─────────────────────────────────────── */}
      <Modal
        visible={showAddSheet}
        transparent
        animationType="none"
        onRequestClose={closeSheet}
      >
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.28)', opacity: backdropOp }]}
          />
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeSheet} />
          <Animated.View
            style={[s.sheet, { backgroundColor: P.card, borderColor: P.border, transform: [{ translateY: sheetY }] }]}
            {...sheetPan.panHandlers}
          >
          <View style={s.sheetHandleRow}>
            <View style={[s.sheetHandle, { backgroundColor: P.border }]} />
          </View>

          <Text style={[s.sheetTitle, { color: P.sub }]}>Quick Access</Text>

          {([
            { icon: 'calendar-outline',       title: 'Schedule',   sub: 'Set your hours & block dates',      route: 'ProviderSchedule' },
            { icon: 'pricetag-outline',        title: 'Promotions', sub: 'Create & manage offers',            route: 'Promotions'       },
            { icon: 'people-outline',          title: 'Clientele',  sub: 'View & manage your client list',    route: 'Clientele'        },
            { icon: 'document-text-outline',   title: 'Info Pack',  sub: 'Share service details with clients',route: 'InfoPacks'        },
            { icon: 'clipboard-outline',       title: 'Intake Forms', sub: 'Create & manage your forms',      route: 'ProviderIntakeForm' },
            { icon: 'chatbubble-outline',      title: 'Inbox',      sub: 'Messages with your clients',        route: 'ProviderInbox'    },
          ] as const).map((item, idx, arr) => (
            <React.Fragment key={item.route}>
              <TouchableOpacity
                style={s.sheetRow}
                activeOpacity={0.72}
                onPress={() => { closeSheet(); navigation.navigate(item.route as any); }}
              >
                <View style={[s.sheetIconWrap, { backgroundColor: P.accent }]}>
                  <Ionicons name={item.icon} size={21} color={P.ice} />
                </View>
                <View style={s.sheetRowText}>
                  <Text style={[s.sheetRowTitle, { color: P.text }]}>{item.title}</Text>
                  <Text style={[s.sheetRowSub, { color: P.sub }]}>{item.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color={P.sub} />
              </TouchableOpacity>
              {idx < arr.length - 1 && <View style={[s.sheetSep, { backgroundColor: P.sep }]} />}
            </React.Fragment>
          ))}

          <View style={{ height: 28 }} />
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CELL_SIZE = Math.floor((SW - 48) / 7);
const CIRCLE_SZ = Math.min(CELL_SIZE - 6, 32);

const s = StyleSheet.create({
  root:    { flex: 1 },
  safe:    { flex: 1 },

  // Header
  header:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 8 },
  headerTitle:     { flex: 1, flexDirection: 'row', alignItems: 'center' },
  headerTitleText: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  headerRight:     { flexDirection: 'row', gap: 8, alignItems: 'center' },
  todayChip:       { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  todayChipTxt:    { fontSize: 13, fontWeight: '600' },
  iconBtn:         { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },

  // Month calendar
  monthView:     { marginHorizontal: 12, marginBottom: 8, borderRadius: 18, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  monthNav:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  monthArrow:    { padding: 6 },
  monthNavLabel: { fontSize: 17, fontWeight: '600' },
  dayHeaderRow:  { flexDirection: 'row', marginBottom: 8 },
  dayHeaderCell: { width: CELL_SIZE, alignItems: 'center' },
  dayHeaderTxt:  { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  calGrid:       { flexDirection: 'row', flexWrap: 'wrap' },
  calCell:       { width: CELL_SIZE, height: CELL_SIZE, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  calCircle:     { width: CIRCLE_SZ, height: CIRCLE_SZ, borderRadius: CIRCLE_SZ / 2, alignItems: 'center', justifyContent: 'center' },
  calCircleSel:  {},
  calCircleToday:{},
  calNum:        { fontSize: 14, fontWeight: '500' },
  calDot:        { width: 4, height: 4, borderRadius: 2, marginTop: 2 },

  // Date strip
  stripWrap:       { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  stripContent:    { paddingHorizontal: 12 },
  dateTile:        { alignItems: 'center', paddingVertical: 4 },
  tileDayLetter:   { fontSize: 11, fontWeight: '600', marginBottom: 6, letterSpacing: 0.2 },
  dateCircle:      { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dateCircleSel:   {},
  dateCircleToday: {},
  tileNum:         { fontSize: 17, letterSpacing: -0.3, lineHeight: 22 },
  dot:             { width: 5, height: 5, borderRadius: 2.5, marginTop: 4 },

  // List
  listWrap:    { flex: 1 },

  // Empty day
  emptyDay:    { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 16 },
  emptyTitle:  { fontSize: 17, fontWeight: '600', marginBottom: 6 },
  emptySub:    { fontSize: 14 },

  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    bottom: Platform.OS === 'ios' ? 108 : 86,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#AF9197',
    shadowOpacity: 0.40,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },

  // Add-action sheet
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: Platform.OS === 'ios' ? 28 : 16,
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  sheetHandleRow: { alignItems: 'center', paddingTop: 10, paddingBottom: 14 },
  sheetHandle:    { width: 36, height: 4, borderRadius: 2 },
  sheetTitle:     { fontSize: 13, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 14 },
  sheetRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 14 },
  sheetIconWrap:  { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sheetRowText:   { flex: 1 },
  sheetRowTitle:  { fontSize: 16, fontWeight: '600' },
  sheetRowSub:    { fontSize: 13, marginTop: 2 },
  sheetSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(183,225,218,0.10)',
    marginLeft: 56,
  },
});
