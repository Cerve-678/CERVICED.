// RescheduleScreen.tsx
// Reschedule flow extracted from BookingsScreen. Receives { bookingId } route param.
import React, { useState, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useFont } from '../../contexts/FontContext';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemedBackground } from '../../components/ThemedBackground';
import { useAppDialog } from '../../components/AppDialog';
import { FLOATING_TAB_BAR_CLEARANCE } from '../../components/IslandPillTabBar';
import { useBooking, AvailableDate } from '../../contexts/BookingContext';
import {
  getProviderReschedulePolicyById,
  getProviderReschedulePolicyByDisplayName,
  ProviderReschedulePolicy,
} from '../../services/databaseService';
import { AvailabilityService } from '../../services/AvailabilityService';
import { formatLongDate, formatTime12, formatTime12Safe, dateToYMD } from '../../utils/dateUtils';
import {
  rescheduleProbeStart, rescheduleCandidateDates, rescheduleWindowLabel, rescheduleRequestToken,
  RESCHEDULE_MAX_DATES,
} from '../../utils/rescheduleWindow';
import { logger, reportError } from '../../utils/logger';

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
function formatDisplayDate(dateStr: string): string {
  return formatLongDate(dateStr);
}

function dateToTimeHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function providerRespondedDates(providerAvailableDates: AvailableDate[]): DateOption[] {
  return providerAvailableDates.map(entry => ({
    date: entry.date,
    displayDate: formatDisplayDate(entry.date),
    times: entry.times ?? [],
  }));
}

