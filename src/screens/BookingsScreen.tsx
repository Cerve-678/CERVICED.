// BookingsScreen.tsx - COMPLETELY FIXED - NO FREEZING, SMOOTH SCROLLING
import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Linking,
  Platform,
  Dimensions,
  Modal,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Keyboard,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useFont } from '../contexts/FontContext';
import { useBooking, ConfirmedBooking, BookingStatus, createBookingDateTime } from '../contexts/BookingContext';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { submitReview, getProviderIdByDisplayName, hasReviewedBooking, getActiveRescheduleRequest, getIntakeFormByBooking, IntakeForm, getProviderContactByDisplayName, ProviderContactInfo, getProviderAddressSettingsByDisplayName, ProviderAddressSettings, getProviderCancellationPolicy, getInfoPacksByBooking, markInfoPackViewed, getMyBookingActionItems, BookingInfoPack, getProviderReschedulePolicyByDisplayName, ProviderReschedulePolicy } from '../services/databaseService';
import * as WaitlistService from '../services/WaitlistService';
import type { WaitlistEntry } from '../services/WaitlistService';
import { ThemedBackground } from '../components/ThemedBackground';
import { useTheme, Theme } from '../contexts/ThemeContext';
import { HomeScreenProps } from '../navigation/types';

// ==================== TYPES ====================

type Props = HomeScreenProps<'Bookings'>;

interface BookingCardProps {
  booking: ConfirmedBooking;
  onPress: (booking: ConfirmedBooking) => void;
  isHighlighted?: boolean;
  isRecentlyAdded?: boolean;
  /** Pending intake forms + unread info packs — shows the "!" attention badge */
  actionCount?: number;
  /** True when ANY card in this horizontal row is mid-reschedule — reserves
   *  the reschedule badge's space on every card so the row stays aligned,
   *  even on cards that don't have a badge of their own. */
  rowHasTag?: boolean;
}

type GroupedListItem = { kind: 'category'; serviceType: string; bookings: ConfirmedBooking[] };

interface GroupBookingCardProps {
  groupId: string;
  bookings: ConfirmedBooking[];
  isExpanded: boolean;
  onToggle: () => void;
  onBookingPress: (booking: ConfirmedBooking) => void;
  highlightedBookingId: string | null;
  recentlyAddedBookings: Set<string>;
}

// ==================== CONSTANTS ====================

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Default reschedule policy applies to all providers
const DEFAULT_RESCHEDULE_CONFIG = { maxReschedules: 1, cooldownHours: 24 };

// ==================== HELPER FUNCTIONS ====================

const _DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const _MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function formatDisplayDate(dateStr: string): string {
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00`);
    if (!isNaN(d.getTime())) return `${_DAYS[d.getDay()]} ${d.getDate()} ${_MONTHS[d.getMonth()]}`;
  }
  return dateStr;
}

function resolveDateLabel(label: string): string {
  const today = new Date();
  const fmt = (d: Date) => `${_DAYS[d.getDay()]} ${d.getDate()} ${_MONTHS[d.getMonth()]}`;
  const nextDay = (dow: number) => {
    const d = new Date(today);
    const diff = ((dow - d.getDay() + 7) % 7) || 7;
    d.setDate(d.getDate() + diff);
    return d;
  };
  switch (label) {
    case 'Tomorrow': { const t = new Date(today); t.setDate(today.getDate() + 1); return fmt(t); }
    case 'This Weekend': { const sat = nextDay(6); const sun = new Date(sat); sun.setDate(sat.getDate() + 1); return `${fmt(sat)} or ${fmt(sun)}`; }
    case 'Next Week': { const mon = nextDay(1); const fri = new Date(mon); fri.setDate(mon.getDate() + 4); return `${fmt(mon)} – ${fmt(fri)}`; }
    case 'Next Month': { const nm = new Date(today.getFullYear(), today.getMonth() + 1, 1); return `${_MONTHS[nm.getMonth()]} ${nm.getFullYear()}`; }
    default: return label;
  }
}


// ─── Service category resolver ────────────────────────────────────────────────
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  NAILS:      ['gel', 'acrylic', 'nail', 'manicure', 'pedicure', 'nail art', 'infill', 'sns', 'dip', 'shellac', 'chrome', 'french'],
  HAIR:       ['hair', 'cut', 'trim', 'blow dry', 'colour', 'color', 'highlights', 'balayage', 'extension', 'braid', 'cornrow', 'keratin', 'relaxer', 'weave', 'wig', 'loc', 'twist'],
  LASHES:     ['lash', 'eyelash', 'classic set', 'hybrid set', 'volume', 'mega volume', 'lash lift', 'lash tint'],
  BROWS:      ['brow', 'eyebrow', 'brow wax', 'brow tint', 'henna', 'lamination', 'microblading', 'ombre brow', 'powder brow'],
  MUA:        ['makeup', 'make-up', 'mua', 'bridal make', 'glam', 'contour', 'airbrush', 'smokey'],
  AESTHETICS: ['botox', 'filler', 'aesthetic', 'facial', 'peel', 'microneedling', 'dermaplaning', 'thread', 'wax', 'waxing', 'tan', 'tanning', 'massage', 'skin'],
};

function resolveServiceCategory(serviceName: string, defaultCategory: string): string {
  // Prefer the provider's actual registered category when we have one — only
  // fall back to guessing from the service name for legacy bookings saved
  // before service_category_snapshot existed.
  if (defaultCategory && defaultCategory.trim()) {
    return defaultCategory.toUpperCase();
  }
  const lower = (serviceName || '').toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) return cat;
  }
  return 'OTHER';
}

// ✅ Generate dynamic future dates based on ACTUAL calendar months
// Provider response result type
interface ProviderDateResponse {
  dates: { date: string; times: string[] }[];
  couldMeetRequest: boolean;
  noAvailability: boolean;
  message: string;
}

// Generate reschedule dates based on what the user selected (Tomorrow, This Weekend, etc.)
const generateDynamicRescheduleDates = (selectedMonth?: Date, userSelections?: string[]): ProviderDateResponse => {
  const today = new Date();
  const requestedDates: { date: string; times: string[] }[] = [];
  const alternateDates: { date: string; times: string[] }[] = [];

  const morningTimes = ['9:00 AM', '10:00 AM', '11:00 AM'];
  const afternoonTimes = ['1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'];
  const allTimes = [...morningTimes, ...afternoonTimes];

  // Helper: get next occurrence of a day of week (0=Sun, 6=Sat)
  const getNextDay = (dayOfWeek: number, fromDate: Date = today) => {
    const d = new Date(fromDate);
    const diff = (dayOfWeek - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return d;
  };

  const addDate = (list: typeof requestedDates, d: Date, times: string[]) => {
    const key = d.toISOString().split('T')[0] ?? '';
    if (!list.find(existing => existing.date === key)) {
      list.push({ date: key, times });
    }
  };

  // Provider always responds with requested dates (real availability fetched from DB when available)
  const canMeetRequest = true;

  if (userSelections && userSelections.length > 0) {
    for (const selection of userSelections) {
      switch (selection) {
        case 'Tomorrow': {
          const tomorrow = new Date(today);
          tomorrow.setDate(today.getDate() + 1);
          if (canMeetRequest) {
            addDate(requestedDates, tomorrow, allTimes);
          } else {
            // Provider can't do tomorrow, offer day after and next day
            const dayAfter = new Date(today);
            dayAfter.setDate(today.getDate() + 2);
            const twoDaysAfter = new Date(today);
            twoDaysAfter.setDate(today.getDate() + 3);
            addDate(alternateDates, dayAfter, afternoonTimes);
            addDate(alternateDates, twoDaysAfter, allTimes);
          }
          break;
        }
        case 'This Weekend': {
          const saturday = getNextDay(6);
          const sunday = new Date(saturday);
          sunday.setDate(saturday.getDate() + 1);
          if (canMeetRequest && (saturday.getTime() - today.getTime()) / 86400000 <= 7) {
            addDate(requestedDates, saturday, allTimes);
            addDate(requestedDates, sunday, ['10:00 AM', '11:00 AM', '1:00 PM', '3:00 PM']);
          } else {
            // Can't do this weekend, offer next week instead
            const nextMon = getNextDay(1);
            const nextWed = new Date(nextMon);
            nextWed.setDate(nextMon.getDate() + 2);
            addDate(alternateDates, nextMon, allTimes);
            addDate(alternateDates, nextWed, afternoonTimes);
          }
          break;
        }
        case 'Next Week': {
          const monday = getNextDay(1);
          const wednesday = new Date(monday);
          wednesday.setDate(monday.getDate() + 2);
          const friday = new Date(monday);
          friday.setDate(monday.getDate() + 4);
          if (canMeetRequest) {
            addDate(requestedDates, monday, allTimes);
            addDate(requestedDates, wednesday, allTimes);
            addDate(requestedDates, friday, afternoonTimes);
          } else {
            // Can't do next week, offer the week after
            const weekAfterMon = new Date(monday);
            weekAfterMon.setDate(monday.getDate() + 7);
            const weekAfterWed = new Date(weekAfterMon);
            weekAfterWed.setDate(weekAfterMon.getDate() + 2);
            addDate(alternateDates, weekAfterMon, allTimes);
            addDate(alternateDates, weekAfterWed, afternoonTimes);
          }
          break;
        }
        case 'Next Month': {
          const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
          if (canMeetRequest) {
            for (let d = 1; d <= 14 && requestedDates.length < 3; d++) {
              const candidate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), d);
              const day = candidate.getDay();
              if (day >= 1 && day <= 5) {
                addDate(requestedDates, candidate, allTimes);
              }
            }
          } else {
            // Offer mid-month instead
            for (let d = 10; d <= 21 && alternateDates.length < 3; d++) {
              const candidate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), d);
              const day = candidate.getDay();
              if (day >= 1 && day <= 5) {
                addDate(alternateDates, candidate, afternoonTimes);
              }
            }
          }
          break;
        }
      }
    }
  }

  // Use requested dates if met, otherwise use alternate dates
  const finalDates = canMeetRequest && requestedDates.length > 0 ? requestedDates : alternateDates;

  // Fallback: if nothing generated, use month-based approach
  if (finalDates.length === 0) {
    const baseDate = selectedMonth || today;
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();

    let startDate = new Date(year, month, 1);
    if (startDate <= today) {
      startDate = new Date(today);
      startDate.setDate(today.getDate() + 1);
    }

    for (let i = 0; i < 3; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i * 2);
      if (currentDate.getMonth() !== month) break;
      addDate(finalDates, currentDate, allTimes);
    }
  }

  // Ensure at least 2 dates
  while (finalDates.length < 2) {
    const lastEntry = finalDates[finalDates.length - 1];
    const nextDate = lastEntry?.date
      ? new Date(lastEntry.date)
      : new Date(today);
    nextDate.setDate(nextDate.getDate() + 2);
    addDate(finalDates, nextDate, afternoonTimes);
  }

  const selectionLabel = userSelections?.join(', ') || '';
  const message = canMeetRequest
    ? `Great news! ${selectionLabel} works. Here are the available times.`
    : `Unfortunately, ${selectionLabel} isn't available. However, here are the closest dates we can offer.`;

  return {
    dates: finalDates,
    couldMeetRequest: canMeetRequest,
    noAvailability: false,
    message,
  };
};

// ==================== PAYMENT CALCULATION ====================

