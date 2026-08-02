// RescheduleScreen.tsx
// Reschedule flow extracted from BookingsScreen. Receives { bookingId } route param.
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFont } from '../contexts/FontContext';
import { useTheme } from '../contexts/ThemeContext';
import { ThemedBackground } from '../components/ThemedBackground';
import { useBooking, ConfirmedBooking, AvailableDate } from '../contexts/BookingContext';
import {
  getProviderReschedulePolicyByDisplayName,
  ProviderReschedulePolicy,
} from '../services/databaseService';

// ── Types ──────────────────────────────────────────────────────────────────────
type Props = {
  navigation: any;
  route: { params: { bookingId: string } };
};

interface DateOption {
  date: string;       // ISO YYYY-MM-DD
  displayDate: string;
  times: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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

function generateDynamicRescheduleDates(
  currentDate: string,
  currentTime: string,
  providerAvailableDates?: AvailableDate[],
): DateOption[] {
  if (providerAvailableDates && providerAvailableDates.length > 0) {
    return providerAvailableDates.map(entry => ({
      date: entry.date,
      displayDate: formatDisplayDate(entry.date),
      times: entry.times ?? [],
    }));
  }

  // Fallback: generate 5 dynamic dates from tomorrow, excluding the current booking date
  const options: DateOption[] = [];
  const start = new Date();
  start.setDate(start.getDate() + 1);
  const [ch, cm] = (currentTime || '10:00').split(':').map(Number);
  const baseHour = isNaN(ch!) ? 10 : ch!;
  const baseMin = isNaN(cm!) ? 0 : cm!;

  let added = 0;
  let i = 0;
  while (added < 5 && i < 60) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    i++;
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (iso === currentDate) continue;
    if (d.getDay() === 0) continue; // skip Sundays
    const displayDate = formatDisplayDate(iso);
    const times = [1, 2, 3].map(offset => {
      const h = baseHour + offset - 1;
      const safeH = h > 20 ? 20 : h;
      return `${String(safeH).padStart(2, '0')}:${String(baseMin).padStart(2, '0')}`;
    });
    options.push({ date: iso, displayDate, times });
    added++;
  }
  return options;
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function RescheduleScreen({ navigation, route }: Props) {
  useFont();
  const { bookingId } = route.params;
  const { theme, isDarkMode } = useTheme();
  const {
    todayBookings, upcomingBookings, pastBookings,
    requestReschedule, confirmReschedule,
  } = useBooking();

  const booking = useMemo(() =>
    [...(todayBookings ?? []), ...(upcomingBookings ?? []), ...(pastBookings ?? [])].find(b => b.id === bookingId)
  , [bookingId, todayBookings, upcomingBookings, pastBookings]);

  const [reschedulePolicy, setReschedulePolicy] = useState<ProviderReschedulePolicy | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dateOptions, setDateOptions] = useState<DateOption[]>([]);
  const [phase, setPhase] = useState<'pick' | 'confirm' | 'done'>('pick');

  // Load policy and build date options
  useEffect(() => {
    if (!booking) return;
    getProviderReschedulePolicyByDisplayName(booking.providerName)
      .then(setReschedulePolicy).catch(() => {});

    // If provider has already responded with available dates, use those
    const providerDates = booking.rescheduleRequest?.providerAvailableDates;
    const options = generateDynamicRescheduleDates(booking.bookingDate, booking.bookingTime, providerDates);
    setDateOptions(options);
  }, [booking?.id]);

  const C = isDarkMode ? {
    bg: '#1A1815', card: '#252220', text: '#F0ECE7', sub: '#7E6667',
    border: 'rgba(126,102,103,0.18)', accent: '#AF9197',
  } : {
    bg: '#F5F1EC', card: '#FFFFFF', text: '#000000', sub: '#7E6667',
    border: 'rgba(126,102,103,0.14)', accent: '#AF9197',
  };