// Client-request path: probe the provider's REAL open slots across a
// RESCHEDULE_HORIZON_DAYS window (see rescheduleProbeStart for where it
// starts) via getAvailableSlots — the same buffer/notice/booking-window-aware
// source the new-booking picker and the provider's own reschedule modals use —
// and surface only dates that actually have openings.
// This replaces an older generator that fabricated 5 dates × 3 synthetic times
// off the current booking time — those were never real availability, so a
// client could request a slot the provider's own policies would reject.
async function fetchRealRescheduleDates(
  providerId: string,
  currentDate: string,
  isActive: () => boolean = () => true,
): Promise<DateOption[]> {
  const candidateDates = rescheduleCandidateDates(currentDate);

  // Probe in small batches and stop once the UI has enough open dates. The
  // old all-at-once Promise.all fanned a 14-day horizon into dozens of
  // concurrent availability reads even when the first week was wide open.
  const openDates: DateOption[] = [];
  const batchSize = 3;
  for (let offset = 0; offset < candidateDates.length; offset += batchSize) {
    if (!isActive()) return openDates;
    const batch = candidateDates.slice(offset, offset + batchSize);
    const results = await Promise.all(
      batch.map(async date => ({
        date,
        times: await AvailabilityService.getAvailableSlotTimes(providerId, date).catch(() => [] as string[]),
      })),
    );
    if (!isActive()) return openDates;
    for (const result of results) {
      if (result.times.length === 0) continue;
      openDates.push({
        date: result.date,
        displayDate: formatDisplayDate(result.date),
        times: result.times,
      });
      if (openDates.length >= RESCHEDULE_MAX_DATES) return openDates;
    }
  }
  return openDates;
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function RescheduleScreen({ navigation, route }: Props) {
  useFont();
  const { bookingId } = route.params;
  const { palette: C, isDarkMode } = useTheme();
  const { showConfirm, showAlert, DialogHost } = useAppDialog();
  const {
    todayBookings, upcomingBookings, pastBookings,
    requestReschedule, confirmReschedule, declineReschedule,
    confirmGroupReschedule, declineGroupReschedule, getBookingsByGroupId,
  } = useBooking();

  const booking = useMemo(() =>
    [...(todayBookings ?? []), ...(upcomingBookings ?? []), ...(pastBookings ?? [])].find(b => b.id === bookingId)
  , [bookingId, todayBookings, upcomingBookings, pastBookings]);

  // Native stack header (not a custom in-body top bar) — gives the real
  // OS-provided back button and swipe-back gesture, same convention as
  // SearchScreen. headerBackButtonDisplayMode: 'minimal' drops the "Back"
  // title text, leaving just the platform-correct chevron.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTransparent: false,
      headerTitle: 'Reschedule',
      headerTitleAlign: 'center',
      headerTitleStyle: { fontFamily: 'BakbakOne-Regular', fontSize: 16, color: C.text },
      headerStyle: { backgroundColor: C.bg },
      headerShadowVisible: false,
      headerTintColor: C.accentText,
      headerBackButtonDisplayMode: 'minimal',
    });
  }, [navigation, C]);

  // A group reschedule proposal (see supabase/fix_group_booking_reschedule.sql)
  // stamps EVERY sibling's request row with the same groupRescheduleBatchId —
  // its presence, not just booking.groupBookingId, is what means "this
  // client should confirm/decline the whole group here," since a grouped
  // booking can exist without an active reschedule request at all.
  const groupBatchId = booking?.rescheduleRequest?.groupRescheduleBatchId;
  const isGroupReschedule = !!groupBatchId && !!booking?.groupBookingId;
  const groupSiblings = useMemo(
    () => (isGroupReschedule ? getBookingsByGroupId(booking!.groupBookingId!) : []),
    [isGroupReschedule, booking, getBookingsByGroupId]
  );

  const [reschedulePolicy, setReschedulePolicy] = useState<ProviderReschedulePolicy | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dateOptions, setDateOptions] = useState<DateOption[]>([]);
  const [loadingDates, setLoadingDates] = useState(true);
  // A provider can go live with zero rows in provider_availability. Without
  // this, "no schedule at all" and "genuinely nothing open in the horizon"
  // both land on dateOptions.length === 0 and show the same generic "no
  // open times" copy — same gap ModernBeautyCalendar had before it was
  // wired to getAvailabilitySummary's 'unpublished' state.
  const [providerUnpublished, setProviderUnpublished] = useState(false);
  const [phase, setPhase] = useState<'pick' | 'confirm' | 'done'>('pick');
  const [isDeclining, setIsDeclining] = useState(false);

  // "Request a specific time" — an escape hatch alongside the probed-availability
  // chips, for a client who wants to propose an exact date/time rather than
  // pick from what was found open. Only meaningful pre-provider-response: once
  // the provider has replied with their own slots, those are the only valid
  // choices (see hasProviderResponse below), so this never shows then.
  const [customPickerStep, setCustomPickerStep] = useState<'date' | 'time' | null>(null);
  const [customDate, setCustomDate] = useState<Date | null>(null);

  // A reused route must never carry a date/time (or a confirmation phase)
  // from one booking into another. Keep this keyed to the route id rather than
  // the booking object, which can legitimately refresh while the user chooses.
  useEffect(() => {
    setSelectedDate(null);
    setSelectedTime(null);
    setPhase('pick');
    setCustomPickerStep(null);
    setCustomDate(null);
  }, [bookingId]);

  // Load policy and build date options
  useEffect(() => {
    if (!booking) return;
    let active = true;
    setReschedulePolicy(null);
    (booking.providerId
      ? getProviderReschedulePolicyById(booking.providerId)
      : getProviderReschedulePolicyByDisplayName(booking.providerName)
    ).then(policy => {
      if (active) setReschedulePolicy(policy);
    }).catch(() => {});

    // If the provider has already responded, use the specific slots they
    // offered — those are the only valid choices at that point, and no live
    // probe is needed. Otherwise (client-request path) probe the provider's
    // REAL availability rather than fabricating placeholder dates/times.
    const providerDates = booking.rescheduleRequest?.providerAvailableDates;
    if (providerDates && providerDates.length > 0) {
      setDateOptions(providerRespondedDates(providerDates));
      setProviderUnpublished(false);
      setLoadingDates(false);
    } else {
      // getAvailableSlots resolves a provider by id or display name, so fall
      // back to the name when this booking snapshot has no providerId.
      const providerRef = booking.providerId || booking.providerName;
      if (!providerRef) {
        setDateOptions([]);
        setProviderUnpublished(false);
        setLoadingDates(false);
      } else {
        setLoadingDates(true);
        setProviderUnpublished(false);
        Promise.all([
          fetchRealRescheduleDates(providerRef, booking.bookingDate, () => active),
          AvailabilityService.getAvailabilitySummary(providerRef).catch(() => null),
        ])
          .then(([options, summary]) => {
            if (!active) return;
            setDateOptions(options);
            setProviderUnpublished(options.length === 0 && summary?.state === 'unpublished');
          })
          .catch(() => { if (active) setDateOptions([]); })
          .finally(() => { if (active) setLoadingDates(false); });
      }
    }
    return () => { active = false; };
  }, [booking]);

  const handleDateSelect = useCallback((date: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedDate(date);
    setSelectedTime(null);
  }, []);

  const handleTimeSelect = useCallback((time: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedTime(time);
  }, []);

  // Earliest date/time the picker allows — tomorrow at minimum (matching
  // fetchRealRescheduleDates' own "from tomorrow" floor above), pushed out
  // further if the provider's policy requires more notice than that.
  const minPickerDate = useMemo(() => {
    const floor = new Date();
    floor.setDate(floor.getDate() + 1);
    floor.setHours(0, 0, 0, 0);
    if (reschedulePolicy?.rescheduleNoticeHours) {
      const noticeFloor = new Date();
      noticeFloor.setHours(noticeFloor.getHours() + reschedulePolicy.rescheduleNoticeHours);
      if (noticeFloor > floor) return noticeFloor;
    }
    return floor;
  }, [reschedulePolicy]);

  // Describes the window fetchRealRescheduleDates actually probed, so the
  // empty state doesn't claim "the next 14 days" for a booking whose window is
  // anchored months out (see rescheduleProbeStart).
  const probeWindowLabel = useMemo(
    () => (booking ? rescheduleWindowLabel(booking.bookingDate) : ''),
    [booking],
  );

  // Open the spinner near the booking's own date rather than always on
  // tomorrow — moving an appointment three months out otherwise meant
  // spinning through every intervening month. minPickerDate stays the hard
  // floor (notice period), it's only the starting position that moves.
  const customPickerSeed = useMemo(() => {
    if (!booking) return minPickerDate;
    const anchored = rescheduleProbeStart(booking.bookingDate);
    return anchored > minPickerDate ? anchored : minPickerDate;
  }, [booking, minPickerDate]);

  const openCustomDatePicker = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setCustomDate(customPickerSeed);
    setCustomPickerStep('date');
  }, [customPickerSeed]);

  const handleCustomDateChange = useCallback((_: unknown, picked?: Date) => {
    if (Platform.OS === 'android') setCustomPickerStep(null);
    if (!picked) return;
    setCustomDate(picked);
    if (Platform.OS === 'android') {
      setSelectedDate(dateToYMD(picked));
      setSelectedTime(null);
      setCustomPickerStep('time');
    }
  }, []);

  const handleCustomTimeChange = useCallback((_: unknown, picked?: Date) => {
    if (Platform.OS === 'android') setCustomPickerStep(null);
    if (!picked || !customDate) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSelectedDate(dateToYMD(customDate));
    setSelectedTime(dateToTimeHHMM(picked));
  }, [customDate]);

  const handleSubmit = useCallback(async () => {
    if (!booking || !selectedDate || !selectedTime) return;

    const isConfirmPhase = !!booking.rescheduleRequest?.providerAvailableDates;

    setIsSubmitting(true);
    try {
      // Confirming a provider-offered slot writes straight to bookings with
      // no server-side conflict lookup of its own (confirm_reschedule_own_booking
      // / confirm_group_reschedule just UPDATE; the DB's bookings_no_overlap
      // exclusion constraint is the only backstop). The offered dates were
      // fetched once on screen mount, so a slot picked minutes/hours later can
      // have gone stale — re-check live right before submitting so a taken
      // slot surfaces here with the chip UI intact, instead of only after the
      // RPC round-trip via the raw 23505/23P01 catch below.
      if (isConfirmPhase) {
        const providerRef = booking.providerId || booking.providerName;
        const staleCheck = await AvailabilityService.isSlotAvailable(
          providerRef, selectedDate, selectedTime, booking.duration, booking.serviceId,
        );
        if (staleCheck.hasConflict) {
          showAlert('Time No Longer Available', staleCheck.message || 'Please choose a different time.');
          setIsSubmitting(false);
          return;
        }
      }

      if (isGroupReschedule) {
        // Group reschedule is provider-initiated only (see
        // supabase/fix_group_booking_reschedule.sql) — this screen never
        // sends a fresh group request itself, only confirms/declines an
        // existing one, so isConfirmPhase is always true whenever
        // isGroupReschedule is true (hasProviderResponse gates the whole
        // picker UI below the same way).
        await confirmGroupReschedule(booking.groupBookingId!, groupSiblings, selectedDate, selectedTime);
      } else if (isConfirmPhase) {
        await confirmReschedule(booking.id, selectedDate, selectedTime);
      } else {
        // Never `${selectedDate} ${selectedTime}` — the slot chips carry
        // 12-hour strings and both ends of this pipe split the token on
        // whitespace, which dropped the meridiem. See rescheduleRequestToken.
        await requestReschedule(booking.id, [rescheduleRequestToken(selectedDate, selectedTime)]);
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
        showConfirm(
          'Booking No Longer Available',
          "This booking couldn't be found — it may have changed since you opened this screen. Pull to refresh your bookings list.",
          [{ text: 'OK', onPress: () => navigation.popTo('Bookings') }],
        );
      } else if (err?.code === '23505' || err?.code === '23P01') {
        // 23505 = exact same slot taken since this screen loaded; 23P01 =
        // the buffer/overlap exclusion constraint (prevent_overlapping_bookings.sql)
        // caught a different-start-time overlap. Either way this is a raw
        // Postgres error with no friendly .message — don't show it as-is.
        showAlert('Time No Longer Available', 'Please choose a different time.');
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
        showConfirm(
          'Reschedule Already Requested',
          `You already have a reschedule request in for this booking. Waiting for ${booking.providerName} to respond.`,
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
      } else if (err?.code === 'P0001' && /notice to reschedule/i.test(err?.message ?? '')) {
        // request_reschedule_own_booking() gates on the EXISTING booking's
        // proximity to now (see isPastNoticeWindow above), which should have
        // blocked this screen before the picker ever rendered. Reaching this
        // means the client-side reschedulePolicy fetch was stale/slower than
        // the notice window lapsing between screen-open and submit — show
        // the same friendly framing as that blocking screen instead of the
        // raw Postgres message, then bounce back since no chip here can work.
        showConfirm(
          'Too Close to Reschedule',
          `${booking.providerName} requires more notice than this appointment now has left. Message them directly if you need to change it.`,
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
      } else if (err?.message === 'No bookings found in storage') {
        // Local cache is out of sync with the server (the booking was resolved
        // or removed elsewhere). "storage" is a developer term — never show it.
        showConfirm(
          'Booking No Longer Available',
          "This booking isn't available anymore. Pull down to refresh your bookings.",
          [{ text: 'OK', onPress: () => navigation.popTo('Bookings') }],
        );
      } else if (err?.code === 'P0001' && /maximum of \d+ reschedule/i.test(err?.message ?? '')) {
        // request_reschedule_own_booking() enforces the provider's
        // max-reschedules-per-booking policy. Telling the client "try again"
        // would be a lie — no retry from this screen can ever succeed.
        showConfirm(
          'No Reschedules Left',
          `${booking.providerName} allows a limited number of reschedules per booking, and this one has used them. Message them directly if you need to change it.`,
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
      } else if (
        err?.message === 'Only upcoming bookings can be rescheduled' ||
        err?.message === 'Only confirmed bookings can be rescheduled' ||
        err?.message === 'That time has just been taken. Please pick another slot.' ||
        /^You can reschedule again in /.test(err?.message ?? '') ||
        /has just been taken\. Please pick another day\.$/.test(err?.message ?? '')
      ) {
        // These messages are already written for clients — shown as-is on
        // purpose. Passing them through toUserMessage would sanitize them
        // back into the generic fallback (it matches on wording, and none of
        // these match a friendly pattern), which is how "You can reschedule
        // again in 6 hours" used to reach the client as "That time is no
        // longer available" — advice for a problem they don't have.
        reportError(err, 'RescheduleScreen.submit');
        showAlert("Can't Reschedule", err.message);
      } else {
        // Anything else is unexpected/technical — devs see the real reason in
        // the logs; the client sees a calm, non-technical line.
        logger.error('[Reschedule] failed:', err);
        showAlert('Reschedule Failed', "We couldn't reschedule that just now. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [booking, selectedDate, selectedTime, requestReschedule, confirmReschedule, confirmGroupReschedule, isGroupReschedule, groupSiblings, navigation, showAlert, showConfirm]);

  const handleDecline = useCallback(() => {
    if (!booking) return;
    const groupSuffix = isGroupReschedule ? ` This applies to all ${groupSiblings.length} of your services with them.` : '';
    showConfirm(
      'Decline These Times?',
      `None of these will work? ${booking.providerName} will be notified and your original appointment time stays as-is.${groupSuffix}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setIsDeclining(true);
            try {
              if (isGroupReschedule) {
                await declineGroupReschedule(booking.groupBookingId!, groupSiblings);
              } else {
                await declineReschedule(booking.id);
              }
              navigation.goBack();
            } catch (err: any) {
              showAlert('Could Not Decline', err?.message || 'Something went wrong. Please try again.');
            } finally {
              setIsDeclining(false);
            }
          },
        },
      ],
    );
  }, [booking, declineReschedule, declineGroupReschedule, isGroupReschedule, groupSiblings, navigation, showConfirm, showAlert]);

  // Keep this hook above every early return. `booking` is initially absent
  // while route/context state hydrates, so calling it only after that loading
  // return breaks React's hook ordering on the next render.
  const hoursUntilBooking = useMemo(() => {
    if (!booking) return null;
    const start = new Date(`${booking.bookingDate}T${booking.bookingTime}`);
    return (start.getTime() - Date.now()) / (1000 * 60 * 60);
  }, [booking]);

  if (!booking) {
    return (
      <ThemedBackground>
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} edges={['bottom', 'left', 'right']}>
          <Text style={{ color: C.sub, fontSize: 16 }}>Booking not found.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
            <Text style={{ color: C.accent, fontSize: 16 }}>Go Back</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </ThemedBackground>
    );
  }

  const hasProviderResponse = !!booking.rescheduleRequest?.providerAvailableDates;
  // request_reschedule_own_booking() (supabase/booking_rules_server_enforcement.sql)
  // gates on how soon the EXISTING booking starts, not on which destination
  // time is picked — so once the current appointment is inside the
  // provider's notice window, every chip in the picker below is doomed
  // before it's tapped, and this device had no way to know that until the
  // RPC round-tripped a raw P0001. Only applies to the client-request path:
  // if the provider has already offered specific slots (hasProviderResponse),
  // they've already worked around their own notice policy by choosing to
  // offer those times, so this doesn't gate that path.
  const noticeHours = reschedulePolicy?.rescheduleNoticeHours ?? 0;
  const isPastNoticeWindow = !hasProviderResponse && noticeHours > 0 && hoursUntilBooking !== null && hoursUntilBooking < noticeHours;
  // The two windows are separate and unrelated (BOOKINGS.md §7a): a provider
  // whose reschedule notice is SHORTER than their cancellation notice will
  // happily accept a request from a client who can no longer cancel. That is
  // a legitimate state, not an error — but the client should hear it before
  // they ask rather than discover it if the answer doesn't suit them. Stated
  // plainly, without alarm: nothing has gone wrong and nothing is at risk.
  const cancelNoticeHours = reschedulePolicy?.cancelNoticeHours ?? 0;
  const cancelWindowAlreadyClosed =
    !hasProviderResponse &&
    cancelNoticeHours > 0 &&
    hoursUntilBooking !== null &&
    hoursUntilBooking < cancelNoticeHours;
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
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }} edges={['bottom', 'left', 'right']}>
          <Text style={{ fontSize: 56, marginBottom: 16 }}>✓</Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: C.text, textAlign: 'center', marginBottom: 8 }}>
            {hasProviderResponse ? 'Booking Rescheduled!' : 'Request Sent!'}
          </Text>
          <Text style={{ fontSize: 15, color: C.sub, textAlign: 'center', lineHeight: 22, marginBottom: 32 }}>
            {isGroupReschedule
              ? `All ${groupSiblings.length} of your services with ${booking.providerName} have been rescheduled to ${formatDisplayDate(selectedDate!)}.`
              : hasProviderResponse
              ? `Your appointment with ${booking.providerName} has been rescheduled to ${formatDisplayDate(selectedDate!)} at ${formatTime12(selectedTime!)}.`
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
            <Text style={[st.primaryBtnText, { color: C.onAccent }]}>Back to Bookings</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </ThemedBackground>
    );
  }

  if (isPastNoticeWindow) {
    return (
      <ThemedBackground>
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }} edges={['bottom', 'left', 'right']}>
          <Ionicons name="time-outline" size={40} color={C.sub} />
          <Text style={{ fontSize: 18, fontWeight: '800', color: C.text, textAlign: 'center', marginTop: 16, marginBottom: 8 }}>
            Too Close to Reschedule
          </Text>
          <Text style={{ fontSize: 14, color: C.sub, textAlign: 'center', lineHeight: 20, marginBottom: 8 }}>
            {booking.providerName} requires {noticeHours} hours notice to reschedule, and this appointment is coming up too soon.
          </Text>
          <View style={[st.currentDateBadge, { backgroundColor: C.card, borderColor: C.border, marginTop: 8 }]}>
            <Ionicons name="calendar-outline" size={14} color={C.sub} />
            <Text style={[st.currentDateText, { color: C.sub }]}>
              {formatDisplayDate(booking.bookingDate)} at {formatTime12(booking.bookingTime)}
            </Text>
          </View>
          <Text style={{ fontSize: 13, color: C.sub, textAlign: 'center', lineHeight: 19, marginTop: 20 }}>
            Message {booking.providerName} directly if you need to change this appointment.
          </Text>
          <TouchableOpacity style={[st.primaryBtn, { backgroundColor: C.accent, width: '100%', marginTop: 28 }]} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Text style={[st.primaryBtnText, { color: C.onAccent }]}>Go Back</Text>
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
        <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
          <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
            <View style={st.headerInfo}>
              <Text style={[st.providerName, { color: C.text }]}>{booking.providerName}</Text>
              <Text style={[st.serviceName, { color: C.sub }]}>{booking.serviceName}</Text>
              <View style={[st.currentDateBadge, { backgroundColor: C.card, borderColor: C.border }]}>
                <Ionicons name="calendar-outline" size={14} color={C.sub} />
                <Text style={[st.currentDateText, { color: C.sub }]}>
                  Currently: {formatDisplayDate(booking.bookingDate)} at {formatTime12Safe(booking.bookingTime) ?? booking.bookingTime}
                </Text>
              </View>
            </View>

            <View style={st.section}>
              <View style={{ backgroundColor: C.accentDim, borderColor: C.border, borderWidth: 1, borderRadius: 12, padding: 14 }}>
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
                      {!!formatTime12Safe(requestedTimes[i]) && (
                        <Text style={[st.rowValue, { color: C.text, fontWeight: '700', flex: 0 }]}>{formatTime12Safe(requestedTimes[i])}</Text>
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
      {/* No bottom edge here — the footer below owns its own bottom
          clearance via FLOATING_TAB_BAR_CLEARANCE (this screen sits under
          IslandPillTabBar's floating pill), so a safe-area bottom inset here
          on top of that would stack and make the footer needlessly tall. */}
      <SafeAreaView style={{ flex: 1 }} edges={['left', 'right']}>
        <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
          {/* Header info */}
          <View style={st.headerInfo}>
            <Text style={[st.providerName, { color: C.text }]}>{booking.providerName}</Text>
            <Text style={[st.serviceName, { color: C.sub }]}>
              {isGroupReschedule ? `${groupSiblings.length} services` : booking.serviceName}
            </Text>
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
              <View style={{ backgroundColor: C.accentDim, borderColor: C.border, borderWidth: 1, borderRadius: 12, padding: 14 }}>
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

          {/* Says what is true now, not what might go wrong. No warning icon,
              no red — this is context, and the client has done nothing
              wrong. */}
          {cancelWindowAlreadyClosed && (
            <View style={st.section}>
              <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
                <Text style={[st.rowLabel, { color: C.sub, lineHeight: 20 }]}>
                  Worth knowing: {booking.providerName} asks for {cancelNoticeHours} hours'
                  notice to cancel, and this appointment is inside that now. You can still
                  ask to move it — just bear in mind that if none of the times work out,
                  the original booking stays as it is. {booking.providerName} is the best
                  person to talk to if you need something else.
                </Text>
              </View>
            </View>
          )}

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
            <View style={st.sectionHeaderRow}>
              <Text style={[st.sectionTitle, { color: C.sub, marginBottom: 0 }]}>
                {hasProviderResponse ? 'AVAILABLE DATES FROM PROVIDER' : 'SELECT A DATE'}
              </Text>
              {!hasProviderResponse && (
                <TouchableOpacity
                  onPress={openCustomDatePicker}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={[st.customTimeBtn, { backgroundColor: C.accentDim, borderColor: C.accent }]}
                >
                  <Ionicons name="calendar-outline" size={11} color={C.accent} />
                  <Text style={[st.customTimeBtnText, { color: C.accent }]}>Request specific time</Text>
                </TouchableOpacity>
              )}
            </View>
            {loadingDates ? (
              <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                <ActivityIndicator color={C.accent} />
                <Text style={{ color: C.sub, marginTop: 8, fontSize: 13 }}>Loading available dates…</Text>
              </View>
            ) : dateOptions.length === 0 && providerUnpublished ? (
              <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                <Ionicons name="calendar-clear-outline" size={28} color={C.sub} />
                <Text style={{ color: C.text, marginTop: 10, fontSize: 14, fontWeight: '600' }}>No current availability</Text>
                <Text style={{ color: C.sub, marginTop: 4, fontSize: 12, textAlign: 'center', lineHeight: 18, paddingHorizontal: 20 }}>
                  Please check back later, or message {booking.providerName} directly.
                </Text>
              </View>
            ) : dateOptions.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                <Ionicons name="calendar-clear-outline" size={28} color={C.sub} />
                <Text style={{ color: C.text, marginTop: 10, fontSize: 14, fontWeight: '600' }}>No open times right now</Text>
                <Text style={{ color: C.sub, marginTop: 4, fontSize: 12, textAlign: 'center', lineHeight: 18, paddingHorizontal: 20 }}>
                  {booking.providerName} has no availability {probeWindowLabel}. Try again later, use "Request specific time" to propose a date yourself, or message them directly.
                </Text>
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
                      <Text style={{ color: isSelected ? C.onAccent : C.sub, fontSize: 10, fontWeight: '600', marginBottom: 2 }}>
                        {opt.displayDate.split(' ')[0]?.toUpperCase()}
                      </Text>
                      <Text style={{ color: isSelected ? C.onAccent : C.text, fontSize: 18, fontWeight: '800' }}>
                        {opt.displayDate.split(' ')[1]}
                      </Text>
                      <Text style={{ color: isSelected ? C.onAccent : C.sub, fontSize: 11, opacity: isSelected ? 0.8 : 1 }}>
                        {opt.displayDate.split(' ').slice(2).join(' ')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            {/* A custom-picked date/time doesn't come from dateOptions (it's
                not necessarily a slot the provider is known to have open —
                that's the point, the provider confirms or counters it), so
                confirm what was picked here instead of leaving no feedback. */}
            {!hasProviderResponse && selectedDate && selectedTime && !dateOptions.some(o => o.date === selectedDate && o.times.includes(selectedTime!)) && (
              <View style={[st.customTimeConfirm, { backgroundColor: C.accentDim, borderColor: C.accent }]}>
                <Ionicons name="time-outline" size={14} color={C.accent} />
                <Text style={[st.customTimeConfirmText, { color: C.accent }]}>
                  Requesting {formatDisplayDate(selectedDate)} at {formatTime12(selectedTime)}
                </Text>
              </View>
            )}
          </View>

          {/* Custom date/time picker — iOS: modal bottom sheet, one step at a
              time (date, then time). Android: native dialogs render inline
              via the OS, no wrapper needed. */}
          {customPickerStep && Platform.OS === 'ios' && (
            <Modal transparent animationType="fade" visible onRequestClose={() => setCustomPickerStep(null)}>
              <View style={st.pickerModalWrap}>
                <TouchableOpacity style={st.pickerDismiss} activeOpacity={1} onPress={() => setCustomPickerStep(null)} />
                <View style={[st.pickerSheet, { backgroundColor: C.card }]}>
                  <View style={[st.pickerHeader, { borderBottomColor: C.border }]}>
                    <Text style={[st.pickerHeaderLabel, { color: C.text }]}>
                      {customPickerStep === 'date' ? 'Select Date' : 'Select Time'}
                    </Text>
                    <TouchableOpacity onPress={() => {
                      if (customPickerStep === 'date' && customDate) {
                        setSelectedDate(dateToYMD(customDate));
                        setSelectedTime(null);
                        setCustomPickerStep('time');
                      } else {
                        setCustomPickerStep(null);
                      }
                    }}>
                      <Text style={[st.pickerDoneLabel, { color: C.accent }]}>
                        {customPickerStep === 'date' ? 'Next' : 'Done'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {customPickerStep === 'date' ? (
                    <DateTimePicker
                      mode="date"
                      value={customDate ?? customPickerSeed}
                      onChange={handleCustomDateChange}
                      display="spinner"
                      themeVariant={isDarkMode ? 'dark' : 'light'}
                      textColor={C.text}
                      minimumDate={minPickerDate}
                      style={{ width: '100%' }}
                    />
                  ) : (
                    <DateTimePicker
                      mode="time"
                      value={customDate ?? customPickerSeed}
                      onChange={handleCustomTimeChange}
                      display="spinner"
                      themeVariant={isDarkMode ? 'dark' : 'light'}
                      textColor={C.text}
                      minuteInterval={5}
                      style={{ width: '100%' }}
                    />
                  )}
                </View>
              </View>
            </Modal>
          )}
          {customPickerStep && Platform.OS === 'android' && (
            customPickerStep === 'date' ? (
              <DateTimePicker
                mode="date"
                value={customDate ?? customPickerSeed}
                onChange={handleCustomDateChange}
                display="default"
                minimumDate={minPickerDate}
              />
            ) : (
              <DateTimePicker
                mode="time"
                value={customDate ?? customPickerSeed}
                onChange={handleCustomTimeChange}
                display="default"
                minuteInterval={5}
              />
            )
          )}

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
                      <Text style={{ color: isSelected ? C.onAccent : C.text, fontSize: 15, fontWeight: '600' }}>{formatTime12(time)}</Text>
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
                {isGroupReschedule ? (
                  groupSiblings.map((sib, i) => {
                    const sibTime = sib.rescheduleRequest?.providerAvailableDates?.find(d => d.date === selectedDate)?.times?.[0];
                    return (
                      <View
                        key={sib.id}
                        style={[st.row, { borderBottomColor: C.border, borderBottomWidth: i === groupSiblings.length - 1 ? 0 : StyleSheet.hairlineWidth }]}
                      >
                        <Text style={[st.rowLabel, { color: C.sub, flex: 1 }]} numberOfLines={1}>{sib.serviceName}</Text>
                        <Text style={[st.rowValue, { color: C.text, fontWeight: '700', flex: 0 }]}>
                          {sibTime ? formatTime12(sibTime) : '—'}
                        </Text>
                      </View>
                    );
                  })
                ) : (
                  <View style={[st.row, { borderBottomWidth: 0 }]}>
                    <Text style={[st.rowLabel, { color: C.sub }]}>New Time</Text>
                    <Text style={[st.rowValue, { color: C.text, fontWeight: '700' }]}>{formatTime12(selectedTime)}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Submit button */}
        <View style={[st.footer, { borderTopColor: C.border, backgroundColor: C.bg }]}>
          <TouchableOpacity
            style={[st.primaryBtn, { backgroundColor: selectedDate && selectedTime ? C.accent : C.border }]}
            disabled={!selectedDate || !selectedTime || isSubmitting || isDeclining}
            onPress={handleSubmit}
            activeOpacity={0.8}
          >
            {isSubmitting
              ? <ActivityIndicator size="small" color={C.onAccent} />
              : <Text style={[st.primaryBtnText, { color: selectedDate && selectedTime ? C.onAccent : C.sub }]}>
                  {isGroupReschedule ? `Confirm All ${groupSiblings.length} Services` : hasProviderResponse ? 'Confirm New Time' : 'Request Reschedule'}
                </Text>}
          </TouchableOpacity>
          {hasProviderResponse && (
            <TouchableOpacity
              onPress={handleDecline}
              disabled={isSubmitting || isDeclining}
              activeOpacity={0.7}
              style={{ alignItems: 'center', paddingVertical: 12, opacity: isDeclining ? 0.5 : 1 }}
            >
              {isDeclining
                ? <ActivityIndicator size="small" color="#FF3B30" />
                : <Text style={{ color: '#FF3B30', fontSize: 14, fontWeight: '600' }}>None of these work</Text>}
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
      <DialogHost />
    </ThemedBackground>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  headerInfo: { alignItems: 'center', marginBottom: 20 },
  providerName: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  serviceName: { fontSize: 14, marginBottom: 10 },
  currentDateBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, gap: 6, borderWidth: StyleSheet.hairlineWidth },
  currentDateText: { fontSize: 13 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  customTimeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 },
  customTimeBtnText: { fontSize: 10, fontWeight: '700' },
  customTimeConfirm: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginTop: 10 },
  customTimeConfirmText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  pickerModalWrap: { flex: 1, flexDirection: 'column', justifyContent: 'flex-end' },
  pickerDismiss: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  pickerSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', paddingBottom: 20 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerHeaderLabel: { fontSize: 15, fontWeight: '600' },
  pickerDoneLabel: { fontSize: 15, fontWeight: '700' },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rowLabel: { fontSize: 13, flex: 0.5 },
  rowValue: { fontSize: 13, flex: 0.5, textAlign: 'right' },
  dateChip: { borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', minWidth: 75 },
  timeChip: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 18, paddingVertical: 12, alignItems: 'center' },
  // paddingBottom clears IslandPillTabBar's floating pill (this screen is
  // nested in a tab's stack) — it used to be a flat 28/16, which is roughly
  // home-indicator clearance only, so the pill sat right on top of the
  // Confirm/Request button.
  footer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: FLOATING_TAB_BAR_CLEARANCE, borderTopWidth: StyleSheet.hairlineWidth },
  primaryBtn: { borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  primaryBtnText: { fontSize: 16, fontWeight: '700' },
});
