// The provider's "Close my schedule" control on the schedule screen: a banner
// that says whether they're open, and the sheet they close from, which shows
// the bookings they already have so they can decide what happens to each.
//
// Keep and Move/Cancel are deliberately different weights. Keeping needs nothing
// from the server. Moving and cancelling open the booking from the Home
// calendar, on its day, the same as tapping it there: its own screen already
// owns group bookings, refunds and the client's notification, so this sheet
// adds no second way of moving money or a booking.
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import {
  closeMySchedule,
  getMyProviderProfile,
  getMyScheduleClosure,
  getProviderBookings,
  mergeProviderAutomationSettings,
  reopenMySchedule,
} from '../../services/databaseService';
import type { MyScheduleClosure } from '../../services/databaseService';
import { logger } from '../../utils/logger';
import { isDarkColor } from '../../constants/providerThemes';
import { canAutoCloseWhenFull, closureReasonForClient, CLOSURE_REASONS, type ClosureReason } from './scheduleClosure';
import {
  dateToYMD,
  formatLongDateNoYear,
  formatShortDayDate,
  formatTime12Safe,
  ordinalSuffix,
} from '../../utils/dateUtils';

type Palette = {
  bg: string;
  surface: string;
  card: string;
  accent: string;
  ice: string;
  text: string;
  sub: string;
  border: string;
  sep: string;
};

type UpcomingBooking = {
  id: string;
  date: string;
  time: string | null;
  clientName: string;
  serviceName: string;
};

type Props = {
  providerId: string;
  releaseDay: number | null;
  palette: Palette;
  isDarkMode: boolean;
  showToast: (message: string, kind?: 'success' | 'error' | 'info') => void;
  /** Leave for the booking's own screen; `date` is its YYYY-MM-DD day. */
  onOpenBooking: (bookingId: string, date: string, openReschedule: boolean) => void;
};

// Bookings can only be booked this far ahead anyway; the widest window is 180.
const UPCOMING_DAYS_AHEAD = 365;

// What the banner last knew, so coming back to this screen shows it at once
// while the check runs again behind it.
const lastClosure = new Map<string, MyScheduleClosure | null>();

function tomorrow(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
}

/** What the banner says about when a closed schedule opens again. */
function reopensLabel(closure: MyScheduleClosure | null): string {
  if (closure?.reopensOn) return `Reopens on ${formatLongDateNoYear(closure.reopensOn)}.`;
  if (closure?.nextReleaseAt) return `Reopens on your release day, ${formatLongDateNoYear(new Date(closure.nextReleaseAt))}.`;
  return 'Closed until you reopen it.';
}