  const handleDateSelect = useCallback((date: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedDate(date);
    setSelectedTime(null);
  }, []);

  const handleTimeSelect = useCallback((time: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTime(time);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!booking || !selectedDate || !selectedTime) return;

    const isConfirmPhase = !!booking.rescheduleRequest?.providerAvailableDates;

    setIsSubmitting(true);
    try {
      if (isConfirmPhase) {
        await confirmReschedule(booking.id, selectedDate, selectedTime);
      } else {
        await requestReschedule(booking.id, [`${selectedDate} ${selectedTime}`]);
      }
      setPhase('done');
    } catch (err: any) {
      // confirm_reschedule_own_booking / request_reschedule_own_booking (see
      // supabase/booking_rules_server_enforcement.sql) raise "Booking not
      // found" when the server-side row no longer matches what this device's
      // local cache thinks is true — e.g. the booking was cancelled or
      // already resolved elsewhere since this screen loaded. The local state
      // is stale in that case, so bounce back to Bookings (which re-syncs
      // from Supabase) instead of leaving the user stuck on a dead screen.
      if (err?.message === 'Booking not found') {
        Alert.alert(
          'Booking No Longer Available',
          "This booking couldn't be found — it may have changed since you opened this screen. Pull to refresh your bookings list.",
          [{ text: 'OK', onPress: () => navigation.popTo('Bookings') }],
        );
      } else if (err?.code === '23505' || err?.code === '23P01') {
        // 23505 = exact same slot taken since this screen loaded; 23P01 =
        // the buffer/overlap exclusion constraint (prevent_overlapping_bookings.sql)
        // caught a different-start-time overlap. Either way this is a raw
        // Postgres error with no friendly .message — don't show it as-is.
        Alert.alert('Time No Longer Available', 'That time was just taken by another booking. Please choose a different time.');
      } else if (
        err?.message === 'Waiting for provider to respond with available dates' ||
        err?.message === 'A reschedule request is already in progress for this booking'
      ) {
        // Not a failure — a request from this device or another one is
        // already on file server-side (e.g. a near-simultaneous duplicate
        // tap, or the isWaitingForProvider guard above didn't have this
        // screen's local state refreshed yet). Reflect it as the normal
        // "already requested" state instead of a scary error toast, and pop
        // back so the parent list re-syncs and this screen would show the
        // pending view above if reopened.
        Alert.alert(
          'Reschedule Already Requested',
          `You already have a reschedule request in for this booking. Waiting for ${booking.providerName} to respond.`,
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
      } else {
        Alert.alert('Reschedule Failed', err?.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [booking, selectedDate, selectedTime, requestReschedule, confirmReschedule]);

  if (!booking) {
    return (
      <ThemedBackground>
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#7E6667', fontSize: 16 }}>Booking not found.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
            <Text style={{ color: '#AF9197', fontSize: 16 }}>Go Back</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </ThemedBackground>
    );
  }

  const hasProviderResponse = !!booking.rescheduleRequest?.providerAvailableDates;
  const selectedDateOption = dateOptions.find(d => d.date === selectedDate);
  // A request is already on file and the provider hasn't responded yet.
  // Previously this state wasn't checked here at all — the picker/submit UI
  // stayed up, so tapping submit again hit BookingContext's own guard and
  // surfaced "Waiting for provider to respond with available dates" as an
  // opaque "Reschedule Failed" alert (see handleSubmit's catch below), even
  // though nothing had actually failed — a request was already correctly in
  // flight. Show what was requested instead of a dead-end error.
  const isWaitingForProvider = booking.isPendingReschedule && !hasProviderResponse;

  if (phase === 'done') {
    return (
      <ThemedBackground>
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 56, marginBottom: 16 }}>✓</Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: C.text, textAlign: 'center', marginBottom: 8 }}>
            {hasProviderResponse ? 'Booking Rescheduled!' : 'Request Sent!'}
          </Text>
          <Text style={{ fontSize: 15, color: C.sub, textAlign: 'center', lineHeight: 22, marginBottom: 32 }}>
            {hasProviderResponse
              ? `Your appointment with ${booking.providerName} has been rescheduled to ${formatDisplayDate(selectedDate!)} at ${selectedTime}.`
              : `Your reschedule request has been sent to ${booking.providerName}. You'll be notified when they respond with available times.`}
          </Text>
          <TouchableOpacity style={[st.primaryBtn, { backgroundColor: C.accent, width: '100%' }]} onPress={() => {
            // popTo targets the Bookings route directly. This used to be two
            // blind goBack() calls, which assumed BookingDetail always sat
            // between Reschedule and the list — but the notification deep link
            // goes Bookings → Reschedule with no BookingDetail in between, so
            // the second pop overshot the list (and, before backBehavior was
            // set, bubbled to the tab navigator and landed on Becca).
            // Bookings is registered in every stack that hosts Reschedule.
            navigation.popTo('Bookings');
          }} activeOpacity={0.7}>
            <Text style={st.primaryBtnText}>Back to Bookings</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </ThemedBackground>
    );
  }

