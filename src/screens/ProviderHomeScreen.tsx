import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';
import { useBooking, ConfirmedBooking, BookingStatus, PaymentStatus } from '../contexts/BookingContext';
import AppBackground from '../components/AppBackground';
import { ProviderHomeScreenProps } from '../navigation/types';
import { supabase } from '../lib/supabase';
import { getProviderBookings, getMyProviderProfile } from '../services/databaseService';
import type { BookingWithAddOns } from '../types/database';

type Props = ProviderHomeScreenProps<'ProviderHomeMain'>;

const { width: screenWidth } = Dimensions.get('window');
const CELL_SIZE = Math.floor((screenWidth - 48) / 7);

// ====================== CONSTANTS ======================

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES_FULL = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

// ====================== HELPERS ======================

function formatDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseTimeToMinutes(timeStr: string): number {
  const clean = timeStr.trim().toUpperCase();
  const isPM = clean.includes('PM');
  const isAM = clean.includes('AM');
  const timePart = clean.replace(/[AP]M/i, '').trim();
  const [hoursStr, minutesStr] = timePart.split(':');
  let hours = parseInt(hoursStr || '0', 10);
  const minutes = parseInt(minutesStr || '0', 10);
  if (isAM && hours === 12) hours = 0;
  if (isPM && hours !== 12) hours += 12;
  return hours * 60 + minutes;
}