function buildClientReceiptHTML(booking: ConfirmedBooking): string {
  const servicePrice = booking.price || 0;
  const addOnsTotal = booking.addOns?.reduce((s, a) => s + (a.price || 0), 0) || 0;
  const subtotal = servicePrice + addOnsTotal;
  const serviceCharge = booking.serviceCharge || 2.99;
  const total = subtotal + serviceCharge;
  const paymentType = booking.paymentType || 'full';
  const depositAmount = booking.depositAmount || 0;
  const amountPaid = booking.amountPaid || 0;
  const remainingBalance = total - amountPaid;

  const addOnRows = (booking.addOns ?? []).map(a =>
    `<tr><td style="padding:6px 0;color:#555;padding-left:16px">+ ${a.name}</td><td style="padding:6px 0;color:#555;text-align:right">£${Number(a.price).toFixed(2)}</td></tr>`
  ).join('');

  const dateStr = new Date(booking.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const ref = (booking.id ?? '').slice(0, 8).toUpperCase();
  const m = (booking as any).paymentMethod as string | undefined;
  const METHOD_LABELS: Record<string, string> = {
    card: 'Credit/Debit Card', paypal: 'PayPal', apple: 'Apple Pay', google: 'Google Pay',
  };
  const paymentMethodLabel = (m && METHOD_LABELS[m]) ? METHOD_LABELS[m]! : 'Card';

  const paymentRows = paymentType === 'deposit'
    ? `<tr><td style="padding:6px 0;color:#34C759;font-weight:600">Deposit Paid</td><td style="padding:6px 0;color:#34C759;font-weight:600;text-align:right">£${depositAmount.toFixed(2)}</td></tr>
       <tr><td style="padding:6px 0;color:#34C759;font-weight:600">Total Paid</td><td style="padding:6px 0;color:#34C759;font-weight:600;text-align:right">£${(depositAmount + serviceCharge).toFixed(2)}</td></tr>
       ${remainingBalance > 0 ? `<tr><td style="padding:6px 0;color:#FF9500;font-weight:600">Balance Due at Appointment</td><td style="padding:6px 0;color:#FF9500;font-weight:600;text-align:right">£${remainingBalance.toFixed(2)}</td></tr>` : ''}
       <tr><td style="padding:6px 0;color:#555">Payment Method</td><td style="padding:6px 0;color:#555;text-align:right">${paymentMethodLabel}</td></tr>`
    : `<tr><td style="padding:6px 0;color:#34C759;font-weight:600">Total Paid</td><td style="padding:6px 0;color:#34C759;font-weight:600;text-align:right">£${amountPaid.toFixed(2)}</td></tr>
       <tr><td style="padding:6px 0;color:#555">Payment Method</td><td style="padding:6px 0;color:#555;text-align:right">${paymentMethodLabel}</td></tr>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, Helvetica, Arial, sans-serif; background: #fff; color: #111; padding: 48px 40px; max-width: 520px; margin: 0 auto; }
.brand { font-size: 38px; font-weight: 900; letter-spacing: 8px; text-align: center; margin-bottom: 4px; }
.sub { font-size: 13px; letter-spacing: 3px; color: #888; text-align: center; margin-bottom: 24px; }
.label { font-size: 11px; letter-spacing: 2px; color: #888; margin-bottom: 10px; font-weight: 700; }
.perf { border: none; border-top: 2px dashed #ddd; margin: 18px 0; }
table { width: 100%; border-collapse: collapse; }
td { font-size: 15px; vertical-align: middle; padding: 6px 0; }
.bold td { font-weight: 600; }
.total-block { margin-top: 18px; padding-top: 14px; border-top: 2.5px solid #111; display: flex; justify-content: space-between; align-items: center; }
.total-label { font-size: 13px; letter-spacing: 2px; font-weight: 700; }
.total-value { font-size: 28px; font-weight: 900; }
.ref-block { margin-top: 24px; text-align: center; }
.ref-label { font-size: 11px; letter-spacing: 2px; color: #aaa; margin-bottom: 4px; }
.ref-value { font-size: 18px; font-weight: 700; letter-spacing: 3px; color: #555; }
.date { font-size: 12px; color: #aaa; margin-top: 4px; }
</style></head><body>
<div class="brand">CERVICED</div>
<div class="sub">PAYMENT RECEIPT</div>
<hr class="perf"/>
<section>
  <div class="label">SERVICE</div>
  <table>
    <tr class="bold"><td>${booking.serviceName ?? '—'}</td><td style="text-align:right">£${servicePrice.toFixed(2)}</td></tr>
    ${addOnRows}
    ${addOnRows ? `<tr><td style="padding:6px 0;color:#888;font-size:13px">Subtotal</td><td style="padding:6px 0;color:#888;font-size:13px;text-align:right">£${subtotal.toFixed(2)}</td></tr>` : ''}
  </table>
</section>
<hr class="perf"/>
<section>
  <div class="label">BOOKING</div>
  <table>
    <tr><td style="color:#555">Provider</td><td style="color:#555;text-align:right">${booking.providerName ?? '—'}</td></tr>
    <tr><td style="color:#555">Date</td><td style="color:#555;text-align:right">${booking.bookingDate ?? '—'}</td></tr>
    <tr><td style="color:#555">Time</td><td style="color:#555;text-align:right">${booking.bookingTime ?? '—'}</td></tr>
  </table>
</section>
<hr class="perf"/>
<section>
  <div class="label">PAYMENT</div>
  <table>
    ${paymentRows}
  </table>
  <div class="total-block">
    <span class="total-label">TOTAL</span>
    <span class="total-value">£${total.toFixed(2)}</span>
  </div>
</section>
<hr class="perf"/>
<div class="ref-block">
  <div class="ref-label">REFERENCE</div>
  <div class="ref-value">${ref}</div>
  <div class="date">${dateStr}</div>
</div>
</body></html>`;
}

const calculatePaymentBreakdown = (booking: ConfirmedBooking) => {
  const servicePrice = booking.price || 0;
  const addOnsTotal = booking.addOns?.reduce((s, a) => s + (a.price || 0), 0) || 0;
  const subtotal = servicePrice + addOnsTotal;
  const serviceCharge = booking.serviceCharge || 2.99;
  const total = subtotal + serviceCharge;

  const paymentType = booking.paymentType || 'full';
  const amountPaidAtCheckout = booking.amountPaid;
  const depositAmount = booking.depositAmount || 0;
  const remainingBalance = total - amountPaidAtCheckout;

  // For deposits: total paid at checkout = deposit + service charge
  const totalPaidAtCheckout = paymentType === 'deposit'
    ? depositAmount + serviceCharge
    : amountPaidAtCheckout;

  return {
    servicePrice,
    addOnsTotal,
    subtotal,
    serviceCharge,
    total,
    paymentType,
    depositAmount,
    amountPaidAtCheckout,
    remainingBalance,
    totalPaidAtCheckout,
  };
};

// ==================== COMPONENTS ====================

// TEMPORARY — testing-only access to Dev Settings via a triple-tap on the
// top-right corner. Remove this component and its mount point below before
// shipping to TestFlight / production (it is not gated by __DEV__).
const HiddenDevMenuTrigger = ({ navigation }: any) => {
  const tapCountRef = React.useRef(0);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTap = () => {
    tapCountRef.current += 1;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 2000);

    if (tapCountRef.current === 3) {
      if (__DEV__) console.log('Opening Dev Settings...');
      navigation.navigate('DevSettings');
      tapCountRef.current = 0;
      if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  return (
    <TouchableOpacity
      onPress={handleTap}
      style={{ width: 28, alignSelf: 'stretch' }}
      // left/right stay INSIDE the row's 12px gap to each neighboring pill —
      // going wider overlaps their real touch bounds and steals taps meant
      // for this trigger. top/bottom are safe to expand generously since
      // there's nothing else competing there.
      hitSlop={{ top: 24, bottom: 24, left: 10, right: 10 }}
      activeOpacity={1}
    />
  );
};

// ==================== GROUP BOOKING CARD ====================

const STATUS_PRIORITY: BookingStatus[] = [
  BookingStatus.CANCELLED,
  BookingStatus.NO_SHOW,
  BookingStatus.PENDING,
  BookingStatus.IN_PROGRESS,
  BookingStatus.UPCOMING,
  BookingStatus.COMPLETED,
];

const STATUS_LABELS: Record<string, string> = {
  [BookingStatus.UPCOMING]: 'Upcoming',
  [BookingStatus.IN_PROGRESS]: 'In Progress',
  [BookingStatus.COMPLETED]: 'Completed',
  [BookingStatus.CANCELLED]: 'Cancelled',
  [BookingStatus.NO_SHOW]: 'No Show',
  pending: 'Pending',
};

const STATUS_COLORS: Record<string, string> = {
  [BookingStatus.UPCOMING]: '#4CAF50',
  [BookingStatus.IN_PROGRESS]: '#2196F3',
  [BookingStatus.COMPLETED]: '#2196F3',
  [BookingStatus.CANCELLED]: '#F44336',
  [BookingStatus.NO_SHOW]: '#FF9800',
  pending: '#AF9197',
};

const GroupBookingCard = React.memo<GroupBookingCardProps>(
  ({ groupId, bookings, isExpanded, onToggle, onBookingPress, highlightedBookingId }) => {
    const { theme, isDarkMode } = useTheme();
    const styles = useMemo(() => createStyles(theme, isDarkMode), [theme, isDarkMode]);

    const serviceCount = bookings.length;

    const totalBasePrice = useMemo(
      () => bookings.reduce((sum, b) => sum + b.price + (b.addOns?.reduce((s, a) => s + a.price, 0) ?? 0), 0),
      [bookings]
    );

    const platformFee = useMemo(
      () => bookings.reduce((sum, b) => sum + (b.serviceCharge ?? 0), 0),
      [bookings]
    );

    const earliestDate = bookings[0]?.bookingDate ?? '';

    const overallStatus = useMemo(() => {
      const statuses = new Set(bookings.map(b => b.status));
      return STATUS_PRIORITY.find(s => statuses.has(s)) ?? BookingStatus.UPCOMING;
    }, [bookings]);

    const statusLabel = STATUS_LABELS[overallStatus] ?? 'Upcoming';
    const statusColor = STATUS_COLORS[overallStatus] ?? '#4CAF50';

    const formattedDate = useMemo(() => {
      if (!earliestDate) return '';
      const parts = earliestDate.split('-');
      if (parts.length < 3) return earliestDate;
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return `${_MONTHS[d.getMonth()]} ${d.getDate()}`;
    }, [earliestDate]);

    const cardBg = isDarkMode ? '#2C2C2E' : '#FFFFFF';
    const borderColor = isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
    const divColor = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    const titleColor = isDarkMode ? '#F0F0F0' : '#111';
    const metaColor = isDarkMode ? 'rgba(255,255,255,0.55)' : '#666';
    const feeColor = isDarkMode ? 'rgba(255,255,255,0.45)' : '#999';
    const itemProviderColor = isDarkMode ? '#F0F0F0' : '#222';
    const itemServiceColor = isDarkMode ? 'rgba(255,255,255,0.6)' : '#666';
    const itemDateColor = isDarkMode ? 'rgba(255,255,255,0.4)' : '#999';
    const itemPriceColor = isDarkMode ? '#F0F0F0' : '#111';
    const feeBgColor = isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';

    return (
      <View style={[styles.groupBookingCard, { backgroundColor: cardBg, borderColor }]}>
        <TouchableOpacity
          style={styles.groupBookingHeader}
          onPress={onToggle}
          activeOpacity={0.7}
        >
          <View style={styles.groupBookingHeaderLeft}>
            <Text style={[styles.groupBookingTitle, { color: titleColor }]}>
              {`Group Booking  ·  ${serviceCount} service${serviceCount !== 1 ? 's' : ''}  ·  £${totalBasePrice.toFixed(2)}  ·  ${formattedDate}`}
            </Text>
            <View style={[styles.groupBookingStatusBadge, { backgroundColor: statusColor + '22' }]}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: statusColor }}>{statusLabel}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 20, color: metaColor, marginLeft: 8 }}>
            {isExpanded ? '▴' : '▾'}
          </Text>
        </TouchableOpacity>

        {isExpanded && (
          <View style={[styles.groupBookingBody, { borderTopColor: divColor }]}>
            {bookings.map((booking, index) => {
              const itemBase = booking.price + (booking.addOns?.reduce((s, a) => s + a.price, 0) ?? 0);
              const isLast = index === bookings.length - 1;
              const isHighlighted = highlightedBookingId === booking.id;
              return (
                <TouchableOpacity
                  key={booking.id}
                  style={[
                    styles.groupBookingItemRow,
                    { borderBottomColor: divColor },
                    isLast && { borderBottomWidth: 0 },
                    isHighlighted && { backgroundColor: isDarkMode ? 'rgba(200,80,200,0.12)' : 'rgba(200,80,200,0.07)' },
                  ]}
                  onPress={() => onBookingPress(booking)}
                  activeOpacity={0.7}
                >
                  {booking.providerImage ? (
                    <Image
                      source={typeof booking.providerImage === 'string' ? { uri: booking.providerImage } : booking.providerImage}
                      style={styles.groupBookingItemImage}
                    />
                  ) : (
                    <View style={[styles.groupBookingItemImage, { backgroundColor: isDarkMode ? '#3C3C3E' : '#EEE' }]} />
                  )}
                  <View style={styles.groupBookingItemInfo}>
                    <Text style={[styles.groupBookingItemProvider, { color: itemProviderColor }]} numberOfLines={1}>
                      {booking.providerName}
                    </Text>
                    <Text style={[styles.groupBookingItemService, { color: itemServiceColor }]} numberOfLines={1}>
                      {booking.serviceName}
                    </Text>
                    <Text style={[styles.groupBookingItemDateTime, { color: itemDateColor }]}>
                      {`${formattedDate}  ·  ${booking.bookingTime}`}
                    </Text>
                  </View>
                  <Text style={[styles.groupBookingItemPrice, { color: itemPriceColor }]}>
                    £{itemBase.toFixed(2)}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {platformFee > 0 && (
              <View style={[styles.groupBookingPlatformFeeRow, { backgroundColor: feeBgColor }]}>
                <Text style={[styles.groupBookingPlatformFeeLabel, { color: feeColor }]}>Platform Fee</Text>
                <Text style={[styles.groupBookingPlatformFeeValue, { color: feeColor }]}>£{platformFee.toFixed(2)}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  }
);

// ✅ OPTIMIZED BookingCard - NO INLINE FUNCTIONS
const BookingCard = React.memo<BookingCardProps>(
  ({ booking, onPress, isHighlighted = false, isRecentlyAdded = false, actionCount = 0, rowHasTag = false }) => {
    const { theme, isDarkMode } = useTheme();
    const styles = useMemo(() => createStyles(theme, isDarkMode), [theme, isDarkMode]);
    const statusColors = {
      [BookingStatus.CANCELLED]: '#F44336',
      [BookingStatus.NO_SHOW]: '#FF9800',
    };

    // Highlight animation for when navigating from notifications
    const highlightAnim = useRef(new Animated.Value(isHighlighted ? 1 : 0)).current;

    useEffect(() => {
      if (isHighlighted) {
        // Flash animation: highlight -> fade out
        Animated.sequence([
          Animated.timing(highlightAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: false,
          }),
          Animated.delay(1500),
          Animated.timing(highlightAnim, {
            toValue: 0,
            duration: 800,
            useNativeDriver: false,
          }),
        ]).start();
      }
    }, [isHighlighted]);

    const highlightBorderColor = highlightAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)', '#AF9197'],
    });

    const highlightBackgroundColor = highlightAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [isDarkMode ? '#2C2C2E' : '#FFFFFF', 'rgba(175, 145, 151, 0.08)'],
    });

    const showStatusBadge =
      booking.status === BookingStatus.CANCELLED ||
      booking.status === BookingStatus.NO_SHOW ||
      booking.status === BookingStatus.PENDING ||
      booking.isPendingReschedule;

    const badgeText = useMemo(() => {
      if (booking.isPendingReschedule) {
        const hasProviderResponse = !!(booking as any).rescheduleRequest?.providerAvailableDates;
        return hasProviderResponse ? 'AVAILABLE' : 'PENDING';
      }
      if (booking.status === BookingStatus.PENDING) return 'AWAITING CONFIRMATION';
      if (booking.status === BookingStatus.CANCELLED) return 'CANCELLED';
      if (booking.status === BookingStatus.NO_SHOW) return 'NO SHOW';
      return '';
    }, [booking.isPendingReschedule, booking.status]);

    const badgeColor = useMemo(() => {
      if (booking.isPendingReschedule) return '#AF9197';
      if (booking.status === BookingStatus.PENDING) return '#FF9500';
      return statusColors[booking.status as keyof typeof statusColors] || '#9E9E9E';
    }, [booking.isPendingReschedule, booking.status]);

    const handlePress = useCallback(() => {
      onPress(booking);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }, [booking, onPress]);

    return (
      <View style={styles.providerCardWrapper}>
        <Pressable onPress={handlePress}>
          <Animated.View
            style={[
              styles.providerCard,
              {
                borderColor: highlightBorderColor,
                backgroundColor: highlightBackgroundColor,
              }
            ]}
          >
            <View style={styles.providerImageWrapper}>
              <Image source={typeof booking.providerImage === 'string' ? { uri: booking.providerImage } : booking.providerImage} style={styles.providerLogo} resizeMode="cover" />
              {/* Status dot (e.g. orange = awaiting confirmation) — top-left so it
                  never collides with the "recently added" / "!" dots on the right */}
              {showStatusBadge && (
                <View
                  style={[styles.statusDot, { backgroundColor: badgeColor }]}
                  accessible
                  accessibilityLabel={badgeText}
                />
              )}
              {/* Green dot for recently added bookings */}
              {isRecentlyAdded && booking.status === BookingStatus.UPCOMING && (
                <View style={styles.recentlyAddedDot} />
              )}
              {/* "!" — forms or info packs waiting for the client */}
              {actionCount > 0 && booking.status !== BookingStatus.CANCELLED && (
                <View style={{
                  position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20,
                  borderRadius: 10, backgroundColor: '#FF3B30', alignItems: 'center',
                  justifyContent: 'center', paddingHorizontal: 4, zIndex: 2,
                  borderWidth: 1.5, borderColor: '#fff',
                }}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800', lineHeight: 14 }}>!</Text>
                </View>
              )}
            </View>
            <View style={styles.providerInfo}>
              <Text style={styles.providerName} numberOfLines={1}>
                {booking.providerName}
              </Text>
              <Text style={styles.providerService} numberOfLines={1}>
                {booking.serviceName}
              </Text>
              {(booking.addOns?.length ?? 0) > 0 && (
                <View style={styles.cardAddOnPill}>
                  <Text style={styles.cardAddOnPillText}>+ {booking.addOns!.length} add-on{booking.addOns!.length === 1 ? '' : 's'}</Text>
                </View>
              )}
              <View style={styles.appointmentTime}>
                <View style={styles.dateTimeRow}>
                  <Text style={styles.appointmentDate}>
                    {formatDisplayDate(booking.bookingDate)}
                  </Text>
                </View>
                <Text style={styles.appointmentTimeText}>{booking.bookingTime}</Text>
              </View>
              {/* Reschedule badge — visible text, not just a dot, since it's
                  actionable. Cards without one still reserve the space when
                  a sibling in the row has it, so the row stays aligned. */}
              {booking.isPendingReschedule ? (
                <View style={[styles.rescheduleBadge, { backgroundColor: badgeColor }]}>
                  <Text style={styles.rescheduleBadgeText} numberOfLines={1}>
                    {badgeText === 'AVAILABLE' ? 'Reschedule Available' : 'Reschedule Pending'}
                  </Text>
                </View>
              ) : rowHasTag ? (
                <View style={styles.rescheduleBadgeSpacer} />
              ) : null}
            </View>
          </Animated.View>
        </Pressable>
      </View>
    );
  }
);

BookingCard.displayName = 'BookingCard';

// ==================== MAIN COMPONENT ====================

const BookingsScreen: React.FC<Props> = ({ navigation, route }) => {
  useFont();
  const { theme, isDarkMode } = useTheme();
  const styles = useMemo(() => createStyles(theme, isDarkMode), [theme, isDarkMode]);
  const { user } = useAuth();
  const { addToCart, items: cartItems } = useCart();
  
  const {
    upcomingBookings,
    pastBookings,
    todayBookings,
    currentBooking,
    nextBookings,
    allTodayBookingsCompleted,
    cancelBooking,
    requestReschedule,
    providerRespondToReschedule,
    confirmReschedule,
    canReschedule,
    reloadBookings,
  } = useBooking();

  const filteredPastBookings = useMemo(() => pastBookings.filter(b => !b.isPendingReschedule), [pastBookings]);
  const filteredUpcomingBookings = useMemo(() => upcomingBookings, [upcomingBookings]);

  const mapRef = useRef<MapView>(null);
  const messageScrollRef = useRef<ScrollView>(null);
  const mainScrollRef = useRef<ScrollView>(null);
  const modalScrollRef = useRef<ScrollView>(null);
  const bookingsListRef = useRef<FlatList>(null);

  // ✅ Track active reschedule timeouts per booking to prevent interference
  const rescheduleTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const [activeFilters, setActiveFilters] = useState<Set<'all' | 'past'>>(new Set());
  const [waitlistEntries, setWaitlistEntries] = useState<WaitlistEntry[]>([]);

  // Load waitlist entries for this user
  useEffect(() => {
    if (!user?.id) return;
    WaitlistService.getUserWaitlistEntries(user.id)
      .then(setWaitlistEntries)
      .catch(() => {});
  }, [user?.id]);

  // Pending intake forms + unread info packs per booking — drives the "!" badge
  const refreshBookingActionItems = useCallback(() => {
    if (!user?.id) return;
    getMyBookingActionItems()
      .then(setBookingActionItems)
      .catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    refreshBookingActionItems();
  }, [refreshBookingActionItems, upcomingBookings.length]);

  // Re-check when returning to this screen (e.g. after filling an intake form)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', refreshBookingActionItems);
    return unsubscribe;
  }, [navigation, refreshBookingActionItems]);

  const toggleFilter = useCallback((filter: 'all' | 'past') => {
    setActiveFilters(prev => {
      if (prev.has(filter)) {
        return new Set();
      }
      return new Set([filter]);
    });
  }, []);

  const isFilterView = activeFilters.size > 0;
  const [selectedBooking, setSelectedBooking] = useState<ConfirmedBooking | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  const handleShareReceipt = useCallback(async () => {
    if (!selectedBooking) return;
    try {
      const html = buildClientReceiptHTML(selectedBooking);
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share Receipt', UTI: 'com.adobe.pdf' });
    } catch {
      Alert.alert('Error', 'Could not generate the receipt.');
    }
  }, [selectedBooking]);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [providerResponseMessage, setProviderResponseMessage] = useState<string>('');
  const [providerNoAvailability, setProviderNoAvailability] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [successIcon, setSuccessIcon] = useState('✓');
  const [showCooldownModal, setShowCooldownModal] = useState(false);
  const [cooldownMessage, setCooldownMessage] = useState('');
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [hasRated, setHasRated] = useState(false);
  const [showRebookAddOnsModal, setShowRebookAddOnsModal] = useState(false);
  const [rebookSelection, setRebookSelection] = useState<'with' | 'without' | null>(null);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [contactSheetVisible, setContactSheetVisible] = useState(false);
  const [contactSheetBooking, setContactSheetBooking] = useState<ConfirmedBooking | null>(null);
  const [contactSheetInfo, setContactSheetInfo] = useState<ProviderContactInfo | null>(null);
  const [contactSheetLoading, setContactSheetLoading] = useState(false);
  const [tipAmount, setTipAmount] = useState<number>(0);
  const [showTipModal, setShowTipModal] = useState(false);
  const [hasTipped, setHasTipped] = useState(false);
  const [selectedRescheduleMonth, setSelectedRescheduleMonth] = useState<Date>(new Date());
  const [shouldNavigateToCart, setShouldNavigateToCart] = useState(false);
  const [bookingIntakeForm, setBookingIntakeForm] = useState<IntakeForm | null>(null);
  const [bookingInfoPacks, setBookingInfoPacks] = useState<BookingInfoPack[]>([]);
  const [viewingPack, setViewingPack] = useState<BookingInfoPack | null>(null);
  const [bookingActionItems, setBookingActionItems] = useState<Record<string, number>>({});
  const [reschedulePolicy, setReschedulePolicy] = useState<ProviderReschedulePolicy | null>(null);
  const [selectedBookingAddrSettings, setSelectedBookingAddrSettings] = useState<ProviderAddressSettings | null>(null);
  const [addrCountdown, setAddrCountdown] = useState('');
  const [cancellationNoticeHrs, setCancellationNoticeHrs] = useState(0);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // ✅ Track rated bookings and tips
  const [ratedBookings, setRatedBookings] = useState<Set<string>>(new Set());
  const [tippedBookings, setTippedBookings] = useState<Set<string>>(new Set());

  // ✅ Track highlighted booking (from notification navigation) and recently added bookings
  const [highlightedBookingId, setHighlightedBookingId] = useState<string | null>(null);
  const [recentlyAddedBookings, setRecentlyAddedBookings] = useState<Set<string>>(new Set());

  // ✅ Group booking expand/collapse
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = useCallback((id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  // ✅ Store message history per booking with timestamp (persists for 72hrs after appointment)
  const [messageHistory, setMessageHistory] = useState<Record<string, {
    messages: Array<{
      id: string;
      text: string;
      sender: 'user' | 'provider';
      timestamp: Date;
    }>;
    appointmentDate: string;
  }>>({});

  // ✅ Message state
  const [messages, setMessages] = useState<Array<{
    id: string;
    text: string;
    sender: 'user' | 'provider';
    timestamp: Date;
  }>>([]);

  // ==================== HELPER FUNCTIONS ====================

  const getStatusColor = useCallback((status: string, isPending?: boolean) => {
    if (isPending) return '#AF9197';
    
    const colorMap: Record<string, string> = {
      [BookingStatus.UPCOMING]: '#4CAF50',
      [BookingStatus.IN_PROGRESS]: '#2196F3',
      [BookingStatus.COMPLETED]: '#2196F3',
      [BookingStatus.CANCELLED]: '#F44336',
      [BookingStatus.NO_SHOW]: '#FF9800',
    };
    return colorMap[status] || '#9E9E9E';
  }, []);

  const focusMapOnLocation = useCallback((coordinates: { latitude: number; longitude: number }) => {
    if (mapRef.current && coordinates) {
      mapRef.current.animateToRegion(
        {
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        },
        1000
      );
    }
  }, []);

  const openInMaps = useCallback(async (booking: ConfirmedBooking) => {
    try {
      const { coordinates, address } = booking;
      const label = encodeURIComponent(address);
      const url = Platform.select({
        ios: `maps:${coordinates.latitude},${coordinates.longitude}?q=${label}`,
        android: `geo:${coordinates.latitude},${coordinates.longitude}?q=${label}`,
      });
      if (url) {
        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) {
          await Linking.openURL(url);
        } else {
          await Linking.openURL(
            `https://www.google.com/maps/search/?api=1&query=${coordinates.latitude},${coordinates.longitude}`
          );
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Unable to open maps');
    }
  }, []);

  const openContactSheet = useCallback(async (booking: ConfirmedBooking) => {
    setContactSheetBooking(booking);
    setContactSheetInfo(null);
    setContactSheetVisible(true);
    setContactSheetLoading(true);
    try {
      const info = await getProviderContactByDisplayName(booking.providerName);
      setContactSheetInfo(info);
    } catch {
      setContactSheetInfo({ preferred_contact_methods: ['in_app'], whatsapp_number: null, email: null, phone: null });
    } finally {
      setContactSheetLoading(false);
    }
  }, []);


  // In-app messaging is always available — the old ±72-hour window around the
  // appointment is gone. (Signature kept so the call sites stay unchanged.)
  const isMessagingAvailable = useCallback((_bookingDate: string) => true, []);

  const handleBookingPress = useCallback((booking: ConfirmedBooking) => {
    navigation.navigate('BookingDetail', { bookingId: booking.id });
  }, [navigation]);

  // ✅ REMOVED: Duplicate reschedule logic - now using canReschedule from BookingContext
  // The context handles all reschedule validation including:
  // - rescheduleCount limit (max 1)
  // - 24-hour cooldown
  // - pending status checks

  // ✅ FIXED: Book Again - checks cart, shows proper modals
  const handleRebook = useCallback((booking: ConfirmedBooking) => {
    // Check if already in cart
    const alreadyInCart = cartItems.some(item =>
      item.serviceName === booking.serviceName &&
      item.providerName === booking.providerName
    );

    if (alreadyInCart) {
      // Close the booking details modal
      setModalVisible(false);

      // Re-enable scrolling
      setTimeout(() => {
        mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
        modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
      }, 100);

      // Show warning modal
      setSuccessMessage(`${booking.serviceName} from ${booking.providerName} is already in your cart.`);
      setSuccessIcon('⚠️');
      setShowSuccessModal(true);
      return;
    }

    // ✅ FIX: Set selectedBooking BEFORE showing modal
    setSelectedBooking(booking);

    // ✅ FIX: Close main modal first and re-enable scrolling
    setModalVisible(false);

    // Re-enable scrolling immediately
    setTimeout(() => {
      mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
      modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
    }, 100);

    if (booking.addOns && booking.addOns.length > 0) {
      // Small delay to allow main modal to close first
      setTimeout(() => {
        setShowRebookAddOnsModal(true);
      }, 300);
    } else {
      // No add-ons, add directly to cart
      const cartItem = {
        providerName: booking.providerName,
        providerId: booking.providerId,
        providerImage: booking.providerImage,
        providerService: booking.providerService,
        service: {
          id: `rebook_${Date.now()}`,
          name: booking.serviceName,
          price: booking.price,
          duration: booking.duration,
          description: booking.providerService,
          addOns: [],
        },
        quantity: 1,
      };

      addToCart(cartItem);
      setModalVisible(false);
      setSuccessMessage(`${booking.serviceName} has been added to your cart.`);
      setSuccessIcon('✓');
      setShowSuccessModal(true);
      // ✅ FIX: Set flag to navigate when modal closes instead of during modal visibility
      setShouldNavigateToCart(true);
    }
  }, [cartItems, addToCart]);

  // ✅ Confirm rebook with/without add-ons
  const confirmRebook = useCallback((selection?: 'with' | 'without') => {
    const finalSelection = selection || rebookSelection;
    if (!selectedBooking || !finalSelection) return;

    // Check if already in cart before adding
    const alreadyInCart = cartItems.some(item =>
      item.serviceName === selectedBooking.serviceName &&
      item.providerName === selectedBooking.providerName
    );

    if (alreadyInCart) {
      setShowRebookAddOnsModal(false);
      setTimeout(() => {
        mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
        modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
      }, 100);
      setSuccessMessage(`${selectedBooking.serviceName} from ${selectedBooking.providerName} is already in your cart.`);
      setSuccessIcon('⚠️');
      setShowSuccessModal(true);
      return;
    }

    setShowRebookAddOnsModal(false);

    // ✅ FIX: Re-enable scrolling when closing add-ons modal
    setTimeout(() => {
      mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
      modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
    }, 100);

    const cartItem = {
      providerName: selectedBooking.providerName,
      providerId: selectedBooking.providerId,
      providerImage: selectedBooking.providerImage,
      providerService: selectedBooking.providerService,
      service: {
        id: `rebook_${Date.now()}`,
        name: selectedBooking.serviceName,
        price: selectedBooking.price,
        duration: selectedBooking.duration,
        description: selectedBooking.providerService,
        addOns: finalSelection === 'with' ? (selectedBooking.addOns || []) : [],
      },
      quantity: 1,
    };

    addToCart(cartItem);
    setRebookSelection(null);
    setModalVisible(false);
    setSuccessMessage(`${selectedBooking.serviceName} has been added to your cart.`);
    setSuccessIcon('✓');
    setShowSuccessModal(true);
    // ✅ FIX: Set flag to navigate when modal closes instead of during modal visibility
    setShouldNavigateToCart(true);
  }, [selectedBooking, rebookSelection, addToCart, cartItems]);

  // ==================== ACTION HANDLERS ====================

  const handleCancelBooking = useCallback(async () => {
    if (!selectedBooking) return;

    // Enforce provider's cancellation notice window — but only for bookings
    // the provider has actually confirmed. A still-pending request was never
    // accepted, so there's nothing to give notice for; the client can always
    // withdraw it outright.
    // bookingTime is a 12h display string ("2:30 PM") — template-literal Date
    // parsing produced Invalid Date/NaN, which silently skipped this check.
    if (selectedBooking.status !== BookingStatus.PENDING && cancellationNoticeHrs > 0 && selectedBooking.bookingDate && selectedBooking.bookingTime) {
      const appointmentMs = createBookingDateTime(selectedBooking.bookingDate, selectedBooking.bookingTime).getTime();
      const hoursUntil = (appointmentMs - Date.now()) / 3_600_000;
      if (hoursUntil >= 0 && hoursUntil < cancellationNoticeHrs) {
        Alert.alert(
          'Cancellation Not Allowed',
          `This provider requires ${cancellationNoticeHrs} hours' notice to cancel. Please contact them directly.`,
        );
        return;
      }
    }

    setIsLoading(true);
    try {
      const bookingId = selectedBooking.id;

      // ✅ Clear any pending reschedule timeout for this booking
      const existingTimeout = rescheduleTimeoutsRef.current.get(bookingId);
      if (existingTimeout) {
        if (__DEV__) console.log(`[Booking ${bookingId}] Clearing reschedule timeout (booking cancelled)`);
        clearTimeout(existingTimeout);
        rescheduleTimeoutsRef.current.delete(bookingId);
      }

      await cancelBooking(bookingId);
      setModalVisible(false);
      setShowCancelModal(false);
      setSuccessMessage('Your appointment has been cancelled successfully.');
      setSuccessIcon('✓');
      setShowSuccessModal(true);
    } catch (error) {
      Alert.alert('Error', 'Failed to cancel booking. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedBooking, cancelBooking, cancellationNoticeHrs]);

  const handleRescheduleRequest = useCallback(() => {
    if (!selectedBooking) return;

    // ✅ Check reschedule eligibility using context function
    const rescheduleCheck = canReschedule(selectedBooking.id);
    if (!rescheduleCheck.canReschedule) {
      setModalVisible(false);
      setCooldownMessage(rescheduleCheck.reason || 'Unable to reschedule at this time');
      setShowCooldownModal(true);
      return;
    }

    // Enforce the provider's own reschedule policy (set at registration)
    if (reschedulePolicy) {
      const used = selectedBooking.rescheduleRequest?.rescheduleCount ?? 0;
      if (reschedulePolicy.maxReschedules !== null && used >= reschedulePolicy.maxReschedules) {
        setModalVisible(false);
        setCooldownMessage(
          `${selectedBooking.providerName} allows ${reschedulePolicy.maxReschedules} reschedule${reschedulePolicy.maxReschedules === 1 ? '' : 's'} per booking. Please contact them directly to change this appointment.`
        );
        setShowCooldownModal(true);
        return;
      }
      if (reschedulePolicy.rescheduleNoticeHours > 0 && selectedBooking.bookingDate && selectedBooking.bookingTime) {
        const start = createBookingDateTime(selectedBooking.bookingDate, selectedBooking.bookingTime);
        const hoursUntil = (start.getTime() - Date.now()) / 3_600_000;
        if (hoursUntil >= 0 && hoursUntil < reschedulePolicy.rescheduleNoticeHours) {
          setModalVisible(false);
          setCooldownMessage(
            `${selectedBooking.providerName} requires ${reschedulePolicy.rescheduleNoticeHours} hours' notice to reschedule. Please contact them directly.`
          );
          setShowCooldownModal(true);
          return;
        }
      }
    }

    setModalVisible(false);
    setSelectedRescheduleMonth(new Date()); // Reset to current month
    setShowRescheduleModal(true);
  }, [selectedBooking, canReschedule, reschedulePolicy]);

  const handleRescheduleConfirm = useCallback(async () => {
    if (!selectedBooking || selectedDates.length === 0) {
      Alert.alert('Select Date/Time', 'Please select at least one option.');
      return;
    }

    setIsLoading(true);
    try {
      if ((selectedBooking as any).rescheduleRequest?.providerAvailableDates) {
        const selectedSlot = selectedDates[0];
        
        if (!selectedSlot) {
          Alert.alert('Error', 'Please select a time slot.');
          setIsLoading(false);
          return;
        }
        
        const lastHyphenIndex = selectedSlot.lastIndexOf('-');
        
        if (lastHyphenIndex === -1) {
          Alert.alert('Error', 'Invalid time slot format.');
          setIsLoading(false);
          return;
        }
        
        const date = selectedSlot.substring(0, lastHyphenIndex);
        const time = selectedSlot.substring(lastHyphenIndex + 1);
        
        if (!date || !time || date.length < 10) {
          Alert.alert('Error', 'Invalid date/time format.');
          setIsLoading(false);
          return;
        }

        setShowRescheduleModal(false);
        setModalVisible(false);
        setSelectedDates([]);

        const bookingId = selectedBooking.id;
        const providerName = selectedBooking.providerName;

        if (__DEV__) console.log(`[${providerName}] Step 3: User confirming booking ${bookingId} to ${date} at ${time}`);
        await confirmReschedule(bookingId, date, time);
        if (__DEV__) console.log(`[${providerName}] Step 3 Complete: Booking ${bookingId} Status=UPCOMING`);

        // ✅ Clear any pending timeout for this booking since reschedule is complete
        const existingTimeout = rescheduleTimeoutsRef.current.get(bookingId);
        if (existingTimeout) {
          if (__DEV__) console.log(`[${providerName}] Clearing timeout for booking ${bookingId} (confirmed)`);
          clearTimeout(existingTimeout);
          rescheduleTimeoutsRef.current.delete(bookingId);
        }

        setSuccessMessage('Your appointment has been rescheduled successfully!');
        setSuccessIcon('✓');
        setShowSuccessModal(true);
        
      } else {
        setShowRescheduleModal(false);
        setModalVisible(false);
        setSelectedDates([]);

        const bookingId = selectedBooking.id;
        const providerName = selectedBooking.providerName;

        // ✅ Capture current month and user selections for THIS specific booking's timeout
        const currentMonth = new Date(selectedRescheduleMonth);
        const capturedSelections = [...selectedDates];

        if (__DEV__) console.log(`[${providerName}] Step 1: User requesting reschedule for booking ${bookingId}`);
        await requestReschedule(bookingId, selectedDates.map(resolveDateLabel));
        if (__DEV__) console.log(`[${providerName}] Step 1 Complete: Booking ${bookingId} Status=PENDING`);

        setSuccessMessage(`Reschedule request sent! ${providerName} will respond with available dates.`);
        setSuccessIcon('✓');
        setShowSuccessModal(true);

        // ✅ Clear any existing timeout for this booking to prevent interference
        const existingTimeout = rescheduleTimeoutsRef.current.get(bookingId);
        if (existingTimeout) {
          if (__DEV__) console.log(`[${providerName}] Clearing previous timeout for booking ${bookingId}`);
          clearTimeout(existingTimeout);
          rescheduleTimeoutsRef.current.delete(bookingId);
        }

        // ✅ DEV ONLY: mock provider response after 30s (real response comes via Supabase notification)
        if (__DEV__) {
          const rescheduleTimeout = setTimeout(async () => {
            console.log(`[${providerName}] DEV: 30s mock provider response for booking ${bookingId}`);

            const response = generateDynamicRescheduleDates(currentMonth, capturedSelections);
            setProviderResponseMessage(response.message);
            setProviderNoAvailability(response.noAvailability);

            const mockAvailableDates = response.noAvailability
              ? []
              : response.dates.filter((d): d is { date: string; times: string[] } => d.date !== undefined);

            try {
              await providerRespondToReschedule(bookingId, mockAvailableDates);
            } catch (error) {
              console.error(`[${providerName}] DEV mock error for booking ${bookingId}:`, error);
            }

            rescheduleTimeoutsRef.current.delete(bookingId);
          }, 30000) as any;

          rescheduleTimeoutsRef.current.set(bookingId, rescheduleTimeout);
        }
      }
    } catch (error: any) {
      console.error('❌ Reschedule error:', error);
      Alert.alert('Error', 'Couldn\'t process the reschedule request. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedBooking, selectedDates, selectedRescheduleMonth, requestReschedule, confirmReschedule, providerRespondToReschedule]);

  // ✅ FIXED: Rating locks after first submission + re-enable scrolling
  const handleRatingSubmit = useCallback(async () => {
    if (!selectedBooking || rating === 0) {
      Alert.alert('Rating Required', 'Please select a rating before submitting.');
      return;
    }
    if (!user?.id) {
      Alert.alert('Error', 'You must be logged in to submit a review.');
      return;
    }

    setIsLoading(true);
    try {
      // The booking's stored provider UUID is the source of truth; the
      // display-name lookup is only a legacy fallback
      const providerId = selectedBooking.providerId
        ?? await getProviderIdByDisplayName(selectedBooking.providerName);

      if (providerId) {
        // Check not already reviewed
        const alreadyReviewed = await hasReviewedBooking(selectedBooking.id);
        if (!alreadyReviewed) {
          await submitReview({
            booking_id: selectedBooking.id,
            provider_id: providerId,
            service_id: null,
            user_id: user.id,
            rating,
            ...(reviewText.trim() ? { comment: reviewText.trim() } : {}),
          });
        }
      }

      // Mark as rated in local state
      setRatedBookings(prev => new Set(prev).add(selectedBooking.id));
      setHasRated(true);
      setIsLoading(false);

      setTimeout(() => {
        setShowRatingModal(false);
        setRating(0);
        setReviewText('');
        setTimeout(() => {
          mainScrollRef.current?.setNativeProps({ scrollEnabled: true });
          modalScrollRef.current?.setNativeProps({ scrollEnabled: true });
        }, 100);
      }, 2000);
    } catch (error) {
      Alert.alert('Error', 'Failed to submit rating.');
      setIsLoading(false);
    }
  }, [selectedBooking, rating, reviewText, user]);

  const handleSendMessage = useCallback(() => {
    if (!messageText.trim() || !selectedBooking) return;

    const newMessage = {
      id: `msg_${Date.now()}`,
      text: messageText.trim(),
      sender: 'user' as const,
      timestamp: new Date(),
    };

    // ✅ Update messages state
    setMessages(prev => [...prev, newMessage]);

    // ✅ Save to messageHistory for persistence
    setMessageHistory(prev => ({
      ...prev,
      [selectedBooking.id]: {
        messages: [...(prev[selectedBooking.id]?.messages || []), newMessage],
        appointmentDate: selectedBooking.bookingDate,
      },
    }));

    setMessageText('');

    setTimeout(() => {
      messageScrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messageText, selectedBooking]);

  // ✅ FIXED: Tip locks after submission with success modal
  const handleTipSubmit = useCallback(() => {
    if (!selectedBooking || tipAmount <= 0) {
      Alert.alert('Invalid Tip', 'Please enter a valid tip amount.');
      return;
    }

    if (__DEV__) console.log('Processing tip:', tipAmount);

    // ✅ Mark as tipped
    setTippedBookings(prev => new Set(prev).add(selectedBooking.id));
    setHasTipped(true);
    
    // Close tip modal and show success
    setShowTipModal(false);
    setSuccessMessage(`Thank you for tipping £${tipAmount.toFixed(2)}!`);
    setSuccessIcon('✓');
    setShowSuccessModal(true);
    
    // Reset tip amount after showing success
    setTimeout(() => {
      setTipAmount(0);
    }, 2000);
  }, [selectedBooking, tipAmount]);

  // Countdown ticker for address release
  useEffect(() => {
    if (!selectedBooking || selectedBooking.clientAddress) return;
    const policy = selectedBookingAddrSettings?.address_release_policy ?? null;
    if (!policy || policy === 'always' || policy === 'manual') return;

    const offsetDays: Record<string, number> = {
      on_confirmation: 0,
      day_before: 1,
      two_days_before: 2,
      three_days_before: 3,
      five_days_before: 5,
      week_before: 7,
    };
    const days = offsetDays[policy];
    if (days === undefined) return;

    const computeCountdown = () => {
      const appt = new Date(`${selectedBooking.bookingDate}T12:00:00`);
      const releaseAt = new Date(appt);
      releaseAt.setDate(releaseAt.getDate() - days);
      const diff = releaseAt.getTime() - Date.now();
      if (diff <= 0) { setAddrCountdown(''); return; }
      const totalHours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      if (totalHours >= 48) {
        setAddrCountdown(`${Math.ceil(diff / 86400000)} days`);
      } else if (totalHours >= 1) {
        setAddrCountdown(`${totalHours}h ${mins}m`);
      } else {
        setAddrCountdown(`${mins}m`);
      }
    };

    computeCountdown();
    const id = setInterval(computeCountdown, 60000);
    return () => clearInterval(id);
  }, [selectedBooking, selectedBookingAddrSettings]);

  const retryLoadBookings = useCallback(async () => {
    setRetrying(true);
    try {
      await reloadBookings();
      setBookingsError(null); // Only clear on success
    } catch (error) {
      setBookingsError('Failed to load bookings. Pull down to retry.');
    } finally {
      setRetrying(false);
    }
  }, [reloadBookings]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setBookingsError(null);
    try {
      await reloadBookings();

      // Refresh user location
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({});
          const newLocation = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };
          setUserLocation(newLocation);
          if (__DEV__) console.log('Location refreshed:', newLocation);

          // Center map on user location if no active bookings
          if (mapRef.current && !currentBooking) {
            mapRef.current.animateToRegion(
              {
                ...newLocation,
                latitudeDelta: 0.15,
                longitudeDelta: 0.15,
              },
              1000
            );
          }
        }
      } catch (locationError) {
        console.error('Error refreshing location:', locationError);
      }
    } catch (error) {
      console.error('Refresh failed:', error);
      setBookingsError('Failed to load bookings. Pull down to retry.');
    } finally {
      setRefreshing(false);
    }
  }, [reloadBookings, currentBooking]);

  // ==================== HEADER OPTIONS ====================

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: isFilterView ? 'My Bookings' : 'Track Appointment',
      headerShadowVisible: false,
      headerTransparent: true,
      headerBlurEffect: isDarkMode ? undefined : 'regular',
      headerLargeTitle: false,
      headerStyle: {
        backgroundColor: isDarkMode ? theme.background : 'transparent',
      },
      headerTitleStyle: {
        fontFamily: 'BakbakOne-Regular',
        fontSize: 22,
        color: theme.text,
      },
      headerTintColor: theme.text,
    });
  }, [navigation, isFilterView, theme, isDarkMode]);

  // ==================== EFFECTS ====================

  // Detect initial load failure from BookingContext
  useEffect(() => {
    reloadBookings().catch(() => {
      setBookingsError('Failed to load bookings. Pull down to retry.');
    });
  }, []);

  useEffect(() => {
    if (currentBooking?.coordinates && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: currentBooking.coordinates.latitude,
          longitude: currentBooking.coordinates.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        },
        1000
      );
    }
  }, [currentBooking]);

  // ✅ Request location permissions, get user location, and refresh every 1 minute
  // Uses a ref to avoid restarting the interval when currentBooking changes
  const currentBookingRef = useRef(currentBooking);
  currentBookingRef.current = currentBooking;

  useEffect(() => {
    let isMounted = true;

    const getUserLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted' && isMounted) {
          const location = await Location.getCurrentPositionAsync({});
          const newLocation = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };
          if (isMounted) {
            setUserLocation(newLocation);

            // Center map on user location if no active booking
            if (mapRef.current && !currentBookingRef.current) {
              mapRef.current.animateToRegion(
                {
                  ...newLocation,
                  latitudeDelta: 0.15,
                  longitudeDelta: 0.15,
                },
                1000
              );
            }
          }
        }
      } catch (error) {
        console.error('Error getting location:', error);
      }
    };

    getUserLocation();

    const locationInterval = setInterval(getUserLocation, 60000);

    return () => {
      isMounted = false;
      clearInterval(locationInterval);
    };
  }, []);

  // ✅ Cleanup all reschedule timeouts on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (__DEV__) console.log('Cleaning up all reschedule timeouts');
      rescheduleTimeoutsRef.current.forEach((timeout, bookingId) => {
        if (__DEV__) console.log(`Clearing timeout for booking ${bookingId}`);
        clearTimeout(timeout);
      });
      rescheduleTimeoutsRef.current.clear();
    };
  }, []);

  // ✅ Reset map to user area when all bookings are completed
  useEffect(() => {
    if (allTodayBookingsCompleted && mapRef.current && userLocation) {
      if (__DEV__) console.log('All bookings completed, centering map on user location');
      mapRef.current.animateToRegion(
        {
          ...userLocation,
          latitudeDelta: 0.15,
          longitudeDelta: 0.15,
        },
        1000
      );
    }
  }, [allTodayBookingsCompleted, userLocation]);

  // ✅ Handle route params - open specific booking from notifications
  useEffect(() => {
    if (route?.params?.openBookingId || route?.params?.highlightBookingId) {
      const bookingId = route.params.openBookingId || route.params.highlightBookingId;
      const shouldOpenReschedule = route.params.openReschedule;
      const shouldHighlight = !!route.params.highlightBookingId;

      if (__DEV__) console.log('BookingsScreen received params:', { bookingId, shouldOpenReschedule, shouldHighlight });

      // Find booking in all lists
      const allBookings = [
        ...(todayBookings || []),
        ...(upcomingBookings || []),
        ...(pastBookings || []),
      ];

      const booking = allBookings.find(b => b.id === bookingId);

      if (booking) {
        if (__DEV__) console.log('Found booking:', booking.id);

        // Auto-detect which tab the booking belongs to
        const isInPast = (pastBookings || []).some(b => b.id === bookingId);
        const correctTab: 'all' | 'past' = isInPast ? 'past' : 'all';
        if (__DEV__) console.log('Auto-detected tab:', correctTab);
        setActiveFilters(new Set([correctTab]));

        setSelectedBooking(booking);

        // Auto-expand the group card if this booking belongs to one
        if (booking.groupBookingId) {
          setExpandedGroups(prev => new Set(prev).add(booking.groupBookingId!));
        }

        // Set highlight state for smart scroll and highlight animation
        if (shouldHighlight) {
          setHighlightedBookingId(bookingId!);
          // Clear highlight after animation completes
          setTimeout(() => {
            setHighlightedBookingId(null);
          }, 3000);
        }

        // Scroll to the booking's service category using mainScrollRef
        setTimeout(() => {
          if (mainScrollRef.current) {
            mainScrollRef.current.scrollTo({
              y: 200,
              animated: true,
            });
            if (__DEV__) console.log('Scrolled to bookings section');
          }
        }, 400);

        // Small delay to ensure view is switched, then navigate to the detail/reschedule screen
        setTimeout(async () => {
          if (shouldOpenReschedule) {
            // Sync active reschedule request from Supabase before navigating
            if (!booking.rescheduleRequest?.providerAvailableDates) {
              try {
                const dbReq = await getActiveRescheduleRequest(booking.id);
                if (dbReq?.status === 'provider_responded' && (dbReq.provider_available_slots ?? []).length > 0) {
                  await providerRespondToReschedule(booking.id, dbReq.provider_available_slots!);
                }
              } catch {}
            }
            if (__DEV__) console.log('Navigating to Reschedule screen');
            navigation.navigate('Reschedule', { bookingId: booking.id });
          } else if (route.params?.openBookingId) {
            if (__DEV__) console.log('Navigating to BookingDetail screen');
            navigation.navigate('BookingDetail', { bookingId: booking.id });
          }
        }, 500);

        // Clear params after handling
        navigation.setParams({ openBookingId: undefined, openReschedule: undefined, highlightBookingId: undefined, initialTab: undefined } as any);
      } else {
        console.warn('⚠️ Booking not found:', bookingId);
      }
    } else if (route?.params?.initialTab) {
      // Fallback: handle initialTab when no bookingId (e.g. generic "view past bookings")
      if (__DEV__) console.log('BookingsScreen: switching to tab:', route.params.initialTab);
      setActiveFilters(new Set([route.params.initialTab]));
      navigation.setParams({ initialTab: undefined } as any);
    }
  }, [route?.params?.openBookingId, route?.params?.openReschedule, route?.params?.highlightBookingId, route?.params?.initialTab, todayBookings, upcomingBookings, pastBookings, filteredUpcomingBookings, navigation, providerRespondToReschedule]);

  // ✅ Update selectedBooking ONLY when modal is visible and booking state changes
  // Use ref to track last update to prevent infinite loops
  const lastBookingUpdateRef = useRef<string>('');

  useEffect(() => {
    if (!modalVisible || !selectedBooking) {
      return;
    }

    const updatedBooking = [...todayBookings, ...upcomingBookings, ...pastBookings].find(
      b => b.id === selectedBooking.id
    );

    if (!updatedBooking) {
      return;
    }

    // ✅ Create unique state signature to detect REAL changes only
    const newStateSignature = `${updatedBooking.id}|${updatedBooking.isPendingReschedule}|${updatedBooking.rescheduleRequest?.providerAvailableDates?.length || 0}|${updatedBooking.bookingDate}|${updatedBooking.bookingTime}`;

    // ✅ Only update if state signature actually changed (prevents re-render loops)
    if (lastBookingUpdateRef.current !== newStateSignature) {
      const oldSignature = lastBookingUpdateRef.current.split('|');
      const wasPending = oldSignature[1] === 'true';
      const oldDatesCount = parseInt(oldSignature[2] || '0');
      const isPending = updatedBooking.isPendingReschedule || false;
      const datesCount = updatedBooking.rescheduleRequest?.providerAvailableDates?.length || 0;
      const hasDatesObject = !!updatedBooking.rescheduleRequest?.providerAvailableDates;

      if (__DEV__) console.log(`[${updatedBooking.providerName}] Booking ${updatedBooking.id} state update:`, {
        from: `${wasPending ? (oldDatesCount > 0 ? 'AVAILABLE' : 'PENDING') : 'UPCOMING'}`,
        to: `${isPending ? (datesCount > 0 ? 'AVAILABLE' : 'PENDING') : 'UPCOMING'}`,
        dates: `${oldDatesCount} → ${datesCount}`,
        hasDatesObject,
        signature: {
          old: lastBookingUpdateRef.current,
          new: newStateSignature
        }
      });

      lastBookingUpdateRef.current = newStateSignature;
      setSelectedBooking(updatedBooking);
    }
  }, [todayBookings, upcomingBookings, pastBookings, modalVisible, selectedBooking?.id]);

  // ✅ Load message history when message modal opens
  useEffect(() => {
    if (showMessageModal && selectedBooking) {
      // Load existing messages from history
      const history = messageHistory[selectedBooking.id];
      if (history && history.messages.length > 0) {
        setMessages(history.messages);
        // Scroll to bottom after loading
        setTimeout(() => {
          messageScrollRef.current?.scrollToEnd({ animated: true });
        }, 100);
      } else {
        // Clear stale messages from a previously opened booking
        setMessages([]);
      }
    }
  }, [showMessageModal, selectedBooking, messageHistory]);

  // ✅ Track recently added bookings (created within last 24 hours)
  useEffect(() => {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const allBookings = [...(todayBookings || []), ...(upcomingBookings || [])];
    const recentIds = new Set<string>();

    allBookings.forEach(booking => {
      const createdAt = new Date(booking.createdAt);
      if (createdAt >= twentyFourHoursAgo) {
        recentIds.add(booking.id);
      }
    });

    setRecentlyAddedBookings(recentIds);
  }, [todayBookings, upcomingBookings]);

  // ==================== COMPUTED VALUES ====================

  const routeCoordinates = useMemo(
    () => todayBookings.map(b => b.coordinates).filter(Boolean) as { latitude: number; longitude: number }[],
    [todayBookings]
  );

  const listItems = useMemo((): GroupedListItem[] => {
    let source: ConfirmedBooking[] = [];
    if (activeFilters.has('all')) source = [...source, ...filteredUpcomingBookings];
    if (activeFilters.has('past')) source = [...source, ...filteredPastBookings];

    const categoryMap = new Map<string, ConfirmedBooking[]>();
    for (const b of source) {
      const cat = resolveServiceCategory(b.serviceName, b.providerService);
      const arr = categoryMap.get(cat) ?? [];
      arr.push(b);
      categoryMap.set(cat, arr);
    }

    const items: GroupedListItem[] = [];
    for (const [serviceType, bookings] of categoryMap) {
      items.push({ kind: 'category', serviceType, bookings });
    }
    return items;
  }, [activeFilters, filteredUpcomingBookings, filteredPastBookings]);

  // ✅ Check if booking has been rated or tipped
  const hasBookingBeenRated = useCallback((bookingId: string) => ratedBookings.has(bookingId), [ratedBookings]);
  const hasBookingBeenTipped = useCallback((bookingId: string) => tippedBookings.has(bookingId), [tippedBookings]);

  // ==================== RENDER ====================

  return (
    <ThemedBackground>
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        {/* ✅ SINGLE SCROLLVIEW - NO NESTING */}
        <ScrollView
          ref={mainScrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { flexGrow: 1, paddingBottom: isFilterView ? 120 : 40 }]}
          bounces={true}
          scrollEnabled={true}
          nestedScrollEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#AF9197"
              colors={['#AF9197']}
              progressBackgroundColor={isDarkMode ? '#201D1A' : '#EDE8E2'}
              progressViewOffset={60}
            />
          }
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={false}
          scrollEventThrottle={16}
          onScrollBeginDrag={() => Keyboard.dismiss()}
        >
          <View style={styles.content}>
            {/* Refresh indicator — the native RefreshControl spinner sits behind
                the transparent header and is easy to miss, so mirror its state
                here in the always-visible content area just below the header. */}
            {refreshing && (
              <View style={styles.refreshIndicatorRow}>
                <ActivityIndicator size="small" color="#AF9197" />
              </View>
            )}

            {/* Category Toggle */}
            <View style={styles.categoryContainer}>
              <TouchableOpacity
                onPress={() => toggleFilter('all')}
                style={styles.categoryButtonWrapper}
              >
                <BlurView
                  intensity={25}
                  tint={isDarkMode ? 'dark' : 'light'}
                  style={[
                    styles.categoryButton,
                    activeFilters.has('all') && styles.categoryButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      activeFilters.has('all') && styles.categoryTextActive,
                    ]}
                  >
                    Upcoming
                  </Text>
                </BlurView>
              </TouchableOpacity>

              {/* TEMPORARY — testing-only dev menu access, triple-tap. See
                  removal note on HiddenDevMenuTrigger's definition above. */}
              <HiddenDevMenuTrigger navigation={navigation} />

              <TouchableOpacity
                onPress={() => toggleFilter('past')}
                style={styles.categoryButtonWrapper}
              >
                <BlurView
                  intensity={25}
                  tint={isDarkMode ? 'dark' : 'light'}
                  style={[
                    styles.categoryButton,
                    activeFilters.has('past') && styles.categoryButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      activeFilters.has('past') && styles.categoryTextActive,
                    ]}
                  >
                    Past Bookings
                  </Text>
                </BlurView>
              </TouchableOpacity>
            </View>
            {/* Tracking View */}
            {!isFilterView && (
              <>
                <View style={styles.mapContainer}>
                  <MapView
                    ref={mapRef}
                    style={styles.map}
                    initialRegion={{
                      latitude: currentBooking?.coordinates?.latitude ?? userLocation?.latitude ?? 51.5074,
                      longitude: currentBooking?.coordinates?.longitude ?? userLocation?.longitude ?? -0.1278,
                      latitudeDelta: 0.15,
                      longitudeDelta: 0.15,
                    }}
                    mapType="standard"
                    showsUserLocation={true}
                    showsMyLocationButton={false}
                    showsCompass={false}
                    zoomEnabled={true}
                    scrollEnabled={true}
                    pitchEnabled={false}
                    rotateEnabled={false}
                  >
                    {todayBookings.length > 0 && !allTodayBookingsCompleted ? (
                      <>
                        {todayBookings.filter(b => b.coordinates).map(booking => (
                          <Marker
                            key={booking.id}
                            coordinate={booking.coordinates}
                            title={booking.serviceName}
                            description={booking.providerName}
                            onPress={() => focusMapOnLocation(booking.coordinates)}
                          >
                            <View
                              style={[
                                styles.serviceMarker,
                                booking.id === currentBooking?.id && styles.activeServiceMarker,
                              ]}
                            >
                              <View style={styles.markerContent}>
                                <Text
                                  style={[
                                    styles.serviceLabel,
                                    booking.id === currentBooking?.id && styles.activeServiceLabel,
                                  ]}
                                >
                                  {booking.providerService.toUpperCase()}
                                </Text>
                                <Text style={styles.serviceDuration}> • {booking.duration}</Text>
                              </View>
                              {booking.id === currentBooking?.id && (
                                <View style={styles.activeMarkerDot} />
                              )}
                            </View>
                          </Marker>
                        ))}
                        {routeCoordinates.length > 1 && (
                          <Polyline
                            coordinates={routeCoordinates}
                            strokeColor="#AF9197"
                            strokeWidth={3}
                            lineDashPattern={[5, 5]}
                          />
                        )}
                      </>
                    ) : (
                      <Marker
                        coordinate={{ latitude: userLocation?.latitude ?? 51.5074, longitude: userLocation?.longitude ?? -0.1278 }}
                        title="No appointments today"
                      >
                        <View style={styles.serviceMarker}>
                          <Text style={styles.serviceLabel}>YOUR AREA</Text>
                        </View>
                      </Marker>
                    )}
                  </MapView>
                </View>

                {todayBookings.length > 0 ? (
                  <>
                    {allTodayBookingsCompleted ? (
                      <View style={styles.upcomingSection}>
                        <BlurView intensity={25} tint={isDarkMode ? 'dark' : 'light'} style={styles.sectionLabel}>
                          <Text style={styles.congratsLabelText}>
                            🎉 CONGRATULATIONS! ALL BOOKINGS COMPLETED 🎉
                          </Text>
                        </BlurView>
                        <FlatList
                          data={todayBookings}
                          keyExtractor={booking => booking.id}
                          renderItem={({ item: booking }) => (
                            <TouchableOpacity
                              style={styles.appointmentCard}
                              onPress={() => booking.coordinates && focusMapOnLocation(booking.coordinates)}
                              activeOpacity={0.8}
                            >
                              <BlurView intensity={15} tint={isDarkMode ? 'dark' : 'light'} style={styles.cardBlur}>
                                <View style={styles.cardContent}>
                                  <View style={styles.appointmentInfo}>
                                    <Text style={styles.appointmentService}>
                                      {booking.serviceName}
                                    </Text>
                                    <Text style={styles.appointmentProvider}>
                                      {formatDisplayDate(booking.bookingDate)} • {booking.bookingTime}
                                    </Text>
                                    <Text style={styles.appointmentProvider}>
                                      {booking.providerName} - {booking.status.replace('_', ' ')}
                                    </Text>
                                  </View>
                                  <View style={styles.actionButtons}>
                                    <TouchableOpacity
                                      style={[
                                        styles.rateButton,
                                        hasBookingBeenRated(booking.id) && styles.buttonDisabled
                                      ]}
                                      onPress={() => {
                                        if (hasBookingBeenRated(booking.id)) {
                                          Alert.alert('Already Rated', 'You have already rated this appointment.');
                                          return;
                                        }
                                        setSelectedBooking(booking);
                                        setShowRatingModal(true);
                                      }}
                                      disabled={hasBookingBeenRated(booking.id)}
                                    >
                                      <Text style={styles.buttonText}>
                                        {hasBookingBeenRated(booking.id) ? 'Rated ✓' : 'Rate'}
                                      </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={[
                                        styles.tipButton,
                                        hasBookingBeenTipped(booking.id) && styles.buttonDisabled
                                      ]}
                                      onPress={() => {
                                        if (hasBookingBeenTipped(booking.id)) {
                                          Alert.alert('Already Tipped', 'You have already tipped for this appointment.');
                                          return;
                                        }
                                        setSelectedBooking(booking);
                                        setShowTipModal(true);
                                      }}
                                      disabled={hasBookingBeenTipped(booking.id)}
                                    >
                                      <Text style={styles.buttonText}>
                                        {hasBookingBeenTipped(booking.id) ? 'Tipped ✓' : 'Tip'}
                                      </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={styles.bookAgainButton}
                                      onPress={() => handleRebook(booking)}
                                    >
                                      <Text style={styles.buttonTextWhite}>Book Again</Text>
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              </BlurView>
                            </TouchableOpacity>
                          )}
                          scrollEnabled={false}
                        />
                      </View>
                    ) : (
                      <>
                        {currentBooking && (
                          <View style={styles.upcomingSection}>
                            <BlurView intensity={25} tint={isDarkMode ? 'dark' : 'light'} style={styles.sectionLabel}>
                              <Text style={styles.upcomingLabelText}>UPCOMING</Text>
                            </BlurView>
                            <TouchableOpacity
                              style={styles.appointmentCard}
                              onPress={() => focusMapOnLocation(currentBooking.coordinates)}
                              activeOpacity={0.8}
                            >
                              <BlurView intensity={15} tint={isDarkMode ? 'dark' : 'light'} style={styles.cardBlur}>
                                <View style={styles.cardContent}>
                                  <View style={styles.appointmentInfo}>
                                    <Text style={styles.appointmentService}>
                                      {currentBooking.serviceName}
                                    </Text>
                                    <Text style={styles.appointmentProvider}>
                                      {formatDisplayDate(currentBooking.bookingDate)} • {currentBooking.bookingTime}
                                    </Text>
                                    <Text style={styles.appointmentProvider}>
                                      {currentBooking.providerName} - {currentBooking.status.replace('_', ' ')}
                                    </Text>
                                    {currentBooking.status !== BookingStatus.COMPLETED && (
                                      <Text style={styles.appointmentAddress}>
                                        {currentBooking.address}
                                      </Text>
                                    )}
                                  </View>
                                  <View style={styles.actionButtons}>
                                    {currentBooking.status === BookingStatus.COMPLETED ? (
                                      <>
                                        {/* ✅ RATE BUTTON - CHECK IF ALREADY RATED */}
                                        <TouchableOpacity
                                          style={[
                                            styles.rateButton,
                                            hasBookingBeenRated(currentBooking.id) && styles.buttonDisabled
                                          ]}
                                          onPress={() => {
                                            if (hasBookingBeenRated(currentBooking.id)) {
                                              Alert.alert('Already Rated', 'You have already rated this appointment.');
                                              return;
                                            }
                                            setSelectedBooking(currentBooking);
                                            setShowRatingModal(true);
                                          }}
                                          disabled={hasBookingBeenRated(currentBooking.id)}
                                        >
                                          <Text style={styles.buttonText}>
                                            {hasBookingBeenRated(currentBooking.id) ? 'Rated ✓' : 'Rate'}
                                          </Text>
                                        </TouchableOpacity>
                                        {/* ✅ TIP BUTTON - CHECK IF ALREADY TIPPED */}
                                        <TouchableOpacity
                                          style={[
                                            styles.tipButton,
                                            hasBookingBeenTipped(currentBooking.id) && styles.buttonDisabled
                                          ]}
                                          onPress={() => {
                                            if (hasBookingBeenTipped(currentBooking.id)) {
                                              Alert.alert('Already Tipped', 'You have already tipped for this appointment.');
                                              return;
                                            }
                                            setSelectedBooking(currentBooking);
                                            setShowTipModal(true);
                                          }}
                                          disabled={hasBookingBeenTipped(currentBooking.id)}
                                        >
                                          <Text style={styles.buttonText}>
                                            {hasBookingBeenTipped(currentBooking.id) ? 'Tipped ✓' : 'Tip'}
                                          </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                          style={styles.bookAgainButton}
                                          onPress={() => handleRebook(currentBooking)}
                                        >
                                          <Text style={styles.buttonTextWhite}>Book Again</Text>
                                        </TouchableOpacity>
                                      </>
                                    ) : (
                                      <>
                                        <TouchableOpacity
                                          style={styles.directionsButton}
                                          onPress={() => openInMaps(currentBooking)}
                                        >
                                          <Text style={styles.buttonText}>Directions</Text>
                                        </TouchableOpacity>
                                        {isMessagingAvailable(currentBooking.bookingDate) && (
                                          <TouchableOpacity
                                            style={styles.messageButton}
                                            onPress={() => openContactSheet(currentBooking)}
                                          >
                                            <Text style={styles.buttonText}>Contact</Text>
                                          </TouchableOpacity>
                                        )}
                                      </>
                                    )}
                                  </View>
                                </View>
                              </BlurView>
                            </TouchableOpacity>
                          </View>
                        )}
                        {nextBookings.length > 0 && (
                          <View style={styles.nextSection}>
                            <BlurView intensity={25} tint={isDarkMode ? 'dark' : 'light'} style={styles.sectionLabel}>
                              <Text style={styles.nextLabelText}>NEXT</Text>
                            </BlurView>
                            <FlatList
                              data={nextBookings}
                              keyExtractor={booking => booking.id}
                              renderItem={({ item: booking }) => (
                                <TouchableOpacity
                                  style={styles.nextAppointmentCard}
                                  onPress={() => focusMapOnLocation(booking.coordinates)}
                                  activeOpacity={0.8}
                                >
                                  <BlurView intensity={15} tint={isDarkMode ? 'dark' : 'light'} style={styles.cardBlur}>
                                    <View style={styles.cardContent}>
                                      <View style={styles.appointmentInfo}>
                                        <Text style={styles.nextAppointmentService}>
                                          {booking.serviceName}
                                        </Text>
                                        <Text style={styles.nextAppointmentProvider}>
                                          {formatDisplayDate(booking.bookingDate)} • {booking.bookingTime}
                                        </Text>
                                        <Text style={styles.nextAppointmentProvider}>
                                          {booking.providerName} - {booking.duration}
                                        </Text>
                                        {booking.status !== BookingStatus.COMPLETED && (
                                          <Text style={styles.nextAppointmentAddress}>
                                            {booking.address}
                                          </Text>
                                        )}
                                      </View>
                                      <View style={styles.actionButtons}>
                                        {booking.status === BookingStatus.COMPLETED ? (
                                          <>
                                            <TouchableOpacity
                                              style={[
                                                styles.rateButton,
                                                hasBookingBeenRated(booking.id) && styles.buttonDisabled
                                              ]}
                                              onPress={() => {
                                                if (hasBookingBeenRated(booking.id)) {
                                                  Alert.alert('Already Rated', 'You have already rated this appointment.');
                                                  return;
                                                }
                                                setSelectedBooking(booking);
                                                setShowRatingModal(true);
                                              }}
                                              disabled={hasBookingBeenRated(booking.id)}
                                            >
                                              <Text style={styles.buttonText}>
                                                {hasBookingBeenRated(booking.id) ? 'Rated ✓' : 'Rate'}
                                              </Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                              style={[
                                                styles.tipButton,
                                                hasBookingBeenTipped(booking.id) && styles.buttonDisabled
                                              ]}
                                              onPress={() => {
                                                if (hasBookingBeenTipped(booking.id)) {
                                                  Alert.alert('Already Tipped', 'You have already tipped for this appointment.');
                                                  return;
                                                }
                                                setSelectedBooking(booking);
                                                setShowTipModal(true);
                                              }}
                                              disabled={hasBookingBeenTipped(booking.id)}
                                            >
                                              <Text style={styles.buttonText}>
                                                {hasBookingBeenTipped(booking.id) ? 'Tipped ✓' : 'Tip'}
                                              </Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                              style={styles.bookAgainButton}
                                              onPress={() => handleRebook(booking)}
                                            >
                                              <Text style={styles.buttonTextWhite}>Book Again</Text>
                                            </TouchableOpacity>
                                          </>
                                        ) : (
                                          <>
                                            <TouchableOpacity
                                              style={styles.directionsButton}
                                              onPress={() => openInMaps(booking)}
                                            >
                                              <Text style={styles.buttonText}>Directions</Text>
                                            </TouchableOpacity>
                                            {isMessagingAvailable(booking.bookingDate) && (
                                              <TouchableOpacity
                                                style={styles.messageButton}
                                                onPress={() => openContactSheet(booking)}
                                              >
                                                <Text style={styles.buttonText}>Contact</Text>
                                              </TouchableOpacity>
                                            )}
                                          </>
                                        )}
                                      </View>
                                    </View>
                                  </BlurView>
                                </TouchableOpacity>
                              )}
                              scrollEnabled={false}
                              removeClippedSubviews={true}
                              maxToRenderPerBatch={3}
                              windowSize={3}
                              initialNumToRender={3}
                            />
                          </View>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>No appointments scheduled for today</Text>
                    <Text style={styles.emptyStateSubtext}>
                      View Upcoming to see your next appointments
                    </Text>
                  </View>
                )}
              </>
            )}

            {/* All/Past Bookings View */}
            {isFilterView && (
              <View style={styles.bookingsContainer}>
                <TouchableOpacity
                  onPress={() => setActiveFilters(new Set())}
                  style={styles.backToTrackingButton}
                >
                  <Text style={styles.backToTrackingText}>← Back to Tracking</Text>
                </TouchableOpacity>
                <Text style={styles.bookingsTitle}>
                  {activeFilters.has('all') && activeFilters.has('past')
                    ? 'ALL BOOKINGS'
                    : activeFilters.has('all')
                      ? 'UPCOMING BOOKINGS'
                      : 'PAST BOOKINGS'}
                </Text>
                {bookingsError && (
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: 'rgba(244, 67, 54, 0.12)',
                    borderWidth: 1,
                    borderColor: 'rgba(244, 67, 54, 0.3)',
                    borderRadius: 12,
                    marginHorizontal: 4,
                    marginBottom: 12,
                    marginTop: 8,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                  }}>
                    <Text style={{ color: '#D32F2F', fontSize: 13, fontWeight: '500', flex: 1 }}>
                      {retrying ? 'Reloading bookings...' : bookingsError}
                    </Text>
                    {retrying ? (
                      <ActivityIndicator size="small" color="#D32F2F" style={{ marginLeft: 12 }} />
                    ) : (
                      <TouchableOpacity onPress={retryLoadBookings}>
                        <Text style={{ color: '#D32F2F', fontSize: 13, fontWeight: 'bold', marginLeft: 12 }}>Retry</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
                {listItems.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>
                      {activeFilters.has('all') && activeFilters.has('past')
                        ? 'No bookings'
                        : activeFilters.has('all')
                          ? 'No upcoming bookings'
                          : 'No past bookings'}
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    ref={bookingsListRef}
                    data={listItems}
                    keyExtractor={(item) => item.serviceType}
                    onScrollToIndexFailed={(info) => {
                      console.warn('Scroll to index failed:', info);
                      bookingsListRef.current?.scrollToOffset({
                        offset: info.averageItemLength * info.index,
                        animated: true,
                      });
                    }}
                    renderItem={({ item }) => {
                      const { serviceType, bookings } = item;
                      const rowHasTag = bookings.some((b: ConfirmedBooking) => b.isPendingReschedule);
                      return (
                        <View style={styles.serviceCategory}>
                          <View style={styles.serviceCategoryHeader}>
                            <View style={styles.serviceCategoryTag}>
                              <Text style={styles.serviceCategoryName}>
                                {serviceType.toUpperCase()}
                              </Text>
                            </View>
                          </View>
                          <FlatList
                            horizontal
                            data={bookings}
                            keyExtractor={booking => booking.id}
                            renderItem={({ item: booking }) => (
                              <BookingCard
                                booking={booking}
                                onPress={handleBookingPress}
                                isHighlighted={highlightedBookingId === booking.id}
                                isRecentlyAdded={recentlyAddedBookings.has(booking.id)}
                                actionCount={bookingActionItems[booking.id] ?? 0}
                                rowHasTag={rowHasTag}
                              />
                            )}
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.serviceImagesContainer}
                            removeClippedSubviews={true}
                            maxToRenderPerBatch={5}
                            windowSize={5}
                            initialNumToRender={3}
                            getItemLayout={(_data, index) => ({
                              length: 144,
                              offset: 144 * index,
                              index,
                            })}
                          />
                        </View>
                      );
                    }}
                    showsVerticalScrollIndicator={false}
                    scrollEnabled={false}
                    removeClippedSubviews={true}
                    maxToRenderPerBatch={3}
                    windowSize={5}
                    initialNumToRender={2}
                    updateCellsBatchingPeriod={50}
                    contentContainerStyle={styles.flatListContent}
                  />
                )}
              </View>
            )}
          {/* Waitlist Section */}
          {waitlistEntries.length > 0 && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
              <Text style={[styles.bookingsTitle, { marginTop: 24, marginBottom: 12 }]}>ON WAITLIST</Text>
              {waitlistEntries.map(entry => (
                <View
                  key={entry.id}
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: theme.border ?? 'rgba(126,102,103,0.14)',
                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(175,145,151,0.08)',
                    padding: 16,
                    marginBottom: 10,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: 'BakbakOne', fontSize: 15, color: theme.text, marginBottom: 2 }}>
                        {entry.service_name_snapshot}
                      </Text>
                      <Text style={{ fontFamily: 'Jura-Regular', fontSize: 12, color: theme.secondaryText, marginBottom: 8 }}>
                        {entry.provider_name_snapshot}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <View style={{
                          backgroundColor: entry.status === 'notified' ? 'rgba(52,199,89,0.15)' : 'rgba(255,149,0,0.15)',
                          borderRadius: 10,
                          paddingHorizontal: 10,
                          paddingVertical: 3,
                        }}>
                          <Text style={{
                            fontFamily: 'BakbakOne',
                            fontSize: 10,
                            letterSpacing: 0.4,
                            color: entry.status === 'notified' ? '#34C759' : '#FF9500',
                          }}>
                            {entry.status === 'notified' ? 'SLOT OPENED' : `#${entry.position} IN QUEUE`}
                          </Text>
                        </View>
                      </View>
                    </View>
                    {entry.status === 'notified' && (
                      <TouchableOpacity
                        style={{
                          backgroundColor: '#AF9197',
                          borderRadius: 20,
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          marginLeft: 12,
                        }}
                        onPress={() => navigation.navigate('ProviderProfile', { providerId: entry.provider_id })}
                        activeOpacity={0.8}
                      >
                        <Text style={{ fontFamily: 'BakbakOne', fontSize: 11, color: '#fff' }}>Book Now</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <TouchableOpacity
                    style={{ marginTop: 10, alignSelf: 'flex-start' }}
                    onPress={() => {
                      WaitlistService.leaveWaitlist(entry.id).then(() => {
                        setWaitlistEntries(prev => prev.filter(e => e.id !== entry.id));
                      }).catch(() => {});
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontFamily: 'Jura-Regular', fontSize: 11, color: theme.secondaryText, textDecorationLine: 'underline' }}>
                      Leave waitlist
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          </View>
        </ScrollView>

      </SafeAreaView>
    </ThemedBackground>
  );
}
// ==================== STYLES ====================

const createStyles = (theme: Theme, isDarkMode: boolean) => StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  content: {
    flex: 1,
    paddingTop: 150,
  },
  refreshIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -6,
    marginBottom: 12,
  },
  header: {
    marginBottom: 20,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 1,
  },
  headerTitle: {
    fontFamily: 'BakbakOne',
    fontSize: 28,
    color: isDarkMode ? '#FFFFFF' : '#000',
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 4,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    color: isDarkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)',
    textAlign: 'center',
  },
  categoryContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  categoryButtonWrapper: {
    flex: 1,
  },
  categoryButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: isDarkMode ? 'rgba(126,102,103,0.18)' : 'rgba(126,102,103,0.14)',
    overflow: 'hidden',
    backgroundColor: isDarkMode ? '#201D1A' : '#EDE8E2',
  },
  categoryButtonActive: {
    backgroundColor: '#AF9197',
    borderColor: '#AF9197',
  },
  categoryText: {
    fontFamily: 'BakbakOne',
    fontSize: 12,
    color: isDarkMode ? '#F0ECE7' : '#000000',
    letterSpacing: 1,
    fontWeight: '800',
  },
  categoryTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  mapContainer: {
    height: 300,
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 25,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  map: {
    flex: 1,
  },
  serviceMarker: {
    backgroundColor: isDarkMode ? '#2C2C2E' : '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(175, 145, 151, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  activeServiceMarker: {
    borderColor: '#AF9197',
    borderWidth: 3,
  },
  markerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  serviceLabel: {
    fontFamily: 'BakbakOne',
    fontSize: 11,
    color: isDarkMode ? '#FFFFFF' : '#000',
    letterSpacing: 1,
  },
  serviceDuration: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 9,
    color: isDarkMode ? 'rgba(255,255,255,0.7)' : '#666',
    fontWeight: '600',
  },
  activeServiceLabel: {
    color: '#AF9197',
  },
  activeMarkerDot: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 12,
    height: 12,
    backgroundColor: '#AF9197',
    borderRadius: 6,
    borderWidth: 2,
    borderColor: isDarkMode ? '#201D1A' : '#fff',
  },
  upcomingSection: {
    marginHorizontal: 20,
    marginBottom: 16,
  },
  nextSection: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  sectionLabel: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  upcomingLabelText: {
    fontFamily: 'BakbakOne',
    fontSize: 12,
    color: '#AF9197',
    letterSpacing: 1,
    fontWeight: '800',
  },
  nextLabelText: {
    fontFamily: 'BakbakOne',
    fontSize: 12,
    color: isDarkMode ? '#FFFFFF' : '#000',
    letterSpacing: 1,
    fontWeight: '800',
  },
  congratsLabelText: {
    fontFamily: 'BakbakOne',
    fontSize: 11,
    color: isDarkMode ? '#FFFFFF' : '#000000ff',
    letterSpacing: 0.5,
    fontWeight: '900',
    textAlign: 'center',
  },
  appointmentCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.6)',
    borderLeftColor: 'rgba(255, 255, 255, 0.5)',
    borderRightColor: 'rgba(255, 255, 255, 0.3)',
    borderBottomColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  nextAppointmentCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1.5,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.6)',
    borderLeftColor: 'rgba(255, 255, 255, 0.5)',
    borderRightColor: 'rgba(255, 255, 255, 0.3)',
    borderBottomColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardBlur: {
    padding: 20,
    overflow: 'hidden',
    backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.1)',
  },
  cardContent: {
    flexDirection: 'column',
    gap: 16,
  },
  appointmentInfo: {
    flex: 1,
  },
  appointmentService: {
    fontFamily: 'BakbakOne',
    fontSize: 16,
    color: isDarkMode ? '#FFFFFF' : '#000',
    marginBottom: 4,
    letterSpacing: 0.5,
    fontWeight: 'bold',
  },
  appointmentProvider: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 13,
    color: isDarkMode ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)',
    marginBottom: 4,
    fontWeight: '600',
  },
  appointmentAddress: {
    fontFamily: 'BakbakOne-Regular',
    fontWeight: '400',
    fontSize: 12,
    color: '#AF9197',
    fontStyle: 'italic',
  },
  nextAppointmentService: {
    fontFamily: 'BakbakOne',
    fontSize: 14,
    color: isDarkMode ? '#FFFFFF' : '#000',
    marginBottom: 4,
    fontWeight: 'bold',
  },
  nextAppointmentProvider: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 12,
    color: isDarkMode ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)',
    marginBottom: 4,
    fontWeight: '600',
  },
  nextAppointmentAddress: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 11,
    color: isDarkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)',
    fontStyle: 'italic',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  directionsButton: {
    flex: 1,
    backgroundColor: '#87c5f850',
    borderColor: '#4e94cdff',
    borderWidth: 1,
    borderStyle: 'solid',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  messageButton: {
    flex: 1,
    backgroundColor: '#39be3d41',
    borderColor: '#2a972cff',
    borderWidth: 1,
    borderStyle: 'solid',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  rateButton: {
    flex: 1,
    backgroundColor: 'rgba(175,145,151,0.18)',
    borderColor: '#AF9197',
    borderWidth: 1,
    borderStyle: 'solid',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  tipButton: {
    flex: 1,
    backgroundColor: '#4CAF5050',
    borderColor: '#2b6a2eff',
    borderWidth: 1,
    borderStyle: 'solid',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  bookAgainButton: {
    flex: 1,
    backgroundColor: '#f28f0c58',
    borderColor: '#b9550dff',
    borderWidth: 1,
    borderStyle: 'solid',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },

  // ✅ DISABLED BUTTON STATE
  buttonDisabled: {
    opacity: 0.5,
    backgroundColor: isDarkMode ? '#48484A' : '#E0E0E0',
  },
  buttonText: {
    fontFamily: 'BakbakOne',
    fontSize: 9,
    color: isDarkMode ? '#FFFFFF' : '#000',
    fontWeight: 'bold',
  },
  buttonTextWhite: {
    fontFamily: 'BakbakOne',
    fontSize: 9,
    color: isDarkMode ? '#FFFFFF' : '#000',
    fontWeight: 'bold',
  },
  bookingsContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  backToTrackingButton: {
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  backToTrackingText: {
    fontFamily: 'BakbakOne',
    fontSize: 14,
    color: '#2196F3',
    fontWeight: '800',
  },
  bookingsTitle: {
    fontFamily: 'BakbakOne',
    fontSize: 18,
    color: isDarkMode ? '#FFFFFF' : '#000',
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: 1,
    fontWeight: '800',
  },
  serviceCategory: {
    marginBottom: 24,
  },
  serviceCategoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  serviceCategoryTag: {
    backgroundColor: isDarkMode ? '#E0E0E0' : '#000',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  serviceCategoryName: {
    fontFamily: 'BakbakOne',
    fontSize: 12,
    color: isDarkMode ? '#000' : '#fff',
    letterSpacing: 1,
  },
  serviceImagesContainer: {
    gap: 8,
  },
  providerCard: {
    width: 142,
    backgroundColor: isDarkMode ? '#2C2C2E' : '#FFF',
    borderRadius: 15,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  },
  providerLogo: {
    width: '100%',
    height: 92,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    backgroundColor: isDarkMode ? '#3A3A3C' : '#F5F5F5',
  },
  // Fixed height (not auto) so every card in the row is the same height
  // regardless of which optional bits (add-on pill) render. Status is now a
  // dot on the image instead of a text pill, so this no longer reserves
  // space for a badge row.
  providerInfo: {
    padding: 9,
    height: 96,
  },
  providerName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: isDarkMode ? '#F0F0F0' : '#333',
    marginBottom: 2,
  },
  providerService: {
    fontSize: 11,
    color: isDarkMode ? 'rgba(255,255,255,0.7)' : '#666',
    marginBottom: 3,
  },
  cardAddOnPill: {
    alignSelf: 'flex-start',
    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginBottom: 3,
  },
  cardAddOnPillText: {
    fontSize: 9,
    color: isDarkMode ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.4)',
    letterSpacing: 0.2,
  },
  appointmentTime: {
    marginTop: 4,
  },
  appointmentDate: {
    fontSize: 10,
    color: isDarkMode ? 'rgba(255,255,255,0.5)' : '#999',
  },
  appointmentTimeText: {
    fontSize: 10,
    color: isDarkMode ? 'rgba(255,255,255,0.7)' : '#666',
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontFamily: 'BakbakOne',
    fontSize: 16,
    color: isDarkMode ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontFamily: 'Jura-VariableFont_wght',
    fontSize: 14,
    color: isDarkMode ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)',
    textAlign: 'center',
  },
  flatListContent: {
    paddingBottom: 20 
  },
  modalBackdrop: {
    flex: 1,
    width: screenWidth,
    height: screenHeight,
    backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContentWrapper: {
    width: '90%',
    maxWidth: 400,
    maxHeight: '85%',
    borderRadius: 25,
    overflow: 'hidden',
  },
  modalContent: { 
    borderRadius: 25, 
    overflow: 'hidden' 
  },
  modalBlur: {
    backgroundColor: isDarkMode ? 'rgba(28, 28, 30, 0.95)' : '#FFFFFF'
  },
  modalContainer: { 
    maxHeight: '100%' 
  },
  modalScrollView: { 
    maxHeight: '100%' 
  },
  modalScrollContent: { 
    paddingBottom: 20 
  },
  modalHeader: {
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  },
  modalProviderImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: 'rgba(175, 145, 151, 0.3)',
  },
  modalProviderName: { 
    fontSize: 20, 
    fontWeight: 'bold', 
    color: isDarkMode ? '#FFFFFF' : '#000', 
    marginBottom: 8 
  },
  modalServiceTypeBadge: {
    backgroundColor: 'rgba(175, 145, 151, 0.1)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(175, 145, 151, 0.3)',
  },
  modalServiceTypeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#AF9197',
    letterSpacing: 0.5
  },
  completedStatusBadge: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(76, 175, 80, 0.4)',
    marginTop: 12,
  },
  completedStatusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#4CAF50',
    letterSpacing: 0.8,
  },
  modalSection: { 
    padding: 20, 
    borderBottomWidth: 1, 
    borderBottomColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' 
  },
  modalSectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: isDarkMode ? 'rgba(255,255,255,0.7)' : '#666',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  modalSectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalCard: { 
    backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)', 
    borderRadius: 12, 
    padding: 15 
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  modalLabel: { 
    fontSize: 13, 
    color: isDarkMode ? 'rgba(255,255,255,0.7)' : '#666', 
    flex: 1 
  },
  modalValue: { 
    fontSize: 13, 
    color: isDarkMode ? '#FFFFFF' : '#000', 
    fontWeight: '500', 
    textAlign: 'right',
    flex: 1,
  },
  modalTimeValue: { 
    fontSize: 13, 
    color: isDarkMode ? '#FFFFFF' : '#000', 
    fontWeight: 'bold', 
    flex: 1, 
    textAlign: 'right' 
  },
  modalStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  modalStatusText: { 
    fontSize: 11, 
    color: '#FFF', 
    fontWeight: 'bold' 
  },
  modalPriceRow: { 
    marginBottom: 0 
  },
  modalPriceLabelContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    flex: 1 
  },
  modalPriceNoteInline: { 
    fontSize: 11, 
    color: isDarkMode ? 'rgba(255,255,255,0.5)' : '#999', 
    fontStyle: 'italic' 
  },
  modalPriceValueBlack: { 
    fontSize: 16, 
    color: isDarkMode ? '#FFFFFF' : '#000', 
    fontWeight: 'bold' 
  },
  modalDescriptionSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  },
  modalDescriptionLabel: { 
    fontSize: 12, 
    color: isDarkMode ? 'rgba(255,255,255,0.7)' : '#666', 
    marginBottom: 6 
  },
  modalDescriptionText: { 
    fontSize: 12, 
    color: isDarkMode ? '#F0F0F0' : '#333', 
    lineHeight: 18 
  },
  modalAddOnsHeaderCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  modalAddOnsBadgeSmall: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  modalAddOnsBadgeTextSmall: { 
    fontSize: 10, 
    color: '#FFF', 
    fontWeight: 'bold' 
  },
  modalAddOnsCardCompact: {
    backgroundColor: 'rgba(255, 152, 0, 0.05)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 152, 0, 0.2)',
  },
  modalAddOnRowCompact: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 8 
  },
  modalAddOnDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF9800',
    marginRight: 8,
  },
  modalAddOnNameSmall: { 
    fontSize: 12, 
    color: isDarkMode ? '#F0F0F0' : '#333', 
    flex: 1 
  },
  modalAddOnPriceSmall: { 
    fontSize: 12, 
    color: '#FF9800', 
    fontWeight: 'bold' 
  },
  modalAddOnsDividerSmall: {
    height: 1,
    backgroundColor: 'rgba(255, 152, 0, 0.2)',
    marginVertical: 8,
  },
  modalTotalRowCompact: { 
    flexDirection: 'row', 
    justifyContent: 'space-between' 
  },
  modalTotalLabelSmall: { 
    fontSize: 12, 
    color: isDarkMode ? '#F0F0F0' : '#333', 
    fontWeight: 'bold' 
  },
  modalTotalValueSmall: { 
    fontSize: 14, 
    color: '#FF9800', 
    fontWeight: 'bold' 
  },
  modalPaymentCardGrey: { 
    backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)', 
    borderRadius: 12, 
    padding: 15 
  },
  modalPaymentRowCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  modalPaymentLabelCompact: { 
    fontSize: 12, 
    color: isDarkMode ? 'rgba(255,255,255,0.7)' : '#666' 
  },
  modalPaymentValueCompact: { 
    fontSize: 12, 
    color: isDarkMode ? '#F0F0F0' : '#333', 
    fontWeight: '600' 
  },
  modalDepositValueCompact: { 
    fontSize: 12, 
    color: '#4CAF50', 
    fontWeight: '600' 
  },
  modalRemainingBalanceRowGrey: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  },
  modalRemainingBalanceLabelGrey: { 
    fontSize: 13, 
    color: isDarkMode ? '#F0F0F0' : '#333', 
    fontWeight: 'bold' 
  },
  modalRemainingBalanceValueGrey: { 
    fontSize: 14, 
    color: '#FF9800', 
    fontWeight: 'bold' 
  },
  fullyPaidBadge: {
    backgroundColor: isDarkMode ? 'rgba(76, 175, 80, 0.15)' : '#E8F5E9',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginTop: 10,
    alignSelf: 'center',
  },
  fullyPaidText: { 
    color: '#4CAF50', 
    fontSize: 13, 
    fontWeight: 'bold' 
  },
  modalNotesCard: {

    backgroundColor: 'rgba(33, 150, 243, 0.05)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(33, 150, 243, 0.2)',
  },
  modalNotesText: { 
    fontSize: 12, 
    color: isDarkMode ? '#F0F0F0' : '#333', 
    lineHeight: 18 
  },
  modalInstructionsCard: {
    backgroundColor: 'rgba(175, 145, 151, 0.05)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(175, 145, 151, 0.2)',
  },
  modalInstructionsText: { 
    fontSize: 12, 
    color: isDarkMode ? '#F0F0F0' : '#333', 
    lineHeight: 18 
  },
  modalContactBlock: { 
    marginVertical: 10 
  },
  modalMessageButtonLarge: {
    backgroundColor: '#25D366',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  modalMessageButtonText: { 
    color: '#FFF', 
    fontSize: 14, 
    fontWeight: '600' 
  },
  modalLockedBadge: {
    backgroundColor: isDarkMode ? 'rgba(255, 152, 0, 0.1)' : '#FFF3E0',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginTop: 8,
    borderWidth: 1,
    borderColor: isDarkMode ? 'rgba(255, 152, 0, 0.3)' : '#FFE0B2',
  },
  modalLockedText: { 
    color: '#E65100', 
    fontSize: 12, 
    fontStyle: 'italic' 
  },
  modalAddressText: { 
    fontSize: 14, 
    color: isDarkMode ? '#F0F0F0' : '#333', 
    marginTop: 8, 
    lineHeight: 20 
  },
  modalDirectionsButtonSmall: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 102,
    borderRadius: 6,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  modalDirectionsButtonTextSmall: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  modalActionsSection: { 
    padding: 20 
  },
  modalActionsRow: { 
    flexDirection: 'row', 
    gap: 12 
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: '#FF6B6B',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  modalCancelButtonText: { 
    color: '#FFF', 
    fontSize: 14, 
    fontWeight: 'bold' 
  },
  modalActionButton: {
    flex: 1,
    backgroundColor: '#AF9197',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  modalActionButtonText: { 
    color: '#FFF', 
    fontSize: 14, 
    fontWeight: 'bold' 
  },
  rebookButtonModal: {
    backgroundColor: isDarkMode ? '#E0E0E0' : '#000',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  rebookButtonTextModal: {
    color: isDarkMode ? '#000' : '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  completedActionButton: {
    flex: 1,
    backgroundColor: isDarkMode ? '#E0E0E0' : '#000',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
    minHeight: 44,
  },
  completedActionText: {
    color: isDarkMode ? '#000' : '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalRateButton: {
    flex: 1,
    backgroundColor: 'rgba(175,145,151,0.12)',
    borderColor: 'rgba(175,145,151,0.4)',
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  modalTipButton: {
    flex: 1,
    backgroundColor: '#4caf4f31',
    borderColor: '#2b6a2e8e',
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  modalBookAgainButton: {
    flex: 1,
    backgroundColor: '#f28e0c29',
    borderColor: '#b9550d71',
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  modalButtonText: {
    fontFamily: 'BakbakOne',
    fontSize: 11,
    color: isDarkMode ? '#FFFFFF' : '#000',
    fontWeight: 'bold',
  },
  modalBottomSpace: {
    height: 20
  },
  modalFooter: {
    borderTopWidth: 1,
    borderTopColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    padding: 15
  },
  modalCloseButtonFullWidth: {
    backgroundColor: '#4f4f4fe2',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCloseButtonFullWidthText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  viewReceiptButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: isDarkMode ? '#3A3A3C' : '#F0F0F0',
    borderRadius: 20,
    borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : '#CFCFCF',
    borderWidth: 1,
  },
  viewReceiptButtonActive: { 
    backgroundColor: '#4CAF50' 
  },
  viewReceiptButtonText: { 
    fontSize: 12, 
    fontWeight: '600', 
    color: isDarkMode ? '#F0F0F0' : '#333' 
  },
  viewReceiptButtonTextActive: { 
    color: '#FFF' 
  },
  receiptContainer: { 
    marginTop: 12, 
    backgroundColor: isDarkMode ? '#3A3A3C' : '#F5F5F5', 
    borderRadius: 8, 
    padding: 12 
  },
  receiptPaper: {
    backgroundColor: isDarkMode ? '#2C2C2E' : '#FFF',
    padding: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : '#E0E0E0',
    borderStyle: 'dashed',
  },
  receiptHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    position: 'relative',
  },
  receiptHeaderText: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    color: isDarkMode ? '#F0F0F0' : '#333',
    letterSpacing: 1,
  },
  receiptShareBtn: {
    position: 'absolute',
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptShareIcon: {
    fontSize: 14,
    color: isDarkMode ? '#F0F0F0' : '#333',
  },
  receiptDivider: { 
    height: 1, 
    backgroundColor: isDarkMode ? '#48484A' : '#E0E0E0', 
    marginVertical: 10 
  },
  receiptSection: { 
    marginVertical: 5 
  },
  receiptSectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: isDarkMode ? 'rgba(255,255,255,0.7)' : '#666',
    marginBottom: 5,
    letterSpacing: 0.5,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 3,
    alignItems: 'flex-start',
  },
  receiptLabel: { 
    fontSize: 12, 
    color: isDarkMode ? 'rgba(255,255,255,0.7)' : '#666', 
    flex: 1 
  },
  receiptValue: {
    fontSize: 12,
    color: isDarkMode ? '#F0F0F0' : '#333',
    fontWeight: '500',
    textAlign: 'right',
    maxWidth: '50%',
  },
  receiptValueGreen: { 
    fontSize: 12, 
    color: '#4CAF50', 
    fontWeight: 'bold', 
    textAlign: 'right' 
  },
  receiptTotalRow: { 
    marginTop: 5, 
    paddingTop: 5 
  },
  receiptTotalLabel: { 
    fontSize: 14, 
    fontWeight: 'bold', 
    color: isDarkMode ? '#F0F0F0' : '#333' 
  },
  receiptTotalValue: { 
    fontSize: 14, 
    fontWeight: 'bold', 
    color: isDarkMode ? '#F0F0F0' : '#333' 
  },
  receiptBalanceRow: { 
    marginTop: 5 
  },
  receiptBalanceLabel: { 
    fontSize: 13, 
    fontWeight: 'bold', 
    color: isDarkMode ? '#F0F0F0' : '#333' 
  },
  receiptBalanceValue: { 
    fontSize: 13, 
    fontWeight: 'bold', 
    color: isDarkMode ? '#F0F0F0' : '#333' 
  },
  receiptBalanceValueOrange: { 
    color: '#FF9800' 
  },
  receiptFullyPaidBadge: {
    backgroundColor: isDarkMode ? 'rgba(76, 175, 80, 0.15)' : '#E8F5E9',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginTop: 8,
    alignSelf: 'center',
  },
  receiptFullyPaidText: { 
    color: '#4CAF50', 
    fontSize: 12, 
    fontWeight: 'bold' 
  },
  receiptFooter: { 
    marginTop: 10, 
    alignItems: 'center' 
  },
  receiptReference: { 
    fontSize: 10, 
    color: isDarkMode ? 'rgba(255,255,255,0.5)' : '#999', 
    marginBottom: 2 
  },
  receiptDate: { 
    fontSize: 10, 
    color: isDarkMode ? 'rgba(255,255,255,0.5)' : '#999' 
  },
  rescheduleModalOverlay: {
    flex: 1,
    width: screenWidth,
    height: screenHeight,
    backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rescheduleModalContent: { 
    width: '90%', 
    maxWidth: 400, 
    maxHeight: '80%',
    borderRadius: 20, 
    overflow: 'hidden' 
  },
  rescheduleBlur: {
    padding: 24,
    backgroundColor: isDarkMode ? 'rgba(28, 28, 30, 0.95)' : '#FFFFFF'
  },
  rescheduleTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    color: isDarkMode ? '#F0F0F0' : '#333',
  },
  rescheduleSubtitle: { 
    fontSize: 14, 
    textAlign: 'center', 
    marginBottom: 20, 
    color: isDarkMode ? 'rgba(255,255,255,0.7)' : '#666',
    lineHeight: 20,
  },
  dateSuggestions: {
    marginBottom: 24,
  },
  dateSuggestionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  dateSuggestionChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginHorizontal: 5,
    borderRadius: 20,
    backgroundColor: isDarkMode ? '#3A3A3C' : '#F0F0F0',
    borderWidth: 1,
    borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : '#DDD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateSuggestionActive: { 
    backgroundColor: isDarkMode ? 'rgba(175, 145, 151, 0.25)' : 'rgba(175,145,151,0.2)', 
    borderColor: '#AF9197' 
  },
  dateSuggestionText: { 
    fontSize: 14, 
    color: isDarkMode ? 'rgba(255,255,255,0.7)' : '#666' 
  },
  dateSuggestionTextActive: { 
    color: '#AF9197', 
    fontWeight: '600' 
  },
  rescheduleActions: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    gap: 12 
  },
  cancelRescheduleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: isDarkMode ? '#3A3A3C' : '#F0F0F0',
    alignItems: 'center',
  },
  cancelRescheduleText: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: isDarkMode ? 'rgba(255,255,255,0.7)' : '#666' 
  },
  confirmRescheduleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#AF9197',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  confirmRescheduleButtonDisabled: { 
    backgroundColor: isDarkMode ? '#48484A' : '#CCCCCC' 
  },
  confirmRescheduleText: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: '#FFF' 
  },
  starContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 24,
  },
  starButton: {
    padding: 4,
  },
  starText: {
    fontSize: 36,
    color: isDarkMode ? '#48484A' : '#DDD',
  },
  starTextActive: {
    color: '#FFB300',
  },
  reviewInputContainer: {
    marginBottom: 20,
  },
  reviewInputLabel: {
    fontSize: 13,
    color: isDarkMode ? 'rgba(255,255,255,0.7)' : '#666',
    marginBottom: 8,
    fontWeight: '600',
  },
  reviewInput: {
    backgroundColor: isDarkMode ? '#3A3A3C' : '#F5F5F5',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: isDarkMode ? '#F0F0F0' : '#333',
    minHeight: 100,
    maxHeight: 150,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : '#E0E0E0',
  },
  characterCount: {
    fontSize: 11,
    color: isDarkMode ? 'rgba(255,255,255,0.5)' : '#999',
    textAlign: 'right',
    marginTop: 4,
  },
  rescheduleStatusCard: {
    backgroundColor: 'rgba(175, 145, 151, 0.08)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: 'rgba(175, 145, 151, 0.3)',
  },
  rescheduleStatusTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#AF9197',
    marginBottom: 8,
    textAlign: 'center',
  },
  rescheduleStatusText: {
    fontSize: 14,
    color: isDarkMode ? 'rgba(255,255,255,0.7)' : '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  successIconContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  successIcon: {
    fontSize: 40,
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  availableDatesScrollView: {
    maxHeight: 300,
    marginBottom: 20,
  },
  dateOptionCard: {
    backgroundColor: 'rgba(175, 145, 151, 0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(175, 145, 151, 0.15)',
  },
  dateOptionDate: {
    fontSize: 15,
    fontWeight: 'bold',
    color: isDarkMode ? '#F0F0F0' : '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  timeSlots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  timeSlotChip: {
    backgroundColor: isDarkMode ? '#3A3A3C' : '#F5F5F5',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : '#DDD',
    minWidth: 80,
    alignItems: 'center',
  },
  timeSlotChipActive: {
    backgroundColor: '#AF9197',
    borderColor: '#AF9197',
  },
  timeSlotText: {
    fontSize: 13,
    color: isDarkMode ? 'rgba(255,255,255,0.7)' : '#666',
    fontWeight: '600',
  },
  timeSlotTextActive: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  dateTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  purpleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#AF9197',
  },
  rescheduleBadge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginTop: 6,
  },
  rescheduleBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
    color: '#fff',
  },
  // Reserves the reschedule badge's vertical space on cards that don't have
  // one, so every card in the row lines up with the one that does.
  rescheduleBadgeSpacer: {
    height: 6 + 3 + 3 + 12, // marginTop + paddingVertical*2 + approx text line height
  },
  // Green dot for recently added bookings - moved 1cm (~28pt) to the left
  recentlyAddedDot: {
    position: 'absolute',
    top: 2,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: isDarkMode ? '#2C2C2E' : '#FFFFFF',
    zIndex: 10,
  },
  // Status indicator (e.g. orange = awaiting confirmation) — top-left corner
  // of the card image, replacing the old full-width text pill so cards stay compact
  statusDot: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: isDarkMode ? '#2C2C2E' : '#FFFFFF',
    zIndex: 10,
  },
  // Wrapper for provider image to position the green dot
  providerImageWrapper: {
    position: 'relative',
    overflow: 'hidden',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  providerCardWrapper: {
    marginRight: 4,
  },
  modalValueWithIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'flex-start',
  },
  rescheduledBadge: {
    backgroundColor: 'rgba(175, 145, 151, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#AF9197',
    marginRight: 5,
  },
  rescheduledBadgeText: {
    fontSize: 9,
    color: '#AF9197',
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  addOnsList: {
    backgroundColor: 'rgba(255, 152, 0, 0.05)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 152, 0, 0.2)',
  },
  addOnItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  addOnDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF9800',
    marginRight: 8,
  },
  addOnItemName: {
    fontSize: 13,
    color: isDarkMode ? '#F0F0F0' : '#333',
    flex: 1,
  },
  addOnItemPrice: {
    fontSize: 13,
    color: '#FF9800',
    fontWeight: 'bold',
  },
  tipContainer: {
    marginBottom: 20,
  },
  tipQuickButtons: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  tipQuickButton: {
    backgroundColor: isDarkMode ? '#3A3A3C' : '#F0F0F0',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : '#DDD',
    minWidth: 70,
    alignItems: 'center',
  },
  tipQuickButtonActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  tipQuickButtonText: {
    fontSize: 16,
    color: isDarkMode ? 'rgba(255,255,255,0.7)' : '#666',
    fontWeight: 'bold',
  },
  tipQuickButtonTextActive: {
    color: '#FFF',
  },
  tipCustomContainer: {
    marginTop: 8,
  },
  tipCustomLabel: {
    fontSize: 13,
    color: isDarkMode ? 'rgba(255,255,255,0.7)' : '#666',
    marginBottom: 8,
    fontWeight: '600',
  },
  tipInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDarkMode ? '#3A3A3C' : '#F5F5F5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : '#E0E0E0',
    paddingHorizontal: 12,
  },
  tipCurrencySymbol: {
    fontSize: 18,
    color: isDarkMode ? '#F0F0F0' : '#333',
    fontWeight: 'bold',
    marginRight: 8,
  },
  tipInput: {
    flex: 1,
    fontSize: 18,
    color: isDarkMode ? '#F0F0F0' : '#333',
    paddingVertical: 12,
    fontWeight: 'bold',
  },

