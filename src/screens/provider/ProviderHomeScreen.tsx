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
  useWindowDimensions,
  Easing,
  PanResponder,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useTheme } from '../../contexts/ThemeContext';
import type { AppTheme } from '../../constants/theme';
import {
  ConfirmedBooking,
} from '../../contexts/BookingContext';
import { useAuth } from '../../contexts/AuthContext';
import { ProviderHomeScreenProps } from '../../navigation/types';
import { storage } from '../../utils/storage';
import { TOUR_SEEN_PREFIXES, tourSeenKey } from '../../utils/storageKeys';
import { CoachMarkTour, CoachMarkStep } from '../../components/CoachMarkTour';
import { FLOATING_TAB_BAR_CLEARANCE, tabBarSpotlightRect } from '../../components/IslandPillTabBar';
import { tabBarOccupiedHeight } from '../../utils/tabBarGeometry';
import {
  getProviderBookings,
  getMyProviderProfile,
  hasMyProviderGoLiveAddress,
  getProviderAvailability,
  getProviderAvailabilityWindows,
  getProviderAvailabilityOverrides,
  getServiceDurationsByIds,
  getProviderBlockedDates,
  subscribeToProviderBookingChanges,
  getUnreadNotificationCount,
  countProviderServices,
  getOrCreateConversation,
} from '../../services/databaseService';
import { mapDbBookingToConfirmed } from '../../services/bookingService';
import { findScheduleIssues, primaryIssue, type ScheduleIssue } from '../../utils/scheduleIssues';
import { resolveTimelineRange } from '../../utils/dayTimelineRange';
import { resolveWorkingWindows, type WorkingWindow } from '../../services/AvailabilityService';
import { logger } from '../../utils/logger';
import type {
  DbProviderAvailability,
  DbProviderBlockedDate,
  DbProviderAvailabilityWindow,
  DbProviderAvailabilityOverride,
} from '../../types/database';
import { formatTime12, formatSectionTitle, dateToYMD, ordinalSuffix, formatDurationMinutes, overridesFromDate } from '../../utils/dateUtils';
import { OFFERS_ENABLED } from '../../constants/featureFlags';
import { formatBookingRef } from '../../features/bookings/presentation';
import {
  buildGoLiveSteps,
  type GoLiveStatus,
  type GoLiveStepKey,
} from '../../features/providers/goLiveStatus';

type Props = ProviderHomeScreenProps<'ProviderHomeMain'>;


const CP = { card: '#252220', border: 'rgba(126,102,103,0.18)' }; // static StyleSheet fallback

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