function getMonthDays(year: number, month: number): Array<{ date: Date; dateString: string } | null> {
  const firstDay = new Date(year, month, 1);
  let startDay = firstDay.getDay() - 1;
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

function getHeatColor(count: number, isDarkMode: boolean): string {
  if (count === 0) return 'transparent';
  if (isDarkMode) {
    if (count <= 1) return 'rgba(0, 122, 255, 0.15)';
    if (count <= 2) return 'rgba(0, 122, 255, 0.25)';
    if (count <= 4) return 'rgba(0, 122, 255, 0.40)';
    return 'rgba(0, 122, 255, 0.55)';
  }
  if (count <= 1) return 'rgba(0, 122, 255, 0.10)';
  if (count <= 2) return 'rgba(0, 122, 255, 0.20)';
  if (count <= 4) return 'rgba(0, 122, 255, 0.35)';
  return 'rgba(0, 122, 255, 0.55)';
}

function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const day = days[d.getDay()];
  const date = d.getDate();
  const ordinal =
    date === 1 || date === 21 || date === 31
      ? 'st'
      : date === 2 || date === 22
      ? 'nd'
      : date === 3 || date === 23
      ? 'rd'
      : 'th';
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  const h12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${day} ${date}${ordinal} ${month} ${year}, ${h12}:${minutes}${ampm}`;
}

function getBookingRef(id: string): string {
  return id.replace(/-/g, '').substring(0, 10).toUpperCase();
}



function generateDayTabs(): Array<{ label: string; dateString: string }> {
  const tabs: Array<{ label: string; dateString: string }> = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    let label: string;
    if (i === 0) label = 'Today';
    else if (i === 1) label = 'Tomorrow';
    else label = DAY_NAMES_FULL[date.getDay()] ?? '';
    tabs.push({ label, dateString: formatDateString(date) });
  }
  return tabs;
}

// ====================== EXPANSION STATE ======================

// 0 = collapsed, 1 = expanded (BOOKING SUMMARY), 2 = fully expanded (+ Relevant Info)
type ExpansionState = 0 | 1 | 2;

// ====================== BOOKING CARD COMPONENT ======================

interface BookingCardProps {
  booking: ConfirmedBooking;
  expansionState: ExpansionState;
  onToggleExpand: () => void;
  onPress: () => void;
  isDarkMode: boolean;
  theme: any;
}

function BookingCard({
  booking,
  expansionState,
  onToggleExpand,
  onPress,
  isDarkMode,
  theme,
}: BookingCardProps) {
  const addOnsTotal = booking.addOns?.reduce((sum, a) => sum + a.price, 0) || 0;
  const serviceTotal = booking.price + addOnsTotal;
  const depositPaid = booking.amountPaid;
  const totalDue = booking.remainingBalance || 0;
  const bookingRef = getBookingRef(booking.id);

  const expandLabel =
    expansionState === 0 ? 'Expand' : expansionState === 1 ? 'More' : 'Collapse';

  return (
    <TouchableOpacity
      activeOpacity={0.95}
      onPress={onPress}
      style={[
        styles.bookingCard,
        {
          backgroundColor: isDarkMode ? 'rgba(28,28,30,0.95)' : 'rgba(255,255,255,0.95)',
        },
      ]}
    >
      {/* Subtle top gradient accent */}
      <LinearGradient
        colors={['rgba(128,0,128,0.08)', 'transparent'] as [string, string, ...string[]]}
        style={styles.cardTopGradient}
      />

      {/* Header: Time + Name + Expand */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={[styles.cardTime, { color: theme.text }]}>
            {booking.bookingTime.replace(/\s*(AM|PM)/i, '').trim()}
          </Text>
          <Text style={[styles.cardName, { color: theme.text }]}>
            Name {'\u2013'} {booking.customerName || 'Client'}
          </Text>
        </View>
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation?.();
            onToggleExpand();
          }}
          style={styles.expandButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.expandButtonText}>{expandLabel}</Text>
        </TouchableOpacity>
      </View>

      {/* Collapsed: brief line */}
      {expansionState === 0 && (
        <View style={styles.collapsedInfo}>
          <Text style={[styles.collapsedService, { color: theme.text + '88' }]} numberOfLines={1}>
            {booking.serviceName} {'\u00B7'} {booking.duration}
          </Text>
        </View>
      )}

      {/* ========== BOOKING SUMMARY (state >= 1) ========== */}
      {expansionState >= 1 && (
        <View style={styles.summarySection}>
          <Text style={[styles.summaryHeader, { color: theme.text + '88' }]}>
            BOOKING SUMMARY
          </Text>

          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.text + '88' }]}>Service {'\u2013'} </Text>
            <Text style={[styles.summaryValue, { color: theme.text }]}>{booking.serviceName}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.text + '88' }]}>Time {'\u2013'} </Text>
            <Text style={[styles.summaryValue, { color: theme.text }]}>{booking.bookingTime}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.text + '88' }]}>Duration {'\u2013'} </Text>
            <Text style={[styles.summaryValue, { color: theme.text }]}>{booking.duration}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.text + '88' }]}>Price {'\u2013'} </Text>
            <Text style={[styles.summaryValue, { color: theme.text }]}>
              {'\u00A3'}{booking.price}
            </Text>
          </View>

          {/* Add-ons (orange) */}
          {booking.addOns && booking.addOns.length > 0 && (
            <View style={styles.addOnsSection}>
              {booking.addOns.map((addon) => (
                <Text key={addon.id} style={styles.addOnText}>
                  With Add-ons {'\u2013'} {addon.name} {'\u2013'} {'\u00A3'}{addon.price}
                </Text>
              ))}
            </View>
          )}

          {/* Client Notes */}
          {booking.notes ? (
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: theme.text + '88' }]}>
                Client Notes {'\u2013'}{' '}
              </Text>
              <Text style={[styles.notesValue, { color: theme.text }]}>
                {'\u201C'}{booking.notes}{'\u201D'}
              </Text>
            </View>
          ) : null}

          {/* Payment Status */}
          <View style={[styles.summaryRow, { marginTop: 10 }]}>
            <Text style={[styles.summaryLabel, { color: theme.text + '88' }]}>
              Payment Status{'  '}
            </Text>
            <Text style={[styles.summaryValue, { color: theme.text }]}>
              Service Total {'\u2013'} {'\u00A3'}{serviceTotal}
            </Text>
          </View>

          <View style={styles.paymentRow}>
            <Text style={styles.depositText}>
              Deposit paid {'\u2013'} {'\u00A3'}{depositPaid}
            </Text>
          </View>
          <View style={styles.paymentRow}>
            <Text style={styles.totalDueText}>
              Total due {'\u2013'} {'\u00A3'}{totalDue}
            </Text>
          </View>

          <View style={[styles.summaryRow, { marginTop: 6 }]}>
            <Text style={[styles.summaryLabel, { color: theme.text + '88' }]}>
              Payment Method {'\u2013'}{' '}
            </Text>
            <Text style={[styles.summaryValue, { color: theme.text }]}>
              {booking.paymentMethod || 'Card'}
            </Text>
          </View>
        </View>
      )}

      {/* ========== RELEVANT INFORMATION (state == 2) ========== */}
      {expansionState >= 2 && (
        <View style={styles.relevantSection}>
          <Text style={[styles.relevantHeader, { color: theme.text + '88' }]}>
            Relevant Information
          </Text>

          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.text + '88' }]}>
              Booked Date {'\u2013'}{' '}
            </Text>
            <Text style={[styles.summaryValue, { color: theme.text }]}>
              {formatCreatedAt(booking.createdAt)}
            </Text>
          </View>

          {booking.bookingInstructions ? (
            <Text style={[styles.instructionsText, { color: theme.text + '99' }]}>
              *{booking.bookingInstructions}*
            </Text>
          ) : null}

          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: theme.text + '88' }]}>
              Booking Ref/ID {'\u2013'}{' '}
            </Text>
            <Text style={[styles.summaryValue, { color: theme.text }]}>{bookingRef}</Text>
          </View>

          {/* View Messages */}
          <TouchableOpacity style={styles.viewMessagesButton} activeOpacity={0.7}>
            <Text style={styles.viewMessagesText}>View Messages</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ====================== SUPABASE MAPPER ======================

function mapDbToProviderBooking(db: BookingWithAddOns): ConfirmedBooking {
  const toDisplayTime = (t: string): string => {
    const parts = t.split(':');
    let h = parseInt(parts[0] ?? '0');
    const m = parseInt(parts[1] ?? '0');
    const period = h >= 12 ? 'PM' : 'AM';
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return `${h}:${m.toString().padStart(2, '0')} ${period}`;
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
  const startDisplay = toDisplayTime(db.booking_time);
  return {
    id: db.id,
    cartItemId: db.id,
    providerName: db.provider_name_snapshot,
    providerImage: db.provider_logo_snapshot ?? null,
    providerService: '',
    serviceName: db.service_name_snapshot,
    serviceDescription: '',
    price: db.base_price,
    duration: '',
    quantity: 1,
    bookingDate: db.booking_date,
    bookingTime: startDisplay,
    endTime: startDisplay,
    status: mapStatus(db.status),
    address: db.provider_address_snapshot ?? '',
    coordinates: { latitude: 0, longitude: 0 },
    phone: db.provider_phone_snapshot ?? '',
    customerName: db.customer_name ?? '',
    customerEmail: db.customer_email ?? '',
    customerPhone: db.customer_phone ?? '',
    paymentType: (db.payment_type ?? 'full') as 'full' | 'deposit',
    amountPaid: db.amount_paid,
    depositAmount: db.deposit_amount ?? 0,
    remainingBalance: db.remaining_balance ?? 0,
    serviceCharge: db.service_charge ?? 2.99,
    paymentStatus: PaymentStatus.PAID_IN_FULL,
    createdAt: db.created_at ?? new Date().toISOString(),
    updatedAt: db.updated_at ?? new Date().toISOString(),
  };
}

// ====================== MAIN COMPONENT ======================

export default function ProviderHomeScreen({ navigation }: Props) {
  const { theme, isDarkMode } = useTheme();
  useBooking(); // keep context subscribed for status updates

  const today = new Date();
  const todayStr = formatDateString(today);

  // Day tabs (next 7 days)
  const dayTabs = useMemo(() => generateDayTabs(), []);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const selectedDateStr = dayTabs[selectedDayIndex]?.dateString || todayStr;

  // Expansion states per booking
  const [expansionStates, setExpansionStates] = useState<Record<string, ExpansionState>>({});

  // Month view toggle
  const [showMonthView, setShowMonthView] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );

  const dayTabsScrollRef = useRef<ScrollView>(null);

  // Live provider bookings from Supabase
  const [liveProviderBookings, setLiveProviderBookings] = useState<ConfirmedBooking[]>([]);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const loadBookings = async () => {
      try {
        const rows = await getProviderBookings();
        if (!cancelled && rows.length > 0) {
          setLiveProviderBookings(rows.map(mapDbToProviderBooking));
        }
      } catch (_) { /* silent — falls back to mock */ }
    };

    loadBookings();

    // Realtime — re-fetch when any booking for this provider changes
    getMyProviderProfile().then(profile => {
      if (!profile || cancelled) return;
      channel = supabase
        .channel('provider-home-bookings')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bookings', filter: `provider_id=eq.${profile.id}` },
          () => { loadBookings(); }
        )
        .subscribe();
    }).catch(() => {});

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  // Bookings sourced exclusively from Supabase
  const providerBookings = useMemo(() => liveProviderBookings, [liveProviderBookings]);

  // Booking counts by date (heat map)
  const bookingCountsByDate = useMemo(() => {
    const counts: Record<string, number> = {};
    providerBookings.forEach((b) => {
      if (b.status !== BookingStatus.CANCELLED) {
        counts[b.bookingDate] = (counts[b.bookingDate] || 0) + 1;
      }
    });
    return counts;
  }, [providerBookings]);

  // Bookings for selected day
  const dayBookings = useMemo(() => {
    return providerBookings
      .filter((b) => b.bookingDate === selectedDateStr)
      .sort((a, b) => parseTimeToMinutes(a.bookingTime) - parseTimeToMinutes(b.bookingTime));
  }, [providerBookings, selectedDateStr]);

  // Pending bookings for selected day (need confirmation)
  const pendingDayBookings = useMemo(
    () => dayBookings.filter((b) => b.status === BookingStatus.PENDING),
    [dayBookings]
  );

  // Confirmed/active bookings for selected day
  const confirmedDayBookings = useMemo(
    () => dayBookings.filter((b) => b.status !== BookingStatus.PENDING),
    [dayBookings]
  );

  // NOW booking — first upcoming / in-progress booking for today
  const nowBooking = useMemo(() => {
    if (selectedDayIndex !== 0) return null;
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return (
      confirmedDayBookings.find((b) => {
        if (b.status === BookingStatus.IN_PROGRESS) return true;
        if (b.status === BookingStatus.UPCOMING) {
          return parseTimeToMinutes(b.bookingTime) >= nowMinutes;
        }
        return false;
      }) || null
    );
  }, [confirmedDayBookings, selectedDayIndex]);

  // Month grid cells
  const monthCells = useMemo(() => {
    return getMonthDays(currentMonth.getFullYear(), currentMonth.getMonth());
  }, [currentMonth]);

  const monthLabel = `${MONTH_NAMES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;

  // Split bookings into current (up to NOW) and next
  const { currentBookings, nextBookings } = useMemo(() => {
    if (selectedDayIndex !== 0 || !nowBooking) {
      return { currentBookings: [] as ConfirmedBooking[], nextBookings: confirmedDayBookings };
    }
    const nowIndex = confirmedDayBookings.findIndex((b) => b.id === nowBooking.id);
    return {
      currentBookings: confirmedDayBookings.slice(0, nowIndex + 1),
      nextBookings: confirmedDayBookings.slice(nowIndex + 1),
    };
  }, [confirmedDayBookings, nowBooking, selectedDayIndex]);

  // Handlers
  const toggleExpand = useCallback((bookingId: string) => {
    setExpansionStates((prev) => {
      const current = prev[bookingId] || 0;
      const next: ExpansionState = current === 0 ? 1 : current === 1 ? 2 : 0;
      return { ...prev, [bookingId]: next };
    });
  }, []);

  const handleBookingPress = useCallback(
    (booking: ConfirmedBooking) => {
      navigation.navigate('BookingDetail', { bookingId: booking.id, booking });
    },
    [navigation]
  );

  const navigateMonth = useCallback((direction: number) => {
    setCurrentMonth((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + direction);
      return next;
    });
  }, []);

  const handleMonthDayPress = useCallback(
    (dateString: string) => {
      const tabIndex = dayTabs.findIndex((t) => t.dateString === dateString);
      if (tabIndex >= 0) {
        setSelectedDayIndex(tabIndex);
      }
      setShowMonthView(false);
    },
    [dayTabs]
  );

  return (
    <AppBackground>
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* ==================== HEADER ==================== */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Upcoming Bookings</Text>
          <TouchableOpacity onPress={() => setShowMonthView(!showMonthView)}>
            <Text style={styles.viewMonthLink}>
              {showMonthView ? 'Hide Month' : 'View your Month'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ==================== MONTH VIEW (toggled) ==================== */}
        {showMonthView && (
          <View
            style={[
              styles.monthViewContainer,
              { backgroundColor: isDarkMode ? '#1C1C1E' : '#F8F8FA' },
            ]}
          >
            {/* Month Nav */}
            <View style={styles.monthNav}>
              <TouchableOpacity onPress={() => navigateMonth(-1)} style={styles.monthArrow}>
                <Text style={[styles.monthArrowText, { color: '#007AFF' }]}>{'‹'}</Text>
              </TouchableOpacity>
              <Text style={[styles.monthLabel, { color: theme.text }]}>{monthLabel}</Text>
              <TouchableOpacity onPress={() => navigateMonth(1)} style={styles.monthArrow}>
                <Text style={[styles.monthArrowText, { color: '#007AFF' }]}>{'›'}</Text>
              </TouchableOpacity>
            </View>

            {/* Day Headers */}
            <View style={styles.dayHeaderRow}>
              {DAY_HEADERS.map((day) => (
                <View key={day} style={styles.dayHeaderCell}>
                  <Text style={[styles.dayHeaderText, { color: theme.text + '55' }]}>{day}</Text>
                </View>
              ))}
            </View>

            {/* Calendar Grid */}
            <View style={styles.calendarGrid}>
              {monthCells.map((cell, index) => {
                if (!cell) {
                  return <View key={`empty-${index}`} style={styles.calendarCell} />;
                }
                const count = bookingCountsByDate[cell.dateString] || 0;
                const isToday = cell.dateString === todayStr;
                const isSelected = cell.dateString === selectedDateStr;
                const heatBg = getHeatColor(count, isDarkMode);

                return (
                  <TouchableOpacity
                    key={cell.dateString}
                    style={[
                      styles.calendarCell,
                      { backgroundColor: isSelected ? '#007AFF' : heatBg },
                      isToday && !isSelected && styles.todayCell,
                    ]}
                    onPress={() => handleMonthDayPress(cell.dateString)}
                    activeOpacity={0.6}
                  >
                    <Text
                      style={[
                        styles.calendarDayNumber,
                        { color: isSelected ? '#fff' : theme.text },
                        isToday && !isSelected && { color: '#007AFF', fontWeight: '700' },
                      ]}
                    >
                      {cell.date.getDate()}
                    </Text>
                    {count > 0 && (
                      <View
                        style={[
                          styles.bookingIndicatorDot,
                          { backgroundColor: isSelected ? '#fff' : '#007AFF' },
                        ]}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* ==================== DAY TABS ==================== */}
        <ScrollView
          ref={dayTabsScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.dayTabsContainer}
          contentContainerStyle={styles.dayTabsContent}
        >
          {dayTabs.map((tab, index) => (
            <TouchableOpacity
              key={tab.dateString}
              style={[styles.dayTab, selectedDayIndex === index && styles.dayTabSelected]}
              onPress={() => setSelectedDayIndex(index)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.dayTabText,
                  { color: selectedDayIndex === index ? theme.text : theme.text + '55' },
                  selectedDayIndex === index && styles.dayTabTextSelected,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ==================== SCROLLABLE BOOKING LIST ==================== */}
        <ScrollView
          style={styles.mainScroll}
          contentContainerStyle={styles.mainScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* NOW Banner */}
          {selectedDayIndex === 0 && nowBooking && (
            <LinearGradient
              colors={
                ['rgba(128,0,128,0.15)', 'rgba(128,0,128,0.05)'] as [string, string, ...string[]]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.nowBanner}
            >
              <Text style={[styles.nowBannerText, { color: theme.text }]}>
                NOW your {nowBooking.bookingTime} booking
              </Text>
            </LinearGradient>
          )}

          {/* Pending confirmation section */}
          {pendingDayBookings.length > 0 && (
            <>
              <View style={styles.pendingSectionHeader}>
                <View style={styles.pendingDot} />
                <Text style={styles.pendingSectionLabel}>AWAITING CONFIRMATION</Text>
              </View>
              {pendingDayBookings.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  expansionState={expansionStates[booking.id] || 0}
                  onToggleExpand={() => toggleExpand(booking.id)}
                  onPress={() => handleBookingPress(booking)}
                  isDarkMode={isDarkMode}
                  theme={theme}
                />
              ))}
              {confirmedDayBookings.length > 0 && (
                <View style={styles.pendingSectionDivider} />
              )}
            </>
          )}

          {/* "Upcoming" label on Today when there's no NOW booking */}
          {selectedDayIndex === 0 && confirmedDayBookings.length > 0 && !nowBooking && (
            <Text style={[styles.sectionLabel, { color: theme.text + '66' }]}>Upcoming</Text>
          )}

          {/* Current bookings (up to the NOW booking) */}
          {currentBookings.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              expansionState={expansionStates[booking.id] || 0}
              onToggleExpand={() => toggleExpand(booking.id)}
              onPress={() => handleBookingPress(booking)}
              isDarkMode={isDarkMode}
              theme={theme}
            />
          ))}

          {/* "Next" separator */}
          {currentBookings.length > 0 && nextBookings.length > 0 && (
            <Text style={[styles.nextSeparator, { color: theme.text + '55' }]}>Next</Text>
          )}

          {/* Remaining bookings */}
          {nextBookings.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              expansionState={expansionStates[booking.id] || 0}
              onToggleExpand={() => toggleExpand(booking.id)}
              onPress={() => handleBookingPress(booking)}
              isDarkMode={isDarkMode}
              theme={theme}
            />
          ))}

          {/* Empty state */}
          {dayBookings.length === 0 && pendingDayBookings.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyStateTitle, { color: theme.text + '44' }]}>
                No appointments
              </Text>
              <Text style={[styles.emptyStateSubtitle, { color: theme.text + '30' }]}>
                {selectedDayIndex === 0 ? "You're free today" : 'This day is free'}
              </Text>
            </View>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>
      </SafeAreaView>
    </AppBackground>
  );
}

// ====================== STYLES ======================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'BakbakOne-Regular',
    fontWeight: '700',
  },
  viewMonthLink: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '500',
    marginTop: 6,
  },

  // Day Tabs
  dayTabsContainer: {
    flexGrow: 0,
    paddingVertical: 4,
  },
  dayTabsContent: {
    paddingHorizontal: 20,
    gap: 24,
    alignItems: 'center',
  },
  dayTab: {
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  dayTabSelected: {
    borderBottomColor: '#000',
  },
  dayTabText: {
    fontSize: 15,
    fontWeight: '400',
  },
  dayTabTextSelected: {
    fontWeight: '600',
  },

  // Main scroll
  mainScroll: {
    flex: 1,
  },
  mainScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  // NOW Banner
  nowBanner: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  nowBannerText: {
    fontSize: 15,
    fontWeight: '600',
  },

  // Section labels
  sectionLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 12,
    marginLeft: 4,
  },

  // Pending section
  pendingSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  pendingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF9500',
    marginRight: 8,
  },
  pendingSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FF9500',
    letterSpacing: 0.8,
  },
  pendingSectionDivider: {
    height: 1,
    backgroundColor: 'rgba(142,142,147,0.2)',
    marginVertical: 16,
  },

  // Next separator
  nextSeparator: {
    fontSize: 14,
    fontWeight: '500',
    marginVertical: 12,
    marginLeft: 4,
  },

  // ========== Booking Card ==========
  bookingCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: { elevation: 3 },
    }),
  },
  cardTopGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 60,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  cardTime: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '500',
  },
  expandButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  expandButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007AFF',
  },

  // Collapsed
  collapsedInfo: {
    marginTop: 8,
  },
  collapsedService: {
    fontSize: 13,
  },

  // Summary
  summarySection: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  summaryHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '400',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 1,
  },
  notesValue: {
    fontSize: 13,
    fontStyle: 'italic',
    flex: 1,
  },
  addOnsSection: {
    marginVertical: 6,
  },
  addOnText: {
    fontSize: 13,
    color: '#FF9500',
    fontWeight: '500',
    marginBottom: 2,
  },
  paymentRow: {
    marginBottom: 2,
  },
  depositText: {
    fontSize: 13,
    color: '#34C759',
    fontWeight: '600',
  },
  totalDueText: {
    fontSize: 13,
    color: '#FF3B30',
    fontWeight: '600',
  },

  // Relevant Info
  relevantSection: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  relevantHeader: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 12,
  },
  instructionsText: {
    fontSize: 13,
    fontStyle: 'italic',
    marginVertical: 8,
    lineHeight: 18,
  },
  viewMessagesButton: {
    marginTop: 16,
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  viewMessagesText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 6,
  },
  emptyStateSubtitle: {
    fontSize: 14,
  },

  // ========== Month View ==========
  monthViewContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  monthArrow: {
    padding: 8,
  },
  monthArrowText: {
    fontSize: 28,
    fontWeight: '300',
  },
  monthLabel: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  dayHeaderRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  dayHeaderCell: {
    width: CELL_SIZE,
    alignItems: 'center',
  },
  dayHeaderText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: CELL_SIZE / 2,
    marginBottom: 2,
  },
  todayCell: {
    borderWidth: 1.5,
    borderColor: '#007AFF',
  },
  calendarDayNumber: {
    fontSize: 15,
    fontWeight: '500',
  },
  bookingIndicatorDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    position: 'absolute',
    bottom: 8,
  },
});