export default function CloseScheduleSection({
  providerId,
  releaseDay,
  palette: P,
  isDarkMode,
  showToast,
  onOpenBooking,
}: Props) {
  const insets = useSafeAreaInsets();
  const [closure, setClosure] = useState<MyScheduleClosure | null>(lastClosure.get(providerId) ?? null);
  const [loaded, setLoaded] = useState(lastClosure.has(providerId));
  const [reason, setReason] = useState<ClosureReason | null>(null);
  const [tellClients, setTellClients] = useState(false);
  const [autoClose, setAutoClose] = useState(false);
  const [waitlistEnabled, setWaitlistEnabled] = useState<boolean | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const [sheetVisible, setSheetVisible] = useState(false);
  const [upcoming, setUpcoming] = useState<UpcomingBooking[] | null>(null);
  const [keptIds, setKeptIds] = useState<Set<string>>(new Set());
  const [reopenDate, setReopenDate] = useState<Date | null>(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);

  const isClosed = closure?.isClosed === true;

  const loadUpcoming = useCallback(() => {
    setUpcoming(null);
    getProviderBookings(0, providerId, UPCOMING_DAYS_AHEAD)
      .then((rows) => {
        const now = new Date();
        const today = dateToYMD(now);
        const timeNow = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        setUpcoming(
          rows
            .filter((b) => (b.status === 'confirmed' || b.status === 'pending')
              && (b.booking_date > today || (b.booking_date === today && (b.booking_time ?? '') >= timeNow)))
            .sort((a, b) => `${a.booking_date}${a.booking_time}`.localeCompare(`${b.booking_date}${b.booking_time}`))
            .map((b) => ({
              id: b.id,
              date: b.booking_date,
              time: b.booking_time,
              clientName: b.customer_name ?? 'Client',
              serviceName: b.service_name_snapshot ?? 'Booking',
            })),
        );
      })
      .catch((err) => {
        logger.error('[Schedule] upcoming bookings load failed:', err);
        setUpcoming([]);
        showToast("Couldn't load your upcoming bookings. Check them before closing.", 'error');
      });
  }, [providerId, showToast]);

  // Set when Move or Cancel leaves for the booking's own screen, so coming back
  // lands on the sheet with their choices intact and the list up to date.
  const returnToSheet = useRef(false);

  // On focus, not just on mount: a closure can end by the clock while this
  // screen sits in the stack.
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    getMyScheduleClosure()
      .then((row) => {
        lastClosure.set(providerId, row);
        if (!cancelled) setClosure(row);
      })
      .catch((err) => logger.error('[Schedule] closure load failed:', err))
      .finally(() => { if (!cancelled) setLoaded(true); });
    if (returnToSheet.current) {
      returnToSheet.current = false;
      setSheetVisible(true);
      loadUpcoming();
    }
    return () => { cancelled = true; };
  }, [loadUpcoming, providerId]));

  const openSheet = useCallback(() => {
    setKeptIds(new Set());
    setReopenDate(null);
    setReason(null);
    setTellClients(false);
    setSheetVisible(true);
    loadUpcoming();
    getMyProviderProfile()
      .then((profile) => {
        setAutoClose(profile?.automation_settings?.autoCloseWhenFull === true);
        setWaitlistEnabled(profile?.automation_settings?.waitlistEnabled);
      })
      .catch((err) => logger.error('[Schedule] close settings load failed:', err));
  }, [loadUpcoming]);

  const toggleAutoClose = useCallback((next: boolean) => {
    setAutoClose(next);
    mergeProviderAutomationSettings(providerId, { autoCloseWhenFull: next }).catch((err) => {
      logger.error('[Schedule] auto close save failed:', err);
      setAutoClose(!next);
      showToast("Couldn't save that. Please try again.", 'error');
    });
  }, [providerId, showToast]);

  const handleClose = useCallback(async () => {
    setBusy(true);
    try {
      await closeMySchedule(reopenDate ? dateToYMD(reopenDate) : null, reason, tellClients);
      const row = await getMyScheduleClosure();
      lastClosure.set(providerId, row);
      setClosure(row);
      setSheetVisible(false);
      showToast('Your schedule is closed.', 'success');
    } catch (err) {
      logger.error('[Schedule] close failed:', err);
      showToast("Couldn't close your schedule. Please try again.", 'error');
    } finally {
      setBusy(false);
    }
  }, [reopenDate, reason, tellClients, providerId, showToast]);

  const handleReopen = useCallback(async () => {
    setBusy(true);
    try {
      await reopenMySchedule();
      lastClosure.set(providerId, null);
      setClosure(null);
      showToast('Your schedule is open again.', 'success');
    } catch (err) {
      logger.error('[Schedule] reopen failed:', err);
      showToast("Couldn't reopen your schedule. Please try again.", 'error');
    } finally {
      setBusy(false);
    }
  }, [providerId, showToast]);

  const openBooking = useCallback((bookingId: string, date: string, openReschedule: boolean) => {
    returnToSheet.current = true;
    setSheetVisible(false);
    onOpenBooking(bookingId, date, openReschedule);
  }, [onOpenBooking]);

  const keepBooking = useCallback((bookingId: string) => {
    setKeptIds((prev) => new Set(prev).add(bookingId));
  }, []);

  const onDateChange = useCallback((_: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== 'ios') setDatePickerVisible(false);
    if (date) setReopenDate(date);
  }, []);

  const toldClients = closure?.showReason ? closureReasonForClient(closure.reason) : null;

  // Same size as the banner, so the screen doesn't jump when the check returns.
  if (!loaded) {
    return (
      <View style={[st.banner, { backgroundColor: P.card, borderColor: P.border }]} accessibilityLabel="Checking your schedule">
        <View style={st.bannerText}>
          <View style={[st.skeletonTitle, { backgroundColor: P.border }]} />
          <View style={[st.skeletonLine, { backgroundColor: P.border }]} />
        </View>
        <View style={[st.skeletonButton, { backgroundColor: P.surface }]} />
      </View>
    );
  }

  return (
    <>
      <View style={[st.banner, { backgroundColor: P.card, borderColor: P.border }]}>
        <View style={st.bannerText}>
          <Text style={[st.bannerTitle, { color: P.text }]}>
            {isClosed ? 'Your schedule is closed' : 'Taking a break?'}
          </Text>
          <Text style={[st.bannerSub, { color: P.sub }]}>
            {isClosed
              ? `${closure?.autoClosed ? 'You filled up, so it closed by itself. ' : ''}Clients see "Not taking bookings${toldClients ? `: ${toldClients.toLowerCase()}` : ''}". ${reopensLabel(closure)}`
              : 'Close your schedule to stop new bookings. Clients just see "Not taking bookings".'}
          </Text>
        </View>
        <TouchableOpacity
          style={[st.bannerBtn, { backgroundColor: isClosed ? P.accent : P.surface }]}
          onPress={isClosed ? handleReopen : openSheet}
          disabled={busy}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          {busy && isClosed ? (
            <ActivityIndicator size="small" color={isDarkColor(P.accent) ? '#FFFFFF' : '#1B2740'} />
          ) : (
            <Text style={[st.bannerBtnText, { color: isClosed ? (isDarkColor(P.accent) ? '#FFFFFF' : '#1B2740') : P.text }]}>
              {isClosed ? 'Reopen' : 'Close'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        animationType="slide"
        visible={sheetVisible}
        onRequestClose={() => setSheetVisible(false)}
      >
        <View style={st.overlay}>
          <View style={[st.sheet, { backgroundColor: P.bg, paddingBottom: insets.bottom + 16 }]}>
            <View style={st.sheetHeader}>
              <Text style={[st.sheetTitle, { color: P.text }]}>Close my schedule</Text>
              <TouchableOpacity
                style={[st.iconBtn, { backgroundColor: P.surface }]}
                onPress={() => setSheetVisible(false)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Don't close"
              >
                <Ionicons name="close" size={20} color={P.sub} />
              </TouchableOpacity>
            </View>

            <ScrollView style={st.sheetBody} showsVerticalScrollIndicator={false}>
              <Text style={[st.sectionLabel, { color: P.sub }]}>WHY (OPTIONAL)</Text>
              <View style={st.reasonRow}>
                {CLOSURE_REASONS.map((r) => {
                  const selected = reason === r.value;
                  return (
                    <TouchableOpacity
                      key={r.value}
                      style={[st.reasonChip, { backgroundColor: P.card, borderColor: selected ? P.accent : P.border }]}
                      onPress={() => {
                        setReason(selected ? null : r.value);
                        if (selected) setTellClients(false);
                      }}
                      activeOpacity={0.8}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                    >
                      <Text style={[st.optionText, { color: P.text }]}>{r.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {reason ? (
                <View style={[st.switchRow, { backgroundColor: P.card, borderColor: P.border }]}>
                  <View style={st.switchText}>
                    <Text style={[st.optionText, { color: P.text }]}>Tell clients why</Text>
                    <Text style={[st.hint, { color: P.sub }]}>
                      {tellClients
                        ? `Clients see "Not taking bookings: ${closureReasonForClient(reason)?.toLowerCase()}".`
                        : 'Clients just see "Not taking bookings".'}
                    </Text>
                  </View>
                  <Switch value={tellClients} onValueChange={setTellClients} trackColor={{ true: P.accent }} />
                </View>
              ) : null}

              <Text style={[st.sectionLabel, st.sectionGap, { color: P.sub }]}>WHEN IT REOPENS</Text>
              <TouchableOpacity
                style={[st.option, { backgroundColor: P.card, borderColor: reopenDate ? P.border : P.accent }]}
                onPress={() => { setReopenDate(null); setDatePickerVisible(false); }}
                activeOpacity={0.8}
                accessibilityRole="radio"
                accessibilityState={{ selected: !reopenDate }}
              >
                <Text style={[st.optionText, { color: P.text }]}>
                  {releaseDay != null
                    ? `On my next release day (the ${ordinalSuffix(releaseDay)})`
                    : 'When I reopen it'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[st.option, { backgroundColor: P.card, borderColor: reopenDate ? P.accent : P.border }]}
                onPress={() => { setReopenDate((d) => d ?? tomorrow()); setDatePickerVisible(true); }}
                activeOpacity={0.8}
                accessibilityRole="radio"
                accessibilityState={{ selected: !!reopenDate }}
              >
                <Text style={[st.optionText, { color: P.text }]}>
                  {reopenDate ? `On ${formatShortDayDate(reopenDate)}` : 'On a date I choose'}
                </Text>
              </TouchableOpacity>
              {datePickerVisible && (
                <DateTimePicker
                  mode="date"
                  value={reopenDate ?? tomorrow()}
                  onChange={onDateChange}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  themeVariant={isDarkMode ? 'dark' : 'light'}
                  textColor={P.text}
                  minimumDate={tomorrow()}
                />
              )}
              <Text style={[st.hint, { color: P.sub }]}>You can reopen any time.</Text>

              <Text style={[st.sectionLabel, st.sectionGap, { color: P.sub }]}>WHEN YOU FILL UP</Text>
              <View style={[st.switchRow, { backgroundColor: P.card, borderColor: P.border }]}>
                <View style={st.switchText}>
                  <Text style={[st.optionText, { color: P.text }]}>Close by itself when I'm fully booked</Text>
                  <Text style={[st.hint, { color: P.sub }]}>
                    {canAutoCloseWhenFull(waitlistEnabled)
                      ? "A slot that frees up won't be bookable until you reopen, or until your next release day if you have one."
                      : 'For when you don\'t use a waitlist. Turn your waitlist off in Automations to use this.'}
                  </Text>
                </View>
                <Switch
                  value={autoClose && canAutoCloseWhenFull(waitlistEnabled)}
                  onValueChange={toggleAutoClose}
                  disabled={!canAutoCloseWhenFull(waitlistEnabled)}
                  trackColor={{ true: P.accent }}
                />
              </View>

              <Text style={[st.sectionLabel, st.sectionGap, { color: P.sub }]}>YOUR UPCOMING BOOKINGS</Text>
              {upcoming === null ? (
                <ActivityIndicator style={st.loading} color={P.accent} />
              ) : upcoming.length === 0 ? (
                <Text style={[st.hint, { color: P.sub }]}>You have no upcoming bookings.</Text>
              ) : (
                <>
                  <Text style={[st.hint, st.hintBelow, { color: P.sub }]}>
                    These stay booked unless you change them. Can you still do them?
                  </Text>
                  {upcoming.map((b) => {
                    const kept = keptIds.has(b.id);
                    const time = formatTime12Safe(b.time);
                    return (
                      <View key={b.id} style={[st.booking, { backgroundColor: P.card, borderColor: P.border }]}>
                        <Text style={[st.bookingName, { color: P.text }]}>{b.clientName}</Text>
                        <Text style={[st.bookingDetail, { color: P.sub }]}>
                          {b.serviceName} · {formatShortDayDate(b.date)}{time ? ` · ${time}` : ''}
                        </Text>
                        {kept ? (
                          <Text style={[st.keptText, { color: P.accent }]}>You'll still do this one</Text>
                        ) : (
                          <View style={st.bookingActions}>
                            <TouchableOpacity
                              style={[st.actionBtn, { backgroundColor: P.surface }]}
                              onPress={() => keepBooking(b.id)}
                              activeOpacity={0.8}
                              accessibilityRole="button"
                            >
                              <Text style={[st.actionText, { color: P.text }]}>I can do it</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[st.actionBtn, { backgroundColor: P.surface }]}
                              onPress={() => openBooking(b.id, b.date, true)}
                              activeOpacity={0.8}
                              accessibilityRole="button"
                            >
                              <Text style={[st.actionText, { color: P.text }]}>Move</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[st.actionBtn, { backgroundColor: P.surface }]}
                              onPress={() => openBooking(b.id, b.date, false)}
                              activeOpacity={0.8}
                              accessibilityRole="button"
                            >
                              <Text style={[st.actionText, { color: P.text }]}>Cancel</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </>
              )}
            </ScrollView>

            <TouchableOpacity
              style={[st.closeBtn, { backgroundColor: P.accent, opacity: busy ? 0.6 : 1 }]}
              onPress={handleClose}
              disabled={busy}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator size="small" color={isDarkColor(P.accent) ? '#FFFFFF' : '#1B2740'} />
              ) : (
                <Text style={[st.closeBtnText, { color: isDarkColor(P.accent) ? '#FFFFFF' : '#1B2740' }]}>Close my schedule</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const st = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bannerText: { flex: 1 },
  bannerTitle: { fontSize: 14, fontWeight: '700' },
  bannerSub: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  bannerBtn: {
    minWidth: 76,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerBtnText: { fontSize: 14, fontWeight: '700' },
  skeletonTitle: { width: 130, height: 16, borderRadius: 6, opacity: 0.6 },
  skeletonLine: { width: '90%', height: 12, borderRadius: 6, marginTop: 8, opacity: 0.45 },
  skeletonButton: { width: 72, height: 44, borderRadius: 12 },
  reasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reasonChip: { borderWidth: 1, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 10 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 10 },
  switchText: { flex: 1, gap: 3 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { maxHeight: '90%', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 18, paddingHorizontal: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sheetTitle: { fontSize: 20, fontWeight: '700' },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sheetBody: { flexGrow: 0 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: 8 },
  sectionGap: { marginTop: 20 },
  option: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, marginBottom: 8 },
  optionText: { fontSize: 14, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 17 },
  hintBelow: { marginBottom: 10 },
  loading: { marginVertical: 16 },
  booking: { padding: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, marginBottom: 8 },
  bookingName: { fontSize: 14, fontWeight: '700' },
  bookingDetail: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  keptText: { fontSize: 13, fontWeight: '600', marginTop: 10 },
  bookingActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 13, fontWeight: '600' },
  closeBtn: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  closeBtnText: { fontSize: 15, fontWeight: '700' },
});