function statusCfg(s: string) {
  return STATUS_CFG[s] ?? STATUS_CFG['completed']!;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

const MONTH_NAMES  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_FULL     = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function formatDateString(date: Date): string {
  return dateToYMD(date);
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
  return formatSectionTitle(dateStr);
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
  const cells: ({ date: Date; dateString: string } | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    cells.push({ date, dateString: formatDateString(date) });
  }
  return cells;
}

function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  const date = d.getDate();
  const dayName = DAY_FULL[d.getDay()];
  const month = MONTH_NAMES[d.getMonth()];
  const time = formatTime12(d);
  return `${dayName} ${ordinalSuffix(date)} ${month} ${d.getFullYear()}, ${time}`;
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

interface BookingCardProps {
  booking: ConfirmedBooking;
  /** Schedule problems found for this booking — empty when there are none. */
  issues: readonly ScheduleIssue[];
  expansionState: ExpansionState;
  onToggleExpand: () => void;
  onPress: () => void;
  onViewMessages: () => void;
  dark: boolean;
  P: AppTheme;
}

function BookingCard({ booking, issues, expansionState, onToggleExpand, onPress, onViewMessages, dark, P }: BookingCardProps) {
  const cfg   = statusCfg(booking.status);
  const past  = isPastBooking(booking.bookingDate, booking.bookingTime);
  const eta   = countdownLabel(booking.bookingDate, booking.bookingTime);
  const addOns = booking.addOns?.reduce((s, a) => s + a.price, 0) ?? 0;
  const total  = booking.price + addOns;
  const ref    = formatBookingRef(booking);
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
      style={[
        bc.wrap,
        { backgroundColor: P.card, borderColor: P.border, shadowColor: dark ? 'transparent' : '#000' },
        // A clash is a state of the appointment, not a status of it — so it
        // reads as a warning-toned border and banner rather than replacing
        // the status pill, which still has to say pending/upcoming/etc.
        issues.length > 0 && { borderColor: ISSUE_COLOR, borderWidth: 1.5 },
      ]}
    >
      {issues.length > 0 && (
        <View style={bc.issueBanner}>
          <Ionicons name="warning" size={13} color={ISSUE_COLOR} />
          <Text style={[bc.issueText, { color: ISSUE_COLOR }]}>
            {/* Every problem is listed, not just the worst one: a booking
                that's both double-booked AND on a blocked date needs both
                facts to be actionable. Ordered worst-first by primaryIssue's
                severity ranking. */}
            {orderedIssueLabels(issues).join(' · ')}
          </Text>
        </View>
      )}

      {/* Row 1 — pill + time + expand */}
      <View style={bc.topRow}>
        <View style={[bc.pill, { backgroundColor: pillBg }]}>
          <Text style={[bc.pillText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
        <View style={bc.topRight}>
          {!!booking.bookingTime && (
            <Text style={[bc.time, { color: P.text }]}>
              {booking.bookingTime}
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
            <Text style={[bc.etaTxt, { color: P.accent }]}>{eta}</Text>
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
          {/* The client's note, not `bookingInstructions` — that field is this
              provider's OWN instructions copy (PoliciesScreen), so it read as
              the app quoting them back to themselves. Same swap as
              ProviderBookingDetailScreen's NOTES section. */}
          {!!booking.notes && (
            <Text style={[bc.instructions, { color: P.sub }]}>“{booking.notes}”</Text>
          )}
          <SummaryRow label="Booking Ref/ID" value={ref} P={P} />
          <TouchableOpacity style={[bc.msgBtn, { backgroundColor: P.accent }]} activeOpacity={0.75} onPress={onViewMessages}>
            <Text style={[bc.msgBtnTxt, { color: '#fff' }]}>View Messages</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

function SummaryRow({ label, value, italic, P }: { label: string; value: string; italic?: boolean; P: AppTheme }) {
  return (
    <View style={bc.payRow}>
      <Text style={[bc.summaryLabel, { color: P.sub }]}>{label} – </Text>
      <Text style={[bc.summaryVal, { color: P.text, fontStyle: italic ? 'italic' : 'normal', flex: 1 }]}>{value}</Text>
    </View>
  );
}

// Same warning amber the go-live checklist uses for "this needs attention" —
// a schedule problem is a warning, not an error state like a cancellation.
/** Where each shared go-live step is fixed, from the Home stack. All four are
 *  registered on this navigator so the tap pushes rather than bouncing to
 *  another tab's root. */
const GO_LIVE_STEP_SCREENS: Record<GoLiveStepKey, string> = {
  schedule: 'ProviderSchedule',
  services: 'EditProfile',
  address: 'EditProfile',
  logo: 'Branding',
};

const ISSUE_COLOR = '#FF9500';

/** Stable empty array, so a booking with no problems doesn't get a fresh
 *  prop identity on every render of the list. */
const EMPTY_ISSUES: readonly ScheduleIssue[] = [];

/** Worst-first, using the same ranking primaryIssue applies. */
function orderedIssueLabels(issues: readonly ScheduleIssue[]): string[] {
  const remaining = [...issues];
  const ordered: string[] = [];
  while (remaining.length > 0) {
    const next = primaryIssue(remaining);
    if (!next) break;
    ordered.push(next.label);
    remaining.splice(remaining.indexOf(next), 1);
  }
  return ordered;
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

  issueBanner: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  issueText:   { flex: 1, fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },

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

// The timeline's hour range is resolved per day (see resolveTimelineRange) —
// it was fixed at 7am–9pm, which silently cut the top off any provider who
// starts earlier: a 3am booking was clamped to the top of the grid and drawn
// against the 7am line, so it looked like a 7am appointment.
const HOUR_H        = 64; // px per hour
const TIME_COL_W    = 48;
// Headroom above the first hour line, so its label isn't clipped by the top of
// the scroll view (and doesn't read as tucked under the date strip above it).
const TL_TOP_INSET  = 14;

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
  /** Schedule problems per booking id, from the same findScheduleIssues pass
   *  the list view uses — the timeline used to re-derive "outside working
   *  hours" itself, which meant two separate definitions of the same idea. */
  scheduleIssues: ReadonlyMap<string, ScheduleIssue[]>;
  onPress: (booking: ConfirmedBooking) => void;
  dark: boolean;
  P: AppTheme;
  refreshing: boolean;
  onRefresh: () => void;
  availability: DbProviderAvailability | null;
  isBlocked: boolean;
}

function DayTimeline({ bookings, scheduleIssues, onPress, dark, P, refreshing, onRefresh, availability, isBlocked }: DayTimelineProps) {
  // Measured per render, not captured at module load: booking blocks are laid
  // out as a fraction of the width left beside the time column.
  const { width: screenWidth } = useWindowDimensions();
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const { startHour: TL_START_HOUR, endHour: TL_END_HOUR } = useMemo(
    () => resolveTimelineRange(
      availability && !availability.is_closed
        ? {
            openMins:  parseTimeToMinutes(availability.open_time),
            closeMins: parseTimeToMinutes(availability.close_time),
          }
        : null,
      bookings.map(b => ({
        startMins:    parseTimeToMinutes(b.bookingTime),
        durationMins: parseDurationToMinutes(b.duration),
      })),
    ),
    [availability, bookings],
  );
  const TL_HOURS   = TL_END_HOUR - TL_START_HOUR;
  const TIMELINE_H = TL_HOURS * HOUR_H;

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

  const bookingAreaW = screenWidth - TIME_COL_W - 32;

  // The first hour label is drawn at `top: -8` so it sits centred on its own
  // line. With no inset that puts it above the scroll content, where it
  // collided with the date strip directly above — the top of the timeline read
  // as hidden behind the dates.
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ height: TIMELINE_H + 80 + TL_TOP_INSET, paddingTop: TL_TOP_INSET, paddingBottom: FLOATING_TAB_BAR_CLEARANCE + 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P.accent} />}
    >
      <View style={{ flex: 1, flexDirection: 'row', marginHorizontal: 16 }}>
        {/* Time labels column */}
        <View style={{ width: TIME_COL_W }}>
          {Array.from({ length: TL_HOURS + 1 }, (_, i) => {
            const h = TL_START_HOUR + i;
            // h can be 24 when the range runs to the end of the day — that
            // last line is midnight, not noon.
            const hh = h % 24;
            const label = hh === 0 ? '12am' : hh < 12 ? `${hh}am` : hh === 12 ? '12pm' : `${hh - 12}pm`;
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
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: P.accent, marginLeft: -4 }} />
              <View style={{ flex: 1, height: 1.5, backgroundColor: P.accent }} />
            </View>
          )}

          {/* Booking blocks */}
          {positioned.map(({ booking, top, height, col, cols, colorIdx }) => {
            const cfg   = statusCfg(booking.status);
            const color = BLOCK_COLORS[colorIdx]!;
            const blockW = bookingAreaW / cols - 4;
            const left   = col * (bookingAreaW / cols) + 2;
            const past   = isPastBooking(booking.bookingDate, booking.bookingTime);
            const issues   = scheduleIssues.get(booking.id) ?? EMPTY_ISSUES;
            const topIssue = primaryIssue(issues);

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
                  // A problem rings the whole block. It has to be the whole
                  // ring, not just a badge: two double-booked appointments
                  // already sit side by side in columns, which on its own
                  // looks identical to two ordinary back-to-back blocks.
                  ...(topIssue
                    ? { borderWidth: 1.5, borderColor: ISSUE_COLOR, borderLeftWidth: 3, borderLeftColor: ISSUE_COLOR }
                    : {}),
                  paddingHorizontal: 8,
                  paddingVertical: 5,
                  overflow: 'hidden',
                  opacity: past ? 0.50 : 1,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: color.dark }} numberOfLines={1}>
                  {booking.bookingTime}
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
                {topIssue && (
                  <View
                    style={{ position: 'absolute', bottom: 4, right: 6, width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFB340', alignItems: 'center', justifyContent: 'center' }}
                    accessible
                    accessibilityLabel={issues.map(i => i.label).join('. ')}
                  >
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

function SectionBanner({ dateStr, P }: { dateStr: string; P: AppTheme }) {
  const { isDarkMode: dark } = useTheme();
  const banner = dark ? '#3A2E2F' : '#5C4033';
  const bannerText = dark ? '#F0ECE7' : '#FFFFFF';
  const todayLabel = dark ? 'rgba(240,236,231,0.50)' : 'rgba(0,0,0,0.45)';
  const kind = sectionLabel(dateStr);
  if (kind === 'today') {
    return (
      <View style={sh.todayWrap}>
        <Text style={[sh.todayText, { color: todayLabel }]}>Today</Text>
      </View>
    );
  }
  const title    = sectionTitle(dateStr);
  const subtitle = kind === 'tomorrow' ? 'Tomorrow' : kind === 'yesterday' ? 'Yesterday' : undefined;
  return (
    <View style={[sh.banner, { backgroundColor: banner }]}>
      <Text style={[sh.bannerTitle, { color: bannerText }]}>{title}</Text>
      {!!subtitle && <Text style={[sh.bannerSub, { color: bannerText }]}>{subtitle}</Text>}
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


// ─── Row types for main list ──────────────────────────────────────────────────

type ListRow =
  | { t: 'section'; dateStr: string }
  | { t: 'booking'; booking: ConfirmedBooking }
  | { t: 'empty';   dateStr: string };

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProviderHomeScreen({ navigation, route }: Props) {
  const { isDarkMode: dark, palette: P } = useTheme();
  // Measured per render, not captured at module load: the add-sheet's
  // offscreen resting position is a full screen height, and the month grid
  // divides the width into seven cells.
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cellSize = Math.floor((screenWidth - 48) / 7);
  const circleSize = Math.min(cellSize - 6, 32);

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
  // Provider-role unread badge for the header bell. Counts only recipient_role
  // = 'provider' rows, so it never reflects the same user's client-side unread.
  const [unreadCount, setUnreadCount] = useState(0);
  const [refreshing,setRefreshing]  = useState(false);

  // Provider availability
  const [availability,  setAvailability]  = useState<DbProviderAvailability[]>([]);
  const [blockedDates,  setBlockedDates]  = useState<DbProviderBlockedDate[]>([]);
  // The newer multi-window weekly schedule and its per-date overrides. Loaded
  // alongside the legacy availability rows purely so schedule problems are
  // judged against the schedule the provider actually keeps — a provider on
  // split shifts has a real midday break that the legacy open/close row
  // (09:00-18:00) knows nothing about.
  const [availabilityWindows, setAvailabilityWindows] = useState<DbProviderAvailabilityWindow[]>([]);
  const [availabilityOverrides, setAvailabilityOverrides] = useState<DbProviderAvailabilityOverride[]>([]);
  const [serviceDurations, setServiceDurations] = useState<ReadonlyMap<string, number>>(new Map());

  // Go-live setup checklist. The three `*Set` flags mirror, one for one, the
  // conditions check_and_set_provider_live() enforces server-side before it
  // will flip has_gone_live — an open schedule, at least one service, and a
  // private address WITH geocoded coordinates. Anything the server doesn't
  // gate on must not be counted towards "done" here (see brandingSet), or
  // the card contradicts the database in one direction or the other.
  // Shape and step labels come from features/providers/goLiveStatus so this
  // card and the provider's own dashboard card state the same requirements in
  // the same words. Only the fetch is local — this screen already reads the
  // availability and service count for the day list, so refetching them
  // through fetchGoLiveStatus() would double those queries on every focus.
  const [setupStatus, setSetupStatus] = useState<GoLiveStatus | null>(null);
  const [setupDismissed, setSetupDismissed] = useState(false);

  // Fires the go-live celebration exactly once, on a genuine false->true
  // transition of has_gone_live — not on every app open, and not
  // retroactively for a provider who was already live before this shipped.
  // Tracked in persistent storage (not just a ref) so it survives app
  // restarts between the transition happening and the provider reopening.
  const [showGoLiveCelebration, setShowGoLiveCelebration] = useState(false);
  const celebrationScale = useRef(new Animated.Value(0.6)).current;
  const celebrationOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!showGoLiveCelebration) return;
    celebrationScale.setValue(0.6);
    celebrationOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(celebrationScale, { toValue: 1, tension: 120, friction: 8, useNativeDriver: true }),
      Animated.timing(celebrationOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [showGoLiveCelebration, celebrationScale, celebrationOpacity]);

  // First-run coach-mark tour for brand-new providers.
  const { user } = useAuth();
  const [showTour, setShowTour] = useState(false);
  // Home stays mounted as a tab; CoachMarkTour is a full-screen Modal. Gate it
  // on focus so an armed tour never spotlights over a screen pushed on top
  // while its start timer was pending — it just waits for the return to Home.
  const isFocused = useIsFocused();
  const tourCheckedRef = useRef(false);
  const viewModeBtnRef = useRef<View>(null);
  const fabRef = useRef<View>(null);
  const bellRef = useRef<View>(null);

  // Deliberately NOT gated on setupStatus any more. It used to be, because
  // the tour's second step spotlighted the go-live checklist card and that
  // card can't be measured until its fetch resolves. Every remaining target
  // (tab bar, view-mode toggle, FAB, bell) is header chrome that renders
  // immediately — so waiting on setupStatus would only mean a provider whose
  // setup fetch fails never sees the tour at all.
  useEffect(() => {
    if (tourCheckedRef.current || !user?.id) return;
    tourCheckedRef.current = true;
    const seenKey = tourSeenKey(TOUR_SEEN_PREFIXES.PROVIDER_HOME, user.id);
    storage.getItem<boolean>(seenKey).then(seen => {
      if (seen) return;
      // Give the header controls and FAB time to finish their entrance
      // layout before the tour measures where they actually landed.
      setTimeout(() => setShowTour(true), 500);
    }).catch((err) => logger.error('[ProviderHome] tour-seen flag read failed:', err));
  }, [user?.id]);

  const finishTour = useCallback(() => {
    setShowTour(false);
    if (user?.id) storage.setItem(tourSeenKey(TOUR_SEEN_PREFIXES.PROVIDER_HOME, user.id), true).catch((err) => logger.error('[ProviderHome] tour-seen flag write failed:', err));
  }, [user?.id]);

  const tourSteps = useMemo<CoachMarkStep[]>(() => {
    // Asked of the tab bar itself rather than re-declared here — the bar lives
    // outside this screen's tree so there's no ref to measure, and its shape
    // differs by platform.
    const tabRect = tabBarSpotlightRect(screenWidth, screenHeight, insets.bottom);

    return [
      {
        key: 'tabs',
        title: 'Your home base',
        body: 'Swipe or tap to move between Home, My Services, Profile, and Becca — your AI assistant.',
        target: { rect: tabRect },
        radius: Platform.OS === 'android' ? 0 : tabRect.height / 2,
        icon: 'apps',
      },
      {
        key: 'view-mode',
        title: 'Two ways to see your day',
        body: 'Switch between the hour-by-hour timeline and a plain list of what\'s booked.',
        target: { ref: viewModeBtnRef },
        radius: 17,
        icon: 'list',
      },
      {
        key: 'fab',
        title: 'Quick access',
        body: 'Tap the + button anytime for your schedule, promotions, clientele, forms, and inbox.',
        target: { ref: fabRef },
        radius: 26,
        icon: 'add-circle',
      },
      {
        key: 'bell',
        title: "You'll be notified here",
        body: 'New bookings, messages, and reminders show up in your notifications.',
        target: { ref: bellRef },
        radius: 17,
        icon: 'notifications',
      },
    ];
  }, [screenWidth, screenHeight, insets.bottom]);

  // Add-action sheet
  const [showAddSheet, setShowAddSheet] = useState(false);
  // Use the viewport height, rather than the sheet's approximate height, so
  // dismissal always carries the entire sheet off-screen before unmounting.
  const sheetY     = useRef(new Animated.Value(screenHeight)).current;
  const backdropOp = useRef(new Animated.Value(0)).current;

  const openSheet = useCallback(() => {
    sheetY.setValue(screenHeight);
    backdropOp.setValue(0);
    setShowAddSheet(true);
    Animated.parallel([
      Animated.spring(sheetY,     { toValue: 0,   useNativeDriver: true, damping: 26, stiffness: 320, mass: 0.9 }),
      Animated.timing(backdropOp, { toValue: 1,   duration: 180,         useNativeDriver: true }),
    ]).start();
  }, [sheetY, backdropOp]);

  const closeSheet = useCallback(() => {
    Animated.parallel([
      Animated.timing(sheetY,     { toValue: screenHeight, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(backdropOp, { toValue: 0,        duration: 380, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start(() => { setShowAddSheet(false); });
  }, [sheetY, backdropOp, screenHeight]);

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
      backdropOp.setValue(Math.max(0, 1 - dy / screenHeight));
    },
    onPanResponderRelease: (_, g) => {
      const dy = g.dy - panStartDy.current;
      if (dy > 80 || g.vy > 0.4) {
        const remainingDistance = Math.max(0, screenHeight - Math.max(0, dy));
        const exitDuration = Math.max(280, Math.min(480, (remainingDistance / screenHeight) * 480));
        Animated.parallel([
          Animated.timing(sheetY,     { toValue: screenHeight, duration: exitDuration, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(backdropOp, { toValue: 0, duration: exitDuration, easing: Easing.out(Easing.quad), useNativeDriver: true }),
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
  const hasLoadedBookingsRef = useRef(false);
  const realtimeReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  }, [listOpacity, listSlide, selectedDate]);

  // Auto-scroll strip to today on mount
  useEffect(() => {
    const t = setTimeout(() => {
      stripRef.current?.scrollToIndex({ index: TODAY_IDX, animated: false, viewPosition: 0.4 });
    }, 150);
    return () => clearTimeout(t);
  }, []);

  // A booking just added outside "today" (e.g. a custom-time squeeze-in) jumps
  // the calendar straight to that day, so the provider sees it land instead of
  // it silently appearing on whatever day they already had selected. Cleared
  // immediately after so re-focusing this screen later doesn't keep re-jumping.
  useEffect(() => {
    const jumpToDate = route.params?.jumpToDate;
    if (!jumpToDate) return;
    setSelectedDate(jumpToDate);
    const idx = STRIP_DATES.indexOf(jumpToDate);
    if (idx >= 0) {
      const t = setTimeout(() => {
        stripRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.4 });
      }, 150);
      navigation.setParams({ jumpToDate: undefined });
      return () => clearTimeout(t);
    }
    navigation.setParams({ jumpToDate: undefined });
    return undefined;
  }, [route.params?.jumpToDate, navigation]);

  // Fetch bookings. `providerId`, when the caller already has it (the
  // combined focus effect below fetches the profile once for both this and
  // the availability bundle), skips getProviderBookings' own internal
  // profile lookup rather than repeating it.
  const loadBookings = useCallback(async (showLoad = false, providerId?: string) => {
    if (showLoad) setLoading(true);
    try {
      const rows = await getProviderBookings(90, providerId);
      setBookings(rows.map(mapDbBookingToConfirmed));
    } catch (err) {
      logger.error('[ProviderHome] bookings load failed:', err);
    }
    setLoading(false);
  }, []);

  // Recover the real length of any booking whose row has no end_time — an
  // empty `duration` is exactly that, since mapDbBookingToConfirmed computes
  // it from end minus start. One batched query for the distinct services
  // involved, and none at all in the normal case where every booking has an
  // end time. Without this such a booking looks zero-length and can never be
  // found to clash with anything.
  useEffect(() => {
    let cancelled = false;
    const ids = Array.from(new Set(
      bookings.filter(b => !b.duration && b.serviceId).map(b => b.serviceId!),
    ));
    if (ids.length === 0) {
      setServiceDurations(prev => (prev.size === 0 ? prev : new Map()));
      return () => { cancelled = true; };
    }
    getServiceDurationsByIds(ids)
      .then(map => { if (!cancelled) setServiceDurations(map); })
      .catch(err => logger.error('[ProviderHome] service duration lookup failed:', err));
    return () => { cancelled = true; };
  }, [bookings]);
  // Keep the header bell's unread badge in sync (provider-role notifications only)
  useFocusEffect(useCallback(() => {
    getUnreadNotificationCount('provider').then(setUnreadCount).catch((err) => logger.error('[ProviderHome] unread count load failed:', err));
  }, []));

  // Bookings + availability/blocked-dates, reloaded together on every focus
  // (e.g. after editing in ProviderScheduleScreen) from ONE profile fetch —
  // these used to each call getMyProviderProfile() independently, a
  // duplicate round trip on every visit to the screen providers live in.
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    getMyProviderProfile().then(profile => {
      if (cancelled) return;
      // Flipped only once we're actually about to load, not before the
      // profile fetch even resolves — otherwise a profile fetch that comes
      // back null/fails on the first focus would permanently mark the
      // initial load as "done" without it ever having run, silently losing
      // the loading spinner on every retry after.
      const showInitialLoad = !hasLoadedBookingsRef.current;
      hasLoadedBookingsRef.current = true;
      // Bookings still load even if the profile fetch failed — falls back to
      // getProviderBookings' own internal profile lookup rather than staying
      // decoupled from availability the way it was pre-merge, but not
      // silently skipping bookings entirely just because availability can't
      // load this focus.
      void loadBookings(showInitialLoad, profile?.id);
      if (!profile) return;
      return Promise.all([
        getProviderAvailability(profile.id),
        getProviderBlockedDates(profile.id),
        countProviderServices(profile.id),
        getProviderAvailabilityWindows(profile.id),
        // Overrides only from a fortnight back — far enough to cover every
        // booking the day list can show, without pulling a provider's whole
        // history of one-off closures on each focus.
        getProviderAvailabilityOverrides(profile.id, overridesFromDate()),
        // full_address is no longer on `providers` — it lives in the owner-only
        // provider_private_details table (restrict_provider_full_address.sql).
        // Checked via the go-live helper rather than a bare address read: the
        // server also requires latitude/longitude, so an address saved without
        // coordinates is not a completed step no matter how it reads on screen.
        hasMyProviderGoLiveAddress().catch(() => false),
      ]).then(([avail, blocked, serviceCount, windows, overrides, goLiveAddress]) => {
        if (cancelled) return;
        setAvailability(avail);
        setBlockedDates(blocked);
        setAvailabilityWindows(windows);
        setAvailabilityOverrides(overrides);
        setSetupStatus({
          scheduleSet: avail.some(a => !a.is_closed),
          servicesSet: serviceCount > 0,
          // No business-type exemption. Mobile used to be excluded here, but
          // mobile providers can now pick an address-release timing like any
          // other type, and a release with no real address on file releases
          // nothing. require_provider_address.sql gates go-live on the same
          // thing server-side for every type, so exempting mobile here just
          // meant the checklist said "done" where the DB said "not yet".
          // The vague public location_text doesn't count — it's already
          // required just to save a profile, so accepting it made this
          // trivially true for almost everyone.
          addressSet: goLiveAddress,
          brandingSet: !!profile.logo_url,
          isLive: !!profile.has_gone_live,
        });

        // Go-live celebration: only on a genuine false->true transition,
        // persisted so it survives app restarts, and never fired the first
        // time we ever check an account (that would be a false celebration
        // for anyone already live before this shipped, or a fresh install).
        const celebrationKey = `@provider_go_live_celebrated_${profile.user_id}`;
        storage.getItem<boolean>(celebrationKey).then(alreadyCelebrated => {
          if (cancelled) return;
          if (profile.has_gone_live && alreadyCelebrated == null) {
            // First time we've ever checked this account and it's already
            // live — seed as celebrated, don't fire retroactively.
            storage.setItem(celebrationKey, true).catch((err) => logger.error('[ProviderHome] go-live seed write failed:', err));
          } else if (profile.has_gone_live && alreadyCelebrated === false) {
            setShowGoLiveCelebration(true);
            storage.setItem(celebrationKey, true).catch((err) => logger.error('[ProviderHome] go-live celebrated write failed:', err));
          } else if (!profile.has_gone_live && alreadyCelebrated == null) {
            // Not live yet — record false so a later flip is detected as a
            // real transition rather than looking like a fresh-seed case.
            storage.setItem(celebrationKey, false).catch((err) => logger.error('[ProviderHome] go-live pending write failed:', err));
          }
        }).catch((err) => logger.error('[ProviderHome] go-live celebration flag read failed:', err));
      });
    }).catch((err) => {
      logger.error('[ProviderHome] provider profile load failed:', err);
      if (cancelled) return;
      // Profile fetch itself rejected (not just resolved null) — still
      // attempt bookings via its own internal fallback rather than leaving
      // this focus with neither bookings nor availability loaded.
      const showInitialLoad = !hasLoadedBookingsRef.current;
      hasLoadedBookingsRef.current = true;
      void loadBookings(showInitialLoad);
    });
    return () => { cancelled = true; };
  }, [loadBookings]));

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    getMyProviderProfile().then(profile => {
      if (!profile || cancelled) return;
      unsubscribe = subscribeToProviderBookingChanges(profile.id, () => {
        if (realtimeReloadTimerRef.current) {
          clearTimeout(realtimeReloadTimerRef.current);
        }
        realtimeReloadTimerRef.current = setTimeout(() => {
          realtimeReloadTimerRef.current = null;
          void loadBookings();
        }, 150);
      });
    }).catch((err) => logger.error('[ProviderHome] realtime subscribe failed:', err));
    return () => {
      cancelled = true;
      unsubscribe?.();
      if (realtimeReloadTimerRef.current) {
        clearTimeout(realtimeReloadTimerRef.current);
        realtimeReloadTimerRef.current = null;
      }
    };
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

  // Everything wrong with a booking that only shows up by comparing it to
  // something else — a double-booking, a slot the schedule no longer offers,
  // a date the provider blocked off, a request that went unanswered past its
  // own start, work that finished but was never closed out. Computed across
  // every loaded booking (not just the visible day) so a problem is marked
  // wherever in the list it appears, and shared by both the list and the
  // timeline so the two can never disagree.
  const blockedDateStrings = useMemo(
    () => blockedDates.map(b => b.blocked_date),
    [blockedDates],
  );

  // Real bookable periods per date, resolved through AvailabilityService's own
  // precedence (date override > recurring weekly windows > legacy open/close)
  // rather than re-deriving hours here. Only dates that actually have a
  // booking are resolved — every other date is left out of the map entirely,
  // which findScheduleIssues reads as "not checked" rather than "closed".
  const windowsByDate = useMemo(() => {
    const map = new Map<string, WorkingWindow[]>();
    const overridesByDate = new Map<string, DbProviderAvailabilityOverride[]>();
    for (const o of availabilityOverrides) {
      const list = overridesByDate.get(o.availability_date);
      if (list) list.push(o);
      else overridesByDate.set(o.availability_date, [o]);
    }
    const recurringByDow = new Map<number, WorkingWindow[]>();
    for (const w of availabilityWindows) {
      const list = recurringByDow.get(w.day_of_week);
      const entry = { start_time: w.start_time, end_time: w.end_time };
      if (list) list.push(entry);
      else recurringByDow.set(w.day_of_week, [entry]);
    }
    const legacyByDow = new Map<number, DbProviderAvailability>();
    for (const a of availability) legacyByDow.set(a.day_of_week, a);

    for (const booking of bookings) {
      if (map.has(booking.bookingDate)) continue;
      const [y, mo, d] = booking.bookingDate.split('-').map(Number);
      if (!y || !mo || !d) continue;
      const dow = new Date(y, mo - 1, d).getDay();
      const legacy = legacyByDow.get(dow);
      map.set(booking.bookingDate, resolveWorkingWindows(
        recurringByDow.get(dow) ?? [],
        overridesByDate.get(booking.bookingDate) ?? [],
        legacy ? { open_time: legacy.open_time, close_time: legacy.close_time, is_closed: legacy.is_closed } : null,
      ));
    }
    return map;
  }, [bookings, availability, availabilityWindows, availabilityOverrides]);

  // Real length for any booking whose row never got an end_time written (see
  // insertDirectBooking) — one batched lookup, never a per-row fetch. Also
  // overrides `.duration` itself (not just the extra serviceDurationMinutes
  // field findScheduleIssues reads) so the recovered length shows up in the
  // booking card's own Duration row too — this array, not raw `bookings`, is
  // what listRows below is built from.
  const bookingsWithServiceDuration = useMemo(
    () => bookings.map(b => {
      const serviceDurationMinutes = b.serviceId ? serviceDurations.get(b.serviceId) : undefined;
      return {
        ...b,
        ...(!b.duration && serviceDurationMinutes
          ? { duration: formatDurationMinutes(serviceDurationMinutes) }
          : {}),
        serviceDurationMinutes,
      };
    }),
    [bookings, serviceDurations],
  );

  const scheduleIssues = useMemo(
    () => findScheduleIssues(bookingsWithServiceDuration, {
      windowsByDate,
      blockedDates: blockedDateStrings,
    }),
    [bookingsWithServiceDuration, windowsByDate, blockedDateStrings],
  );

  // Build list rows: show ALL upcoming bookings grouped by day (from selectedDate onwards)
  // Sourced from bookingsWithServiceDuration (not raw `bookings`) so a legacy
  // NULL-end_time row's recovered duration reaches the card, not just the
  // schedule-issue check above.
  const listRows = useMemo((): ListRow[] => {
    const sorted = [...bookingsWithServiceDuration].sort((a, b) => {
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
  }, [bookingsWithServiceDuration, selectedDate]);

  // Opening the list drops the next appointment down already. "What's next"
  // is the provider's first question every time they switch to this view, and
  // making them tap the top card to answer it is a step that buys nothing.
  //
  // Only the FIRST booking row (listRows is already sorted, and starts at
  // selectedDate), only level 1, and never downgrading a card the provider
  // deliberately opened to level 2. The ref resets when they leave list mode,
  // so re-opening re-expands — while a collapse they make WHILE the list is
  // open sticks, because the id is already marked as handled for this open.
  const autoExpandedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (viewMode !== 'list') {
      autoExpandedIdRef.current = null;
      return;
    }
    const firstBookingRow = listRows.find(r => r.t === 'booking');
    if (firstBookingRow?.t !== 'booking') return;
    const id = firstBookingRow.booking.id;
    if (autoExpandedIdRef.current === id) return;
    autoExpandedIdRef.current = id;
    setExpansionStates(prev => ((prev[id] ?? 0) >= 1 ? prev : { ...prev, [id]: 1 }));
  }, [viewMode, listRows]);

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
      const conversationId = await getOrCreateConversation(providerId, clientUserId);
      navigation.navigate('ProviderConversation', { conversationId, clientUserId, clientName });
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
              ref={viewModeBtnRef}
              onPress={() => setViewMode(v => v === 'list' ? 'timeline' : 'list')}
              style={[s.iconBtn, { backgroundColor: viewMode === 'timeline' ? P.accent : P.iconBg }]}
            >
              <Ionicons name={viewMode === 'timeline' ? 'list-outline' : 'time-outline'} size={17} color={viewMode === 'timeline' ? P.ice : P.sub} />
            </TouchableOpacity>
            <TouchableOpacity
              ref={bellRef}
              onPress={() => navigation.navigate('Notifications')}
              style={[s.iconBtn, { backgroundColor: P.iconBg }]}
            >
              <Ionicons name="notifications-outline" size={17} color={P.sub} />
              {unreadCount > 0 && (
                <View style={s.notifBadge}>
                  <Text style={s.notifBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Go-live setup checklist ──────────────────────────── */}
        {/* Visible until the provider is genuinely live. The condition is the
            three server-gated steps AND the database's own has_gone_live —
            not our reconstruction alone, so a provider whose steps all look
            complete but who still isn't published keeps a card on screen
            rather than being left with no explanation. The logo is
            deliberately absent from this test: it's recommended, not gating. */}
        {setupStatus && !setupDismissed &&
         !(setupStatus.scheduleSet && setupStatus.servicesSet && setupStatus.addressSet && setupStatus.isLive) && (
          <View
            style={{
              marginHorizontal: 16, marginBottom: 10, padding: 14, borderRadius: 14,
              backgroundColor: P.surface, borderWidth: 1, borderColor: P.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: P.text }}>
                {setupStatus.scheduleSet && setupStatus.servicesSet && setupStatus.addressSet
                  ? 'Almost live'
                  : 'Finish setting up to go live'}
              </Text>
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
            {/* Every gated step is done but the database still hasn't published
                them. In practice that means the saved address never geocoded,
                since that's the one requirement a provider can satisfy on
                screen without satisfying it in the data. Say so plainly
                instead of showing a checklist with nothing left to tick. */}
            {setupStatus.scheduleSet && setupStatus.servicesSet && setupStatus.addressSet && !setupStatus.isLive && (
              <Text style={{ fontSize: 12, color: '#FF9500', marginTop: 4 }}>
                Everything's filled in, but we couldn't confirm your address on the map yet.
                Re-save it in Business Details and we'll publish you.
              </Text>
            )}
            {/* Labels and done-ness are the shared definition; only where each
                tap goes is local. Push within THIS stack rather than jumping
                to the Profile tab — the cross-tab jump landed these at the
                Profile stack's root, so their back/save button dispatched a
                GO_BACK no navigator could handle; pushing leaves
                ProviderHomeMain underneath to return to. */}
            {buildGoLiveSteps(setupStatus).map(step => (
              <TouchableOpacity
                key={step.key}
                onPress={() => navigation.navigate(GO_LIVE_STEP_SCREENS[step.key] as never)}
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
                <View key={i} style={[s.dayHeaderCell, { width: cellSize }]}>
                  <Text style={[s.dayHeaderTxt, { color: P.sub }]}>{d}</Text>
                </View>
              ))}
            </View>

            {/* Grid */}
            <View style={s.calGrid}>
              {monthCells.map((cell, i) => {
                if (!cell) return <View key={`e${i}`} style={[s.calCell, { width: cellSize, height: cellSize }]} />;
                const count   = countByDate[cell.dateString] ?? 0;
                const isToday = cell.dateString === todayStr;
                const isSel   = cell.dateString === selectedDate;
                return (
                  <TouchableOpacity
                    key={cell.dateString}
                    style={[s.calCell, { width: cellSize, height: cellSize }]}
                    onPress={() => { handleDateTap(cell.dateString); toggleMonth(); }}
                    activeOpacity={0.6}
                  >
                    <View style={[
                      s.calCircle,
                      { width: circleSize, height: circleSize, borderRadius: circleSize / 2 },
                      isSel && [s.calCircleSel, { backgroundColor: P.accent }],
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
                      <View style={[s.calDot, { backgroundColor: isSel ? '#fff' : P.accent }]} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* ── Date strip — hidden when month calendar is open ──── */}
        {!showMonth && <View style={[s.stripWrap, { backgroundColor: P.surface, borderBottomColor: P.border }]}>
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
                  <Text style={[s.tileDayLetter, { color: isToday && !isSel ? P.accent : P.sub }]}>
                    {dayName}
                  </Text>

                  {/* Date circle */}
                  <View style={[
                    s.dateCircle,
                    isSel && [s.dateCircleSel, { backgroundColor: P.accent }],
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
                    <View style={[s.dot, { backgroundColor: isSel ? '#fff' : P.accent }]} />
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
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, paddingBottom: FLOATING_TAB_BAR_CLEARANCE + 24 }}>
              <SectionBanner dateStr={todayStr} P={P} />
              {[1,2,3].map(k => <SkeletonCard key={k} />)}
            </ScrollView>
          ) : viewMode === 'timeline' ? (
            <DayTimeline
              bookings={bookingsWithServiceDuration.filter(b => b.bookingDate === selectedDate)}
              onPress={b => navigation.navigate('BookingDetail', { bookingId: b.id, booking: b })}
              dark={dark}
              P={P}
              refreshing={refreshing}
              onRefresh={onRefresh}
              availability={todayAvailability}
              isBlocked={isSelectedDateBlocked}
              scheduleIssues={scheduleIssues}
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
              contentContainerStyle={{ paddingBottom: FLOATING_TAB_BAR_CLEARANCE + 24, paddingTop: 4 }}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P.accent} />
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
                    issues={scheduleIssues.get(item.booking.id) ?? EMPTY_ISSUES}
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
        ref={fabRef}
        activeOpacity={0.85}
        style={[
          s.fab,
          { backgroundColor: P.accent },
          // Sits above whatever the tab bar actually occupies, measured. The
          // old flat 86 on Android was less than the bar's own height plus a
          // three-button navigation inset, so the FAB sat behind it.
          Platform.OS === 'android' && {
            bottom: tabBarOccupiedHeight(true, insets.bottom) + 16,
          },
        ]}
        onPress={openSheet}
      >
        <Ionicons name="add" size={26} color={P.ice} />
      </TouchableOpacity>

      <CoachMarkTour visible={showTour && isFocused} steps={tourSteps} onFinish={finishTour} />

      {/* ── Go-live celebration ──────────────────────────────────── */}
      <Modal visible={showGoLiveCelebration} transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={() => setShowGoLiveCelebration(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Animated.View
            style={{
              opacity: celebrationOpacity,
              transform: [{ scale: celebrationScale }],
              backgroundColor: P.surface,
              borderRadius: 20,
              padding: 28,
              alignItems: 'center',
              width: '100%',
              maxWidth: 340,
            }}
          >
            <Text style={{ fontSize: 44 }}>🎉</Text>
            <Text style={{ fontSize: 20, fontWeight: '800', color: P.text, marginTop: 12, textAlign: 'center' }}>
              You're live!
            </Text>
            <Text style={{ fontSize: 14, color: P.sub, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
              Clients can now find and book you. Nice work finishing your setup.
            </Text>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setShowGoLiveCelebration(false)}
              style={{ marginTop: 20, backgroundColor: P.accent, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12 }}
            >
              <Text style={{ color: P.ice, fontWeight: '700', fontSize: 15 }}>Let's go</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      {/* ── Add-action sheet ─────────────────────────────────────── */}
      <Modal
        visible={showAddSheet}
        transparent statusBarTranslucent navigationBarTranslucent
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
            { icon: 'add-circle-outline',      title: 'Add Booking', sub: 'Manually book a client in',        route: 'AddBooking'       },
            { icon: 'calendar-outline',        title: 'Schedule',    sub: 'Set your hours & block dates',      route: 'ProviderSchedule' },
            { icon: 'pricetag-outline',        title: 'Promotions',  sub: 'Create & manage offers',            route: 'Promotions'       },
            { icon: 'people-outline',          title: 'Clientele',   sub: 'View & manage your client list',    route: 'Clientele'        },
            { icon: 'document-text-outline',   title: 'Info Pack',   sub: 'Share service details with clients',route: 'InfoPacks'        },
            { icon: 'clipboard-outline',       title: 'Forms',       sub: 'Create & manage your forms',        route: 'ProviderIntakeForm' },
            { icon: 'chatbubble-outline',      title: 'Inbox',       sub: 'Messages with your clients',        route: 'ProviderInbox'    },
          ] as const).filter(item => OFFERS_ENABLED || item.route !== 'Promotions').map((item, idx, arr) => (
            <React.Fragment key={item.title}>
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
  notifBadge:      { position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#FF1744', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  notifBadgeText:  { color: '#fff', fontSize: 9, fontWeight: 'bold' },

  // Month calendar
  monthView:     { marginHorizontal: 12, marginBottom: 8, borderRadius: 18, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  monthNav:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  monthArrow:    { padding: 6 },
  monthNavLabel: { fontSize: 17, fontWeight: '600' },
  dayHeaderRow:  { flexDirection: 'row', marginBottom: 8 },
  dayHeaderCell: { alignItems: 'center' },
  dayHeaderTxt:  { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  calGrid:       { flexDirection: 'row', flexWrap: 'wrap' },
  calCell:       { alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  calCircle:     { alignItems: 'center', justifyContent: 'center' },
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