// ✅ iMESSAGE CHAT STYLES - ADD ALL OF THESE:
chatContainer: {
  flex: 1,
  backgroundColor: isDarkMode ? '#1C1C1E' : '#FFFFFF',
},
chatHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingHorizontal: 16,
  paddingVertical: 12,
  backgroundColor: isDarkMode ? '#2C2C2E' : '#F9F9F9',
  borderBottomWidth: 1,
  borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.15)' : '#E5E5E5',
},
chatBackButton: {
  paddingVertical: 8,
  paddingHorizontal: 4,
},
chatBackText: {
  fontSize: 16,
  color: '#007AFF',
  fontWeight: '600',
},
chatHeaderCenter: {
  flex: 1,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
},
chatProviderAvatar: {
  width: 36,
  height: 36,
  borderRadius: 18,
  borderWidth: 1,
  borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : '#E5E5E5',
},
chatHeaderInfo: {
  alignItems: 'center',
},
chatProviderName: {
  fontSize: 15,
  fontWeight: '600',
  color: isDarkMode ? '#FFFFFF' : '#000',
},
chatAppointmentInfo: {
  fontSize: 11,
  color: isDarkMode ? 'rgba(255,255,255,0.6)' : '#8E8E93',
  marginTop: 2,
},
chatHeaderSpacer: {
  width: 60,
},
chatMessagesContainer: {
  flex: 1,
  backgroundColor: isDarkMode ? '#1C1C1E' : '#FFFFFF',
},
chatMessagesContent: {
  padding: 16,
  paddingBottom: 80,
},
chatEmptyState: {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
  paddingVertical: 100,
},
chatEmptyIconContainer: {
  width: 80,
  height: 80,
  borderRadius: 40,
  backgroundColor: isDarkMode ? '#3A3A3C' : '#F0F0F0',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: 16,
},
chatEmptyIcon: {
  fontSize: 40,
},
chatEmptyTitle: {
  fontSize: 18,
  fontWeight: '600',
  color: isDarkMode ? '#FFFFFF' : '#000',
  marginBottom: 8,
},
chatEmptySubtitle: {
  fontSize: 14,
  color: isDarkMode ? 'rgba(255,255,255,0.6)' : '#8E8E93',
  textAlign: 'center',
  paddingHorizontal: 40,
  lineHeight: 20,
},
chatMessageRow: {
  flexDirection: 'row',
  marginBottom: 12,
  alignItems: 'flex-end',
  gap: 8,
},
chatMessageRowUser: {
  justifyContent: 'flex-end',
},
chatMessageAvatar: {
  width: 30,
  height: 30,
  borderRadius: 15,
  borderWidth: 1,
  borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : '#E5E5E5',
},
chatMessageAvatarSpacer: {
  width: 30,
},
chatMessageBubble: {
  maxWidth: '70%',
  paddingHorizontal: 14,
  paddingVertical: 10,
  borderRadius: 18,
},
chatMessageBubbleProvider: {
  backgroundColor: isDarkMode ? '#3A3A3C' : '#E9E9EB',
  borderBottomLeftRadius: 4,
},
chatMessageBubbleUser: {
  backgroundColor: '#007AFF',
  borderBottomRightRadius: 4,
},
chatMessageText: {
  fontSize: 15,
  color: isDarkMode ? '#FFFFFF' : '#000',
  lineHeight: 20,
},
chatMessageTextUser: {
  color: '#FFF',
},
chatMessageTime: {
  fontSize: 11,
  color: isDarkMode ? 'rgba(255,255,255,0.6)' : '#8E8E93',
  marginTop: 4,
},
chatMessageTimeUser: {
  color: 'rgba(255, 255, 255, 0.7)',
},
chatInputContainer: {
  backgroundColor: isDarkMode ? '#2C2C2E' : '#F9F9F9',
  borderTopWidth: 1,
  borderTopColor: isDarkMode ? 'rgba(255,255,255,0.15)' : '#E5E5E5',
  paddingHorizontal: 12,
  paddingVertical: 8,
},
chatInputWrapper: {
  flexDirection: 'row',
  alignItems: 'flex-end',
  gap: 8,
  backgroundColor: isDarkMode ? '#2C2C2E' : '#FFF',
  borderRadius: 20,
  borderWidth: 1,
  borderColor: isDarkMode ? 'rgba(255,255,255,0.15)' : '#E5E5E5',
  paddingHorizontal: 12,
  paddingVertical: 6,
},
chatInput: {
  flex: 1,
  fontSize: 16,
  color: isDarkMode ? '#FFFFFF' : '#000',
  maxHeight: 100,
  paddingVertical: 6,
},
chatSendButton: {
  backgroundColor: '#007AFF',
  paddingHorizontal: 16,
  paddingVertical: 8,
  borderRadius: 16,
  justifyContent: 'center',
  alignItems: 'center',
},
chatSendButtonDisabled: {
  backgroundColor: isDarkMode ? '#48484A' : '#C7C7CC',
},
chatSendButtonText: {
  color: '#FFF',
  fontSize: 15,
  fontWeight: '600',
},
// ==================== REDESIGNED MESSAGE MODAL STYLES ====================
msgModalContainer: {
  flex: 1,
},
msgModalPanel: {
  flex: 1,
  backgroundColor: isDarkMode ? '#000000' : '#FFFFFF',
  paddingTop: Platform.OS === 'ios' ? 54 : 30,
},
msgHeaderBar: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: 16,
  paddingVertical: 12,
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)',
  backgroundColor: isDarkMode ? 'rgba(28,28,30,0.95)' : 'rgba(255,255,255,0.95)',
},
msgBackButton: {
  width: 36,
  height: 36,
  alignItems: 'center',
  justifyContent: 'center',
},
msgBackArrow: {
  fontSize: 32,
  fontWeight: '300',
  color: '#AF9197',
  marginTop: -2,
},
msgHeaderCenter: {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
},
msgAvatarWrapper: {
  position: 'relative',
  marginBottom: 4,
},
msgAvatar: {
  width: 36,
  height: 36,
  borderRadius: 18,
},
msgAvatarFallback: {
  width: 36,
  height: 36,
  borderRadius: 18,
  backgroundColor: '#AF9197',
  alignItems: 'center',
  justifyContent: 'center',
},
msgAvatarInitial: {
  color: '#FFF',
  fontSize: 16,
  fontWeight: '700',
},
msgOnlineDot: {
  position: 'absolute',
  bottom: 0,
  right: -1,
  width: 10,
  height: 10,
  borderRadius: 5,
  backgroundColor: '#34C759',
  borderWidth: 2,
  borderColor: isDarkMode ? '#000' : '#FFF',
},
msgHeaderName: {
  fontSize: 14,
  fontWeight: '600',
  color: isDarkMode ? '#F5F5F5' : '#1C1C1E',
},
msgHeaderStatus: {
  fontSize: 11,
  color: isDarkMode ? 'rgba(255,255,255,0.45)' : '#8E8E93',
  marginTop: 1,
},
msgHeaderSpacer: {
  width: 36,
},
msgChatArea: {
  flex: 1,
  backgroundColor: isDarkMode ? '#000000' : '#F2F2F7',
},
msgChatContent: {
  paddingHorizontal: 16,
  paddingTop: 16,
  paddingBottom: 12,
},
msgEmptyState: {
  alignItems: 'center',
  justifyContent: 'center',
  paddingTop: 80,
  paddingHorizontal: 40,
},
msgEmptyIconCircle: {
  width: 72,
  height: 72,
  borderRadius: 36,
  backgroundColor: isDarkMode ? 'rgba(200,80,200,0.15)' : 'rgba(200,80,200,0.1)',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: 16,
},
msgEmptyIcon: {
  fontSize: 32,
},
msgEmptyTitle: {
  fontSize: 18,
  fontWeight: '600',
  color: isDarkMode ? '#F0F0F0' : '#1C1C1E',
  marginBottom: 8,
},
msgEmptySubtitle: {
  fontSize: 14,
  color: isDarkMode ? 'rgba(255,255,255,0.5)' : '#8E8E93',
  textAlign: 'center',
  lineHeight: 20,
},
msgTimeDivider: {
  textAlign: 'center',
  fontSize: 12,
  color: isDarkMode ? 'rgba(255,255,255,0.4)' : '#8E8E93',
  marginVertical: 12,
  fontWeight: '500',
},
msgBubble: {
  maxWidth: '78%',
  paddingHorizontal: 14,
  paddingVertical: 10,
  borderRadius: 20,
  marginBottom: 6,
},
msgBubbleUser: {
  alignSelf: 'flex-end',
  backgroundColor: '#AF9197',
  borderBottomRightRadius: 6,
},
msgBubbleProvider: {
  alignSelf: 'flex-start',
  backgroundColor: isDarkMode ? '#2C2C2E' : '#FFFFFF',
  borderBottomLeftRadius: 6,
  ...(isDarkMode ? {} : {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  }),
},
msgBubbleText: {
  fontSize: 16,
  lineHeight: 22,
},
msgInputBar: {
  paddingHorizontal: 12,
  paddingTop: 10,
  paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  borderTopWidth: StyleSheet.hairlineWidth,
  borderTopColor: isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)',
  backgroundColor: isDarkMode ? 'rgba(28,28,30,0.98)' : '#FFFFFF',
},
msgInputRow: {
  flexDirection: 'row',
  alignItems: 'flex-end',
  gap: 8,
},
msgTextInput: {
  flex: 1,
  backgroundColor: isDarkMode ? 'rgba(58,58,60,0.6)' : '#F2F2F7',
  borderRadius: 22,
  paddingHorizontal: 18,
  paddingTop: 10,
  paddingBottom: 10,
  fontSize: 16,
  color: isDarkMode ? '#FFF' : '#000',
  maxHeight: 100,
  minHeight: 40,
},
msgSendCircle: {
  width: 36,
  height: 36,
  borderRadius: 18,
  backgroundColor: '#AF9197',
  alignItems: 'center',
  justifyContent: 'center',
},
msgSendCircleDisabled: {
  backgroundColor: isDarkMode ? '#3A3A3C' : '#D1D1D6',
},
msgSendArrow: {
  color: '#FFF',
  fontSize: 20,
  fontWeight: '700',
  marginTop: -1,
},