  if (isWaitingForProvider) {
    const requestedDates = booking.rescheduleRequest?.requestedDates ?? [];
    const requestedTimes = booking.rescheduleRequest?.requestedTimes ?? [];
    return (
      <ThemedBackground>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
          <View style={[st.topBar, { borderBottomColor: C.border }]}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn} activeOpacity={0.7}>
              <Text style={[st.backArrow, { color: C.accent }]}>‹</Text>
              <Text style={[st.backLabel, { color: C.sub }]}>Back</Text>
            </TouchableOpacity>
            <Text style={[st.topTitle, { color: C.text }]}>Reschedule</Text>
            <View style={{ width: 60 }} />
          </View>

          <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
            <View style={st.headerInfo}>
              <Text style={[st.providerName, { color: C.text }]}>{booking.providerName}</Text>
              <Text style={[st.serviceName, { color: C.sub }]}>{booking.serviceName}</Text>
              <View style={[st.currentDateBadge, { backgroundColor: C.card, borderColor: C.border }]}>
                <Ionicons name="calendar-outline" size={14} color={C.sub} />
                <Text style={[st.currentDateText, { color: C.sub }]}>
                  Currently: {formatDisplayDate(booking.bookingDate)} at {booking.bookingTime}
                </Text>
              </View>
            </View>

            <View style={st.section}>
              <View style={{ backgroundColor: 'rgba(175,145,151,0.10)', borderColor: 'rgba(175,145,151,0.30)', borderWidth: 1, borderRadius: 12, padding: 14 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.accent, marginBottom: 4 }}>
                  Reschedule Requested
                </Text>
                <Text style={{ fontSize: 12, color: C.sub, lineHeight: 18 }}>
                  You've already asked {booking.providerName} to reschedule this booking. You'll be notified as soon as they respond with available times — no need to request again.
                </Text>
              </View>
            </View>

            {requestedDates.length > 0 && (
              <View style={st.section}>
                <Text style={[st.sectionTitle, { color: C.sub }]}>YOU REQUESTED</Text>
                <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
                  {requestedDates.map((d, i) => (
                    <View
                      key={`${d}-${i}`}
                      style={[st.row, { borderBottomColor: C.border, borderBottomWidth: i === requestedDates.length - 1 ? 0 : StyleSheet.hairlineWidth }]}
                    >
                      <Text style={[st.rowLabel, { color: C.sub, flex: 1 }]}>{formatDisplayDate(d)}</Text>
                      {!!requestedTimes[i] && (
                        <Text style={[st.rowValue, { color: C.text, fontWeight: '700', flex: 0 }]}>{requestedTimes[i]}</Text>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </ThemedBackground>
    );
  }

  return (
    <ThemedBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        {/* Top bar */}
        <View style={[st.topBar, { borderBottomColor: C.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn} activeOpacity={0.7}>
            <Text style={[st.backArrow, { color: C.accent }]}>‹</Text>
            <Text style={[st.backLabel, { color: C.sub }]}>Back</Text>
          </TouchableOpacity>
          <Text style={[st.topTitle, { color: C.text }]}>Reschedule</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
          {/* Header info */}
          <View style={st.headerInfo}>
            <Text style={[st.providerName, { color: C.text }]}>{booking.providerName}</Text>
            <Text style={[st.serviceName, { color: C.sub }]}>{booking.serviceName}</Text>
            <View style={[st.currentDateBadge, { backgroundColor: C.card, borderColor: C.border }]}>
              <Ionicons name="calendar-outline" size={14} color={C.sub} />
              <Text style={[st.currentDateText, { color: C.sub }]}>
                Currently: {formatDisplayDate(booking.bookingDate)} at {booking.bookingTime}
              </Text>
            </View>
          </View>

          {/* Context banner */}
          <View style={st.section}>
            {hasProviderResponse ? (
              <View style={{ backgroundColor: 'rgba(175,145,151,0.10)', borderColor: 'rgba(175,145,151,0.30)', borderWidth: 1, borderRadius: 12, padding: 14 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.accent, marginBottom: 4 }}>
                  {booking.providerName} sent available times
                </Text>
                <Text style={{ fontSize: 12, color: C.sub, lineHeight: 18 }}>
                  Pick one of these provider-offered slots to confirm your new appointment.
                </Text>
              </View>
            ) : (
              <View style={{ backgroundColor: 'rgba(255,149,0,0.08)', borderColor: 'rgba(255,149,0,0.22)', borderWidth: 1, borderRadius: 12, padding: 14 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#FF9500', marginBottom: 4 }}>
                  How rescheduling works
                </Text>
                <Text style={{ fontSize: 12, color: C.sub, lineHeight: 18 }}>
                  Select your preferred date and time below. Your provider will be notified and will confirm or propose alternative times.
                </Text>
              </View>
            )}
          </View>

          {/* Reschedule policy info */}
          {reschedulePolicy && (
            <View style={st.section}>
              <Text style={[st.sectionTitle, { color: C.sub }]}>PROVIDER POLICY</Text>
              <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
                {reschedulePolicy.maxReschedules !== null && (
                  <View style={[st.row, { borderBottomColor: C.border }]}>
                    <Text style={[st.rowLabel, { color: C.sub }]}>Reschedules allowed</Text>
                    <Text style={[st.rowValue, { color: C.text }]}>
                      {booking.rescheduleRequest?.rescheduleCount ?? 0} / {reschedulePolicy.maxReschedules} used
                    </Text>
                  </View>
                )}
                {reschedulePolicy.rescheduleNoticeHours > 0 && (
                  <View style={[st.row, { borderBottomWidth: 0 }]}>
                    <Text style={[st.rowLabel, { color: C.sub }]}>Notice required</Text>
                    <Text style={[st.rowValue, { color: C.text }]}>{reschedulePolicy.rescheduleNoticeHours}h before</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Date selection */}
          <View style={st.section}>
            <Text style={[st.sectionTitle, { color: C.sub }]}>
              {hasProviderResponse ? 'AVAILABLE DATES FROM PROVIDER' : 'SELECT A DATE'}
            </Text>
            {dateOptions.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                <ActivityIndicator color={C.accent} />
                <Text style={{ color: C.sub, marginTop: 8, fontSize: 13 }}>Loading available dates…</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
                {dateOptions.map(opt => {
                  const isSelected = selectedDate === opt.date;
                  return (
                    <TouchableOpacity
                      key={opt.date}
                      style={[st.dateChip, { backgroundColor: isSelected ? C.accent : C.card, borderColor: isSelected ? C.accent : C.border }]}
                      onPress={() => handleDateSelect(opt.date)}
                      activeOpacity={0.7}
                    >
                      <Text style={{ color: isSelected ? '#FFF' : C.sub, fontSize: 10, fontWeight: '600', marginBottom: 2 }}>
                        {opt.displayDate.split(' ')[0]?.toUpperCase()}
                      </Text>
                      <Text style={{ color: isSelected ? '#FFF' : C.text, fontSize: 18, fontWeight: '800' }}>
                        {opt.displayDate.split(' ')[1]}
                      </Text>
                      <Text style={{ color: isSelected ? 'rgba(255,255,255,0.8)' : C.sub, fontSize: 11 }}>
                        {opt.displayDate.split(' ').slice(2).join(' ')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* Time selection */}
          {selectedDate && selectedDateOption && selectedDateOption.times.length > 0 && (
            <View style={st.section}>
              <Text style={[st.sectionTitle, { color: C.sub }]}>SELECT A TIME</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {selectedDateOption.times.map(time => {
                  const isSelected = selectedTime === time;
                  return (
                    <TouchableOpacity
                      key={time}
                      style={[st.timeChip, { backgroundColor: isSelected ? C.accent : C.card, borderColor: isSelected ? C.accent : C.border }]}
                      onPress={() => handleTimeSelect(time)}
                      activeOpacity={0.7}
                    >
                      <Text style={{ color: isSelected ? '#FFF' : C.text, fontSize: 15, fontWeight: '600' }}>{time}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Summary */}
          {selectedDate && selectedTime && (
            <View style={st.section}>
              <Text style={[st.sectionTitle, { color: C.sub }]}>YOUR SELECTION</Text>
              <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
                <View style={[st.row, { borderBottomColor: C.border }]}>
                  <Text style={[st.rowLabel, { color: C.sub }]}>New Date</Text>
                  <Text style={[st.rowValue, { color: C.text, fontWeight: '700' }]}>{formatDisplayDate(selectedDate)}</Text>
                </View>
                <View style={[st.row, { borderBottomWidth: 0 }]}>
                  <Text style={[st.rowLabel, { color: C.sub }]}>New Time</Text>
                  <Text style={[st.rowValue, { color: C.text, fontWeight: '700' }]}>{selectedTime}</Text>
                </View>
              </View>
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Submit button */}
        <View style={[st.footer, { borderTopColor: C.border, backgroundColor: isDarkMode ? '#1A1815' : '#F5F1EC' }]}>
          <TouchableOpacity
            style={[st.primaryBtn, { backgroundColor: selectedDate && selectedTime ? C.accent : C.border }]}
            disabled={!selectedDate || !selectedTime || isSubmitting}
            onPress={handleSubmit}
            activeOpacity={0.8}
          >
            {isSubmitting
              ? <ActivityIndicator size="small" color="#FFF" />
              : <Text style={st.primaryBtnText}>
                  {hasProviderResponse ? 'Confirm New Time' : 'Request Reschedule'}
                </Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </ThemedBackground>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 60 },
  backArrow: { fontSize: 28, fontWeight: '300', marginRight: 4 },
  backLabel: { fontSize: 16 },
  topTitle: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  scroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  headerInfo: { alignItems: 'center', marginBottom: 20 },
  providerName: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  serviceName: { fontSize: 14, marginBottom: 10 },
  currentDateBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, gap: 6, borderWidth: StyleSheet.hairlineWidth },
  currentDateText: { fontSize: 13 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rowLabel: { fontSize: 13, flex: 0.5 },
  rowValue: { fontSize: 13, flex: 0.5, textAlign: 'right' },
  dateChip: { borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', minWidth: 75 },
  timeChip: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 18, paddingVertical: 12, alignItems: 'center' },
  footer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: Platform.select({ ios: 28, android: 16 }) ?? 16, borderTopWidth: StyleSheet.hairlineWidth },
  primaryBtn: { borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});