// ── Intake form to-do card ──
intakeFormTodo: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 12,
  backgroundColor: 'rgba(163,66,195,0.10)',
  borderWidth: 1.5,
  borderColor: 'rgba(163,66,195,0.35)',
  borderRadius: 14,
  padding: 14,
},
intakeFormTodoIcon: {
  width: 40, height: 40, borderRadius: 20,
  backgroundColor: 'rgba(163,66,195,0.15)',
  alignItems: 'center', justifyContent: 'center',
},
intakeFormTodoTitle: {
  fontSize: 14,
  fontWeight: '700',
  color: '#AF9197',
  marginBottom: 3,
},
intakeFormTodoSub: {
  fontSize: 12,
  color: '#AF9197',
  opacity: 0.75,
  lineHeight: 17,
},
intakeFormTodoBadge: {
  backgroundColor: '#AF9197',
  borderRadius: 6,
  paddingHorizontal: 7,
  paddingVertical: 3,
},
intakeFormTodoBadgeText: {
  color: '#fff',
  fontSize: 10,
  fontWeight: '800',
  letterSpacing: 0.3,
},

// ── Group Booking Card ───────────────────────────────────────────────────────
groupBookingCard: {
  marginBottom: 24,
  borderRadius: 16,
  overflow: 'hidden',
  borderWidth: 1,
},
groupBookingHeader: {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'space-between' as const,
  padding: 14,
},
groupBookingHeaderLeft: {
  flex: 1,
},
groupBookingTitle: {
  fontSize: 13,
  letterSpacing: 0.3,
  fontWeight: '600' as const,
},
groupBookingStatusBadge: {
  alignSelf: 'flex-start' as const,
  borderRadius: 8,
  paddingHorizontal: 8,
  paddingVertical: 3,
  marginTop: 6,
},
groupBookingBody: {
  borderTopWidth: 1,
},
groupBookingItemRow: {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  padding: 12,
  borderBottomWidth: 1,
},
groupBookingItemImage: {
  width: 36,
  height: 36,
  borderRadius: 18,
  marginRight: 10,
},
groupBookingItemInfo: {
  flex: 1,
},
groupBookingItemProvider: {
  fontSize: 12,
  fontWeight: '600' as const,
},
groupBookingItemService: {
  fontSize: 11,
  marginTop: 1,
},
groupBookingItemDateTime: {
  fontSize: 10,
  marginTop: 2,
},
groupBookingItemPrice: {
  fontSize: 13,
  fontWeight: '600' as const,
},
groupBookingPlatformFeeRow: {
  flexDirection: 'row' as const,
  justifyContent: 'space-between' as const,
  paddingHorizontal: 14,
  paddingVertical: 10,
},
groupBookingPlatformFeeLabel: {
  fontSize: 12,
},
groupBookingPlatformFeeValue: {
  fontSize: 12,
},
});

// ── Contact Sheet Styles ──────────────────────────────────────────────────────
const csSt = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet:       { backgroundColor: '#1C1C1E', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, paddingHorizontal: 20 },
  handle:      { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginTop: 12, marginBottom: 20 },
  title:       { fontSize: 18, fontWeight: '700', color: '#F2EBF0', textAlign: 'center', marginBottom: 4 },
  subtitle:    { fontSize: 13, color: 'rgba(183,225,218,0.55)', textAlign: 'center', marginBottom: 20 },
  options:     { gap: 10 },
  option:      { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2C2C2E', borderRadius: 14, padding: 14, gap: 14 },
  optionIcon:  { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  optionEmoji: { fontSize: 20 },
  optionText:  { flex: 1 },
  optionLabel: { fontSize: 15, fontWeight: '600', color: '#F2EBF0' },
  optionDesc:  { fontSize: 12, color: 'rgba(183,225,218,0.55)', marginTop: 2 },
  optionChevron: { fontSize: 22, color: 'rgba(255,255,255,0.3)', fontWeight: '300' },
});

export default BookingsScreen;