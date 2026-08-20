import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { useProviderDialog } from '../../components/ProviderDialog';
import { useTheme } from '../../contexts/ThemeContext';
import {
  getMyProviderProfile,
  getMyProviderServices,
  getProviderClientele,
  getAvailableSlots,
  getProviderBookings,
  getProviderBlockedDates,
  getProviderAvailabilityWindows,
  getProviderAvailabilityOverrides,
  providerCreateManualBooking,
} from '../../services/databaseService';
import { mapDbBookingToConfirmed } from '../../services/bookingService';
import type {
  ClienteleMember,
  DbService,
  BookingWithAddOns,
  DbProviderBlockedDate,
  DbProviderAvailabilityWindow,
  DbProviderAvailabilityOverride,
} from '../../types/database';
import { mapDbBookingStatus, BookingStatus } from '../../types/booking';
import { KeyboardDismissView } from '../../components/KeyboardDismissView';
import { formatTime12, formatShortDate, dateToYMD } from '../../utils/dateUtils';
import SlidingTabs from '../../components/SlidingTabs';
import { isDarkColor } from '../../constants/providerThemes';

const WARN = '#E8A13A';

// ─── Brand palette ────────────────────────────────────────────────────────────
const LIGHT = {
  bg:      '#F5F1EC',
  surface: '#EDE8E2',
  card:    '#FFFFFF',
  accent:  '#5C4033',
  ice:     '#FFFFFF',
  text:    '#000000',
  sub:     '#7E6667',
  border:  'rgba(126,102,103,0.14)',
};
const DARK = {
  bg:      '#1A1815',
  surface: '#201D1A',
  card:    '#252220',
  accent:  '#AF9197',
  ice:     '#FFFFFF',
  text:    '#F0ECE7',
  sub:     '#7E6667',
  border:  'rgba(126,102,103,0.18)',
};

function hhmmss(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}:00`;
}

// databaseService.getAvailableSlots can return "HH:MM" (no seconds) — its
// own to24HourTime() drops them. Comparing that directly against hhmmss()'s
// always-"HH:MM:SS" output via === never matches (05:00:00" - 3 parts -
// against "05:00" - 2 parts - are never equal strings even though they're
// the same instant), so the selected slot chip never highlighted even
// though pickSlot() itself was updating `time` correctly. Parse both to
// minutes-since-midnight instead so the comparison survives either format.
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export default function AddBookingScreen() {
  const navigation = useNavigation();
  const { showToast, showConfirm, DialogHost } = useProviderDialog();
  const { isDarkMode } = useTheme();
  const P = isDarkMode ? DARK : LIGHT;
  const onAccent = isDarkColor(P.accent) ? '#fff' : '#1B2740';
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  // Provider-added appointment — intentionally limited to existing app
  // clients. External/walk-in contacts need their own consent-aware model;
  // never fabricate a user id just to force a booking through this route.
  const [clients, setClients] = useState<ClienteleMember[]>([]);
  const [services, setServices] = useState<DbService[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [serviceSearch, setServiceSearch] = useState('');
  // Extra minutes blocked out on top of the selected service's own duration
  // — a scheduling buffer only (e.g. "this client's hair is extra thick, +30
  // min"), never a price change. Resets whenever the service changes, same
  // as add-ons/safety-ack below (pickService).
  const [extraMinutes, setExtraMinutes] = useState(0);
  // Add-ons the provider ticked for the chosen service — sent as ids only;
  // provider_create_manual_booking resolves name/price server-side from
  // service_add_ons rather than trusting anything the client sends.
  const [selectedAddOnIds, setSelectedAddOnIds] = useState<string[]>([]);
  // Required when the selected service has patch_test_required or
  // is_pregnancy_safe=false — provider_create_manual_booking rejects the
  // insert without it. Resets whenever the service changes (see pickService).
  const [safetyAcknowledged, setSafetyAcknowledged] = useState(false);
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(() => { const d = new Date(); d.setHours(9, 0, 0, 0); return d; });
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  // 'details' = pick client/service/when; 'confirm' = review contact details
  // and add notes before creating. Time picked in 'details' is what unlocks
  // Continue into 'confirm' — the transition the provider triggers explicitly.
  const [phase, setPhase] = useState<'details' | 'confirm'>('details');
  // 'slots' = pick from real availability; 'custom' = free time picker (can
  // land on an already-booked time, flagged as a conflict below).
  const [whenMode, setWhenMode] = useState<'slots' | 'custom'>('slots');
  // The provider's own active bookings, used to detect whether a custom time
  // collides with an existing appointment (busy-span RPC hides booking ids, so
  // we read our own bookings directly to know WHICH booking to offer to move).
  const [myBookings, setMyBookings] = useState<BookingWithAddOns[]>([]);
  // Schedule data for Custom time's own inline blocked/outside-hours check —
  // Custom time deliberately bypasses the Available list (which is already
  // schedule-filtered), so it needs its own read of the raw schedule to warn
  // BEFORE submit instead of only learning from the DB's rejection after.
  const [blockedDates, setBlockedDates] = useState<DbProviderBlockedDate[]>([]);
  const [availabilityWindows, setAvailabilityWindows] = useState<DbProviderAvailabilityWindow[]>([]);
  const [availabilityOverrides, setAvailabilityOverrides] = useState<DbProviderAvailabilityOverride[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, s, profile, bookings] = await Promise.all([
        getProviderClientele(),
        getMyProviderServices(),
        getMyProviderProfile(),
        getProviderBookings(),
      ]);
      setClients(c);
      setServices(s);
      setProviderId(profile?.id ?? null);
      setMyBookings(bookings);
      if (profile?.id) {
        const [blocked, windows, overrides] = await Promise.all([
          getProviderBlockedDates(profile.id),
          getProviderAvailabilityWindows(profile.id),
          getProviderAvailabilityOverrides(profile.id),
        ]);
        setBlockedDates(blocked);
        setAvailabilityWindows(windows);
        setAvailabilityOverrides(overrides);
      }
    } catch {
      showToast('Could not load your clients and services.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  // Available slots for the chosen date — an additive convenience on top of the
  // free time picker (which stays, so a squeeze-in on a fully-booked day is
  // always possible). Re-fetches whenever the date OR the chosen service
  // changes — a slot list generated for a generic 60-min duration can offer a
  // start time that doesn't actually fit a longer service.
  const dateYMD = dateToYMD(date);
  const baseServiceDuration = services.find(sv => sv.id === serviceId)?.duration_minutes;
  // Total duration actually being blocked out — base service + any extra
  // buffer the provider added. Everything downstream (slot fetch, conflict
  // check, working-hours fit) must use this, not baseServiceDuration alone,
  // or the UI will show "no conflict" for a slot the buffer actually
  // overlaps into.
  const selectedServiceDuration = baseServiceDuration != null
    ? baseServiceDuration + extraMinutes
    : undefined;
  useEffect(() => {
    if (!providerId) return;
    let cancelled = false;
    setSlotsLoading(true);
    getAvailableSlots(providerId, dateYMD, selectedServiceDuration, serviceId ?? undefined)
      .then(res => { if (!cancelled) setSlots(res); })
      .catch(() => { if (!cancelled) setSlots([]); })
      .finally(() => { if (!cancelled) setSlotsLoading(false); });
    return () => { cancelled = true; };
  }, [providerId, dateYMD, serviceId, selectedServiceDuration]);

  function pickSlot(hhmmss24: string) {
    const [h, m] = hhmmss24.split(':').map(Number);
    const d = new Date(date);
    d.setHours(h ?? 0, m ?? 0, 0, 0);
    setTime(d);
  }

  const selectedClient = clients.find(c => c.user_id === clientId) ?? null;
  const selectedService = services.find(s => s.id === serviceId) ?? null;
  const serviceAddOns = selectedService?.add_ons ?? [];

  // ClienteleMember has no phone field (it's aggregated from booking history,
  // not the users table). customer_phone IS on bookings as a snapshot column
  // though, so the client's own most recent booking with this provider
  // carries it — reuse that instead of a fresh users query or RLS change.
  const clientPhone = clientId
    ? myBookings
        .filter(b => b.user_id === clientId && b.customer_phone)
        .sort((a, b) => (a.booking_date < b.booking_date ? 1 : -1))[0]?.customer_phone ?? null
    : null;

  // Mirrors enforce_booking_bookability()'s own always-hard "That time has
  // already passed today" check (supabase/migrations/20260817150000_manual_
  // booking_scheduling_policy_override.sql) — never overridable, so this
  // needs to be a client-side hard stop too, not just a DB round-trip.
  // Applies in BOTH When tabs: a stale Custom time left over from before the
  // provider switched to Available, or a slot that was valid when fetched
  // but has since ticked past "now" while the provider was still on this
  // screen, both need to be caught before Continue/Add Booking, not just
  // after tapping it.
  const isTimeAlreadyPassed = dateYMD === dateToYMD(new Date())
    && (time.getHours() * 60 + time.getMinutes()) <= (new Date().getHours() * 60 + new Date().getMinutes());

  // `time` is a single piece of state shared by both When tabs, with no
  // "nothing picked yet" value — it defaults to 9:00 AM and otherwise holds
  // whatever pickSlot()/the native time picker last set it to. Switching
  // Custom time → Available does NOT clear it (see pickService for the
  // established pattern of resetting dependent state on a real selection
  // change — this is deliberately NOT that, because clearing on every tab
  // switch would also blank a genuinely valid choice the provider is just
  // glancing away from). Left unguarded, a past Custom time picked before
  // switching tabs silently satisfies canContinue on the Available tab
  // too, since nothing there was un-selected. Require Available mode
  // specifically to have `time` actually match one of the currently
  // fetched slots — Custom time is unaffected, it's exempt by design.
  const selectedSlotIsValid = whenMode !== 'slots'
    || slots.some(slot => timeToMinutes(slot) === timeToMinutes(hhmmss(time)));

  // Conflict detection for the custom-time path: does the chosen start (+ the
  // selected service's duration) overlap an existing booking on the same day?
  // Returns the first colliding booking so we can offer to move it. Only
  // meaningful once a service is chosen (we need its duration).
  //
  // Mirrors the live bookings_no_overlap DB constraint as closely as the client
  // can: exclude ONLY 'cancelled'/'no_show' (the exact set the constraint
  // ignores — a completed same-day booking still blocks the slot), and fall
  // back to a 60-min duration for a null end_time (the constraint's
  // COALESCE(end_time, booking_time + 60min)). We can't see buffer_before/after
  // here, so a buffered booking the DB rejects may not flag — treat this as a
  // best-effort warning, not a guarantee; the DB is the real gate.
  const toMinutes = timeToMinutes;
  const chosenStart = time.getHours() * 60 + time.getMinutes();
  // Uses the buffered total (service + extraMinutes), not the service's own
  // duration alone — otherwise a provider-added buffer wouldn't actually
  // flag a conflict it creates, contradicting the whole point of blocking
  // that time out.
  const chosenEnd = chosenStart + (selectedServiceDuration ?? 0);
  const conflictBooking = selectedService
    ? myBookings.find(b => {
        if (b.booking_date !== dateYMD) return false;
        const st = mapDbBookingStatus(b.status);
        if (st === BookingStatus.CANCELLED || st === BookingStatus.NO_SHOW) return false;
        const bStart = toMinutes(b.booking_time);
        const bEnd = b.end_time ? toMinutes(b.end_time) : bStart + 60;
        return chosenStart < bEnd && chosenEnd > bStart; // interval overlap
      }) ?? null
    : null;

  // Custom time's own inline blocked/outside-hours read — Available never
  // needs this (getAvailableSlots already filters through the same data),
  // but Custom time deliberately bypasses that list, so without this check
  // the only feedback was the DB's rejection AFTER tapping Add Booking.
  // Mirrors enforce_booking_bookability()'s own precedence: an explicit
  // override for the date wins over the weekly window entirely (open or
  // closed), and only falls back to the recurring weekly window when no
  // override exists for that date.
  const dayOverride = availabilityOverrides.find(o => o.availability_date === dateYMD) ?? null;
  const isBlockedDate = blockedDates.some(b => b.blocked_date === dateYMD)
    || (dayOverride?.is_closed ?? false);
  const dayOfWeek = date.getDay();
  const fitsWorkingHours = isBlockedDate
    ? false
    : dayOverride
      ? (!dayOverride.is_closed
          && dayOverride.start_time != null && dayOverride.end_time != null
          && chosenStart >= toMinutes(dayOverride.start_time) && chosenEnd <= toMinutes(dayOverride.end_time))
      : availabilityWindows
          .filter(w => w.day_of_week === dayOfWeek)
          .some(w => chosenStart >= toMinutes(w.start_time) && chosenEnd <= toMinutes(w.end_time));
  // Only surfaced for Custom time — outside hours is exactly what that tab
  // is FOR (the server-side squeeze-in bypass), so this is informational
  // ("you're going outside their usual hours"), not a hard block like the
  // blocked-date/conflict cases below.
  const isOutsideWorkingHours = selectedService && !isBlockedDate && !fitsWorkingHours;

  const filteredClients = clientSearch.trim()
    ? clients.filter(c =>
        c.customer_name.toLowerCase().includes(clientSearch.trim().toLowerCase()) ||
        (c.customer_email ?? '').toLowerCase().includes(clientSearch.trim().toLowerCase()))
    : clients;

  // Only worth a search box past a handful of services — most providers have
  // few, so the field would just be noise.
  const SERVICE_SEARCH_THRESHOLD = 6;
  const filteredServices = serviceSearch.trim()
    ? services.filter(sv => sv.name.toLowerCase().includes(serviceSearch.trim().toLowerCase()))
    : services;

  function pickService(id: string) {
    setServiceId(id);
    setServiceSearch('');
    setSelectedAddOnIds([]); // add-ons belong to a service; reset on change
    setSafetyAcknowledged(false); // acknowledgement is per-service, not carried over
    setExtraMinutes(0); // buffer is per-booking, not carried over to a new service
  }

  function toggleAddOn(id: string) {
    setSelectedAddOnIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  // Mirrors the server-side check in provider_create_manual_booking /
  // prepare_checkout — required whenever the service demands a patch test
  // or is flagged unsafe in pregnancy. Client-side gate is a UX nicety; the
  // RPC rejects the insert regardless if this is somehow bypassed.
  const safetyRequired = !!selectedService
    && (!!selectedService.patch_test_required || selectedService.is_pregnancy_safe === false);

  // Gates the Details→Confirm "Continue" button. Deliberately does NOT
  // include safetyAcknowledged — that checkbox only exists in the Confirm
  // phase, so requiring it here made Continue permanently unreachable for
  // any patch-test/pregnancy-flagged service: the provider could never
  // scroll to the checkbox that would unblock it. Safety ack is instead
  // enforced by canSubmit below, right where the checkbox actually lives.
  // Also deliberately does NOT include isBlockedDate — a blocked date is a
  // scheduling-POLICY warning the provider can override (see
  // OVERRIDABLE_PATTERN below), not a hard stop, so Continue still reaches
  // Confirm and the RPC gives the provider a "Proceed anyway?" choice with
  // the actual reason. conflictBooking (a genuinely taken slot),
  // isTimeAlreadyPassed (a same-day time that has already elapsed), and
  // selectedSlotIsValid (Available mode requires an actually-tapped,
  // currently-offered slot — guards against a stale Custom time silently
  // carrying over) are the only hard stops here — none of these is
  // something the DB will ever let through, override or not.
  const canContinue = !!clientId && !!serviceId && !conflictBooking && !isTimeAlreadyPassed && selectedSlotIsValid;
  // Gates the Confirm phase's final "Add Booking" submit.
  const canSubmit = canContinue && (!safetyRequired || safetyAcknowledged);

  function handleContinue() {
    if (!clientId || !serviceId) {
      showToast('Choose a client and service first.', 'info');
      return;
    }
    if (isTimeAlreadyPassed) {
      showToast('That time has already passed today. Pick a later time.', 'info');
      return;
    }
    if (!selectedSlotIsValid) {
      showToast('Pick one of the available times, or switch to Custom time.', 'info');
      return;
    }
    if (conflictBooking) {
      showToast('That time is already booked. Move the existing appointment or pick another time.', 'info');
      return;
    }
    setPhase('confirm');
  }

  // Reasons the DB will still hard-reject even with overrideScheduling=true
  // — a genuinely taken slot, or a same-day time that's already elapsed.
  // Neither is a policy call the provider can override, so these never get
  // the "Proceed anyway?" treatment.
  const HARD_BLOCK_PATTERN = /no longer available|already booked|already passed/i;
  // Scheduling-POLICY warnings the provider can see the reason for and then
  // choose to override — mirrors the bypass added in
  // supabase/migrations/20260817150000_manual_booking_scheduling_policy_override.sql.
  // Deliberately anchored on the full "outside this provider's booking
  // window" phrase (not just "outside the provider") so this never
  // collides with the unrelated "outside the provider's working hours"
  // message from the older, always-unconditional bypass_working_hours GUC.
  const OVERRIDABLE_PATTERN = /outside this provider's booking window|unavailable on this date|minimum notice/i;

  async function submitBooking(overrideScheduling: boolean) {
    setCreating(true);
    try {
      await providerCreateManualBooking({
        clientUserId: clientId!,
        serviceId: serviceId!,
        bookingDate: dateToYMD(date),
        bookingTime: hhmmss(time),
        notes,
        addOnIds: selectedAddOnIds,
        safetyAck: safetyAcknowledged,
        overrideScheduling,
        extraMinutes,
      });
      showToast('Booking added and the client has been notified.', 'success');
      // AddBooking is presented as a modal (see ProviderHomeNavigator's modal
      // Group) — navigating straight to a card-presented tab route without
      // dismissing first fights the native modal-dismiss transition and can
      // leave the calendar showing underneath rather than in place of this
      // screen. Same pattern as the "Reschedule that booking" link below:
      // goBack() to dismiss the modal, THEN navigate via the parent (tab)
      // navigator once the dismiss animation has actually finished. Jumping
      // to the booked day (often not "today") makes a squeeze-in visibly
      // land instead of the provider having to go find it.
      const nav = navigation as any;
      const goToCalendar = () => {
        nav.getParent()?.navigate('ProviderHome', {
          screen: 'ProviderHomeMain',
          params: { jumpToDate: dateToYMD(date) },
        });
      };
      if (nav.canGoBack()) {
        nav.goBack();
        setTimeout(goToCalendar, 500);
      } else {
        goToCalendar();
      }
    } catch (error) {
      const message = (error instanceof Error ? error.message : 'Could not add this booking.').replace(/^Error:\s*/, '');

      // Scheduling-POLICY warning (booking window / minimum notice /
      // provider-blocked date) — not overridden yet, so give the provider
      // the actual reason and a chance to confirm and proceed anyway rather
      // than a dead-end toast. Retrying with overrideScheduling=true still
      // goes through the DB, which is the final authority — a genuinely
      // taken slot or an elapsed same-day time is still rejected even then.
      if (!overrideScheduling && OVERRIDABLE_PATTERN.test(message)) {
        setCreating(false);
        showConfirm(
          "Couldn't add this booking",
          `${message} You can proceed anyway if this is intentional.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Proceed anyway', style: 'destructive', onPress: () => submitBooking(true) },
          ],
        );
        return;
      }

      showToast(message, 'error');
      // The DB is the final authority and can reject for reasons the
      // client-side conflictBooking check never saw — most likely someone
      // else booked this exact slot between this screen loading and Continue
      // being tapped. Re-sync myBookings so that conflict check is current,
      // and send the provider back to Details (where the conflict banner —
      // and a chance to pick a different time — actually renders) instead of
      // leaving them on Confirm where retrying Add Booking would just fail
      // the same way against stale data.
      if (HARD_BLOCK_PATTERN.test(message) || OVERRIDABLE_PATTERN.test(message)) {
        setPhase('details');
        getProviderBookings().then(setMyBookings).catch(() => {});
      }
    } finally {
      setCreating(false);
    }
  }

  function handleCreate() {
    if (!clientId || !serviceId) {
      showToast('Choose a client and service first.', 'info');
      return;
    }
    if (isTimeAlreadyPassed) {
      showToast('That time has already passed today. Go back and pick a later time.', 'info');
      return;
    }
    if (conflictBooking) {
      showToast('That time is already booked. Move the existing appointment or pick another time.', 'info');
      return;
    }
    if (safetyRequired && !safetyAcknowledged) {
      showToast('Confirm you’ve told the client the safety information first.', 'info');
      return;
    }
    // isBlockedDate is deliberately not a client-side hard stop — it's a
    // scheduling-POLICY warning the provider can override. Let submitBooking
    // hit the RPC; if the DB rejects with the blocked-date message the catch
    // block below offers "Proceed anyway?" with the actual reason.
    submitBooking(false);
  }

  return (
    <View style={[s.root, { backgroundColor: P.bg }]}>
      <SafeAreaView style={s.safe} edges={['top']}>
        <KeyboardDismissView style={s.keyboardView}>
          <View style={[s.header, { borderBottomColor: P.border }]}>
            {phase === 'confirm' && (
              <TouchableOpacity style={[s.backBtn, { backgroundColor: P.surface }]} onPress={() => setPhase('details')} accessibilityLabel="Back">
                <Ionicons name="chevron-back" size={20} color={P.sub} />
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[s.title, { color: P.text }]}>{phase === 'details' ? 'Add Booking' : 'Confirm Details'}</Text>
              <Text style={[s.subtitle, { color: P.sub }]}>{phase === 'details' ? 'For an existing Cerviced client' : 'Review contact info and add notes'}</Text>
            </View>
            <TouchableOpacity style={[s.closeBtn, { backgroundColor: P.surface }]} onPress={() => navigation.goBack()} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={P.sub} />
            </TouchableOpacity>
          </View>

          <View style={s.stepRow}>
            {(['details', 'confirm'] as const).map((key, i) => {
              const active = phase === key;
              const done = phase === 'confirm' && key === 'details';
              return (
                <React.Fragment key={key}>
                  {i > 0 && <View style={[s.stepBar, { backgroundColor: done || active ? P.accent : P.border }]} />}
                  <View style={s.stepDotWrap}>
                    <View style={[s.stepDot, { borderColor: done || active ? P.accent : P.border }, (done || active) && { backgroundColor: P.accent }]} />
                    <Text style={[s.stepLabel, { color: active ? P.accent : P.sub }, active && { fontWeight: '700' }]}>
                      {key === 'details' ? 'Details' : 'Confirm'}
                    </Text>
                  </View>
                </React.Fragment>
              );
            })}
          </View>

          {loading ? (
            <View style={s.center}><ActivityIndicator color={P.accent} size="large" /></View>
          ) : phase === 'details' ? (
            <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
              {/* ── Client ── collapses to just the picked row once chosen, so a
                  long client list doesn't dominate the screen. Search filters
                  the list while picking. ── */}
              <View style={s.sectionHead}>
                <Text style={[s.label, { color: P.text }]}>Client</Text>
                {selectedClient && (
                  <TouchableOpacity onPress={() => setClientId(null)}><Text style={[s.changeLink, { color: P.accent }]}>Change</Text></TouchableOpacity>
                )}
              </View>
              {clients.length === 0 ? (
                <Text style={[s.empty, { color: P.sub }]}>No existing clients yet. Manual bookings are only for clients with a Cerviced account — ask them to sign up, then book them in here.</Text>
              ) : selectedClient ? (
                <View style={[s.choice, { backgroundColor: P.surface, borderColor: P.accent }]}>
                  <View><Text style={[s.choiceTitle, { color: P.text }]}>{selectedClient.customer_name}</Text><Text style={[s.choiceMeta, { color: P.sub }]}>{selectedClient.customer_email || 'Cerviced client'}</Text></View>
                  <Ionicons name="checkmark-circle" size={21} color={P.accent} />
                </View>
              ) : (
                <>
                  <View style={[s.searchRow, { backgroundColor: P.surface, borderColor: P.border }]}>
                    <Ionicons name="search" size={15} color={P.sub} />
                    <TextInput value={clientSearch} onChangeText={setClientSearch} placeholder="Search clients" placeholderTextColor={P.sub} style={[s.searchInput, { color: P.text }]} autoCorrect={false} />
                    {clientSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setClientSearch('')}><Ionicons name="close-circle" size={16} color={P.sub} /></TouchableOpacity>
                    )}
                  </View>
                  {filteredClients.length === 0 ? (
                    <Text style={[s.empty, { color: P.sub }]}>No clients match “{clientSearch.trim()}”.</Text>
                  ) : filteredClients.map(client => (
                    <TouchableOpacity key={client.user_id} onPress={() => { setClientId(client.user_id); setClientSearch(''); }} style={[s.choice, { backgroundColor: P.surface, borderColor: P.border }]}>
                      <View><Text style={[s.choiceTitle, { color: P.text }]}>{client.customer_name}</Text><Text style={[s.choiceMeta, { color: P.sub }]}>{client.customer_email || 'Cerviced client'}</Text></View>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {/* ── Service ── gated on a client being picked first (sequential
                  flow, not just visual order): the available-slots list is
                  duration-aware and depends on which service is chosen, so
                  there's no useful "When" step to show before this exists.
                  Collapses to the picked service once chosen so its add-ons
                  take focus rather than the full service list. ── */}
              {clientId && (
              <>
              <View style={s.sectionHead}>
                <Text style={[s.label, { color: P.text }]}>Service</Text>
                {selectedService && (
                  <TouchableOpacity onPress={() => pickService('')}><Text style={[s.changeLink, { color: P.accent }]}>Change</Text></TouchableOpacity>
                )}
              </View>
              {selectedService ? (
                <View style={[s.choice, { backgroundColor: P.surface, borderColor: P.accent }]}>
                  <View><Text style={[s.choiceTitle, { color: P.text }]}>{selectedService.name}</Text><Text style={[s.choiceMeta, { color: P.sub }]}>£{Number(selectedService.price).toFixed(2)} · {selectedService.duration_minutes} min</Text></View>
                  <Ionicons name="checkmark-circle" size={21} color={P.accent} />
                </View>
              ) : (
                <>
                  {services.length > SERVICE_SEARCH_THRESHOLD && (
                    <View style={[s.searchRow, { backgroundColor: P.surface, borderColor: P.border }]}>
                      <Ionicons name="search" size={15} color={P.sub} />
                      <TextInput value={serviceSearch} onChangeText={setServiceSearch} placeholder="Search services" placeholderTextColor={P.sub} style={[s.searchInput, { color: P.text }]} autoCorrect={false} />
                      {serviceSearch.length > 0 && (
                        <TouchableOpacity onPress={() => setServiceSearch('')}><Ionicons name="close-circle" size={16} color={P.sub} /></TouchableOpacity>
                      )}
                    </View>
                  )}
                  {filteredServices.length === 0 ? (
                    <Text style={[s.empty, { color: P.sub }]}>No services match “{serviceSearch.trim()}”.</Text>
                  ) : filteredServices.map(service => (
                    <TouchableOpacity key={service.id} onPress={() => pickService(service.id)} style={[s.choice, { backgroundColor: P.surface, borderColor: P.border }]}>
                      <View><Text style={[s.choiceTitle, { color: P.text }]}>{service.name}</Text><Text style={[s.choiceMeta, { color: P.sub }]}>£{Number(service.price).toFixed(2)} · {service.duration_minutes} min</Text></View>
                      {(service.add_ons?.length ?? 0) > 0 && <Text style={[s.choiceMeta, { color: P.sub }]}>{service.add_ons!.length} add-on{service.add_ons!.length !== 1 ? 's' : ''}</Text>}
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {/* Add-ons appear only once a service is chosen — the collapse
                  above is what makes room for them without overloading. */}
              {selectedService && serviceAddOns.length > 0 && (
                <>
                  <Text style={[s.label, { color: P.text }]}>Add-ons</Text>
                  {serviceAddOns.map(addOn => {
                    const on = selectedAddOnIds.includes(addOn.id);
                    return (
                      <TouchableOpacity key={addOn.id} onPress={() => toggleAddOn(addOn.id)} style={[s.choice, { backgroundColor: P.surface, borderColor: on ? P.accent : P.border }]}>
                        <View style={{ flex: 1 }}><Text style={[s.choiceTitle, { color: P.text }]}>{addOn.name}</Text><Text style={[s.choiceMeta, { color: P.sub }]}>+£{Number(addOn.price).toFixed(2)}</Text></View>
                        <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={on ? P.accent : P.sub} />
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}
              {/* Extra time is a scheduling buffer only (blocks out more of
                  the calendar), never a price change — kept visually and
                  functionally separate from add-ons above, which do affect
                  price. Deliberately placed before "When" since it changes
                  what slots/conflicts even look like. */}
              {selectedService && (
                <>
                  <Text style={[s.label, { color: P.text }]}>Extra time</Text>
                  <Text style={[s.choiceMeta, { color: P.sub, marginTop: -4, marginBottom: 6 }]}>
                    Block out more time for this booking. Doesn’t change price.
                  </Text>
                  <View style={[s.choice, { backgroundColor: P.surface, borderColor: P.border, justifyContent: 'space-between' }]}>
                    <Text style={[s.choiceTitle, { color: P.text }]}>
                      {extraMinutes === 0 ? 'None' : `+${extraMinutes} min`}
                      {' · '}{(selectedService.duration_minutes + extraMinutes)} min total
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                      <TouchableOpacity
                        onPress={() => setExtraMinutes(m => Math.max(0, m - 15))}
                        disabled={extraMinutes === 0}
                        style={{ opacity: extraMinutes === 0 ? 0.35 : 1 }}
                      >
                        <Ionicons name="remove-circle-outline" size={26} color={P.accent} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setExtraMinutes(m => Math.min(240, m + 15))}
                        disabled={extraMinutes >= 240}
                        style={{ opacity: extraMinutes >= 240 ? 0.35 : 1 }}
                      >
                        <Ionicons name="add-circle-outline" size={26} color={P.accent} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              )}
              </>
              )}

              {/* ── When ── gated on a service being chosen: the slots list
                  below is generated from that service's real duration, so
                  showing this before a service exists would either be
                  meaningless or (as it silently did before) fall back to a
                  generic 60-min guess that doesn't match the eventual
                  service, offering a slot that later turns out to conflict. */}
              {selectedService && (
              <>
              <Text style={[s.label, { color: P.text }]}>When</Text>
              {/* Date is always chosen up top — both the slots list and the
                  custom-time picker operate on this date. */}
              <TouchableOpacity onPress={() => setDatePickerVisible(true)} style={[s.whenBtn, { backgroundColor: P.surface }]}>
                <Ionicons name="calendar-outline" size={16} color={P.accent}/>
                <Text style={[s.whenText, { color: P.text }]}>{formatShortDate(dateToYMD(date))}</Text>
              </TouchableOpacity>

              {/* Slots vs Custom time. Slots = pick a real free slot; Custom =
                  any time (even one that overlaps an existing booking, flagged
                  below with an offer to move that booking). */}
              <View style={[s.whenTabs, { backgroundColor: P.surface }]}>
                <SlidingTabs
                  tabs={[{ key: 'slots', label: 'Available' }, { key: 'custom', label: 'Custom time' }]}
                  activeKey={whenMode}
                  onPress={k => setWhenMode(k as 'slots' | 'custom')}
                  accentColor={P.accent}
                  activeTextColor={onAccent}
                  inactiveTextColor={P.sub}
                  scrollable={false}
                  height={34}
                />
              </View>

              {whenMode === 'slots' ? (
                slotsLoading ? (
                  <View style={s.slotsLoading}><ActivityIndicator size="small" color={P.accent} /></View>
                ) : slots.length > 0 ? (
                  <View style={s.slotsWrap}>
                    {slots.map(slot => {
                      const on = timeToMinutes(hhmmss(time)) === timeToMinutes(slot);
                      return (
                        <TouchableOpacity key={slot} onPress={() => pickSlot(slot)} style={[s.slotChip, on && s.slotChipOn, { backgroundColor: P.surface, borderColor: on ? P.accent : P.border }]}>
                          {on && <Ionicons name="checkmark" size={13} color={P.accent} style={s.slotCheckIcon} />}
                          <Text style={[s.slotText, { color: on ? P.accent : P.text }, on && s.slotTextOn]}>{formatTime12(slot)}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={[s.slotsEmpty, { color: P.sub }]}>No free slots that day — use “Custom time” to squeeze one in.</Text>
                )
              ) : (
                <>
                  <TouchableOpacity onPress={() => setTimePickerVisible(true)} style={[s.whenBtn, { backgroundColor: P.surface }]}>
                    <Ionicons name="time-outline" size={16} color={P.accent}/>
                    <Text style={[s.whenText, { color: P.text }]}>{formatTime12(hhmmss(time))}</Text>
                  </TouchableOpacity>

                  {/* Soft warning, not a hard stop — Custom time deliberately
                      bypasses the Available list's own schedule filtering, so
                      this is where a blocked date first becomes visible. The
                      provider can still continue; if they do, submit will
                      show a "Proceed anyway?" confirmation with this same
                      reason before the DB actually lets it through. */}
                  {isBlockedDate && (
                    <View style={[s.conflict, { borderColor: WARN + '55', backgroundColor: WARN + '14' }]}>
                      <Ionicons name="warning-outline" size={16} color={WARN} />
                      <View style={{ flex: 1 }}>
                        <Text style={[s.conflictTitle, { color: P.text }]}>This day is marked blocked</Text>
                        <Text style={[s.conflictSub, { color: P.sub }]}>
                          {blockedDates.find(b => b.blocked_date === dateYMD)?.reason
                            || dayOverride?.reason
                            || 'You’ve marked this date unavailable.'} You can still add this booking as a squeeze-in — you'll be asked to confirm.
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Informational, not a hard stop — going outside the
                      provider's usual hours is exactly what Custom time is
                      for (the squeeze-in case). Just makes it visible that
                      it's happening rather than a silent, surprising choice. */}
                  {!isBlockedDate && isOutsideWorkingHours && (
                    <View style={[s.conflict, { borderColor: P.accent + '55', backgroundColor: P.accent + '14' }]}>
                      <Ionicons name="information-circle-outline" size={16} color={P.accent} />
                      <View style={{ flex: 1 }}>
                        <Text style={[s.conflictTitle, { color: P.text }]}>Outside usual working hours</Text>
                        <Text style={[s.conflictSub, { color: P.sub }]}>
                          This time is outside your normal schedule for this day — the booking will still go through as a squeeze-in.
                        </Text>
                      </View>
                    </View>
                  )}
                </>
              )}

              {/* Shown in BOTH modes: a same-day time that's already elapsed
                  — including a stale Custom time left over from before
                  switching to Available, since selectedSlotIsValid only
                  blocks Continue there silently otherwise. Hard stop, never
                  overridable (mirrors the DB's own unconditional check). */}
              {isTimeAlreadyPassed && (
                <View style={[s.conflict, { borderColor: WARN + '55', backgroundColor: WARN + '14' }]}>
                  <Ionicons name="alert-circle-outline" size={16} color={WARN} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.conflictTitle, { color: P.text }]}>That time has already passed today</Text>
                    <Text style={[s.conflictSub, { color: P.sub }]}>
                      Pick a later time today, or a different date.
                    </Text>
                  </View>
                </View>
              )}

              {/* Shown in BOTH modes: a listed "available" slot is duration-
                  aware (see the effect above) so this should be rare, but
                  Custom time can still land on a taken slot — this stays the
                  visible reason Continue is blocked rather than a silent
                  dead button. */}
              {conflictBooking && (
                <View style={[s.conflict, { borderColor: WARN + '55', backgroundColor: WARN + '14' }]}>
                  <Ionicons name="warning-outline" size={16} color={WARN} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.conflictTitle, { color: P.text }]}>This time is already booked</Text>
                    <Text style={[s.conflictSub, { color: P.sub }]}>
                      {conflictBooking.service_name_snapshot} at {formatTime12(conflictBooking.booking_time)}. You can't double-book a slot — move that appointment first, or pick another time.
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        // AddBooking is presented as a modal (see
                        // ProviderHomeNavigator's modal Group). Two things
                        // that DON'T work here, both tried and confirmed
                        // broken this session:
                        //  1. navigate('ProviderHome', {screen: 'BookingDetail'})
                        //     — a no-op re-entry when already inside that
                        //     same tab's stack, doesn't unwind anything.
                        //  2. replace('BookingDetail', ...) — going straight
                        //     from a modal-presented route to a card-
                        //     presented one fights the native dismiss/push
                        //     transitions and hangs the screen (same
                        //     documented pitfall NotificationsScreen.tsx's
                        //     dismissThenNavigate exists to avoid).
                        // Match that screen's actual working pattern
                        // instead: goBack() to dismiss the modal, THEN
                        // navigate via the parent (tab) navigator once the
                        // dismiss animation has actually finished.
                        const nav = navigation as any;
                        const openBookingDetail = () => {
                          nav.getParent()?.navigate('ProviderHome', {
                            screen: 'BookingDetail',
                            params: {
                              bookingId: conflictBooking.id,
                              booking: mapDbBookingToConfirmed(conflictBooking),
                              openReschedule: true,
                            },
                            initial: false,
                          });
                        };
                        if (nav.canGoBack()) {
                          nav.goBack();
                          setTimeout(openBookingDetail, 500);
                        } else {
                          openBookingDetail();
                        }
                      }}
                      style={[s.conflictBtn, { borderColor: P.accent }]}
                    >
                      <Ionicons name="calendar-outline" size={13} color={P.accent} />
                      <Text style={[s.conflictBtnText, { color: P.accent }]}>Reschedule that booking</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              </>
              )}

              <TouchableOpacity onPress={handleContinue} disabled={!canContinue} style={[s.saveBtn, { backgroundColor: P.accent, marginTop: 12 }, !canContinue && s.saveBtnDim]}>
                <Text style={[s.saveTxt, { color: onAccent }]}>Continue</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
              {/* ── Confirm ── the transition target once client/service/when are
                  locked in: review who's being booked and what for, then add
                  any notes before actually creating the booking. ── */}
              <Text style={[s.label, { color: P.text, marginTop: 0 }]}>Client</Text>
              <View style={[s.choice, { backgroundColor: P.surface, borderColor: P.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.choiceTitle, { color: P.text }]}>{selectedClient?.customer_name}</Text>
                  <Text style={[s.choiceMeta, { color: P.sub }]}>{selectedClient?.customer_email || 'Cerviced client'}</Text>
                  <Text style={[s.choiceMeta, { color: P.sub }]}>{clientPhone || 'No phone number on file'}</Text>
                </View>
              </View>

              <Text style={[s.label, { color: P.text }]}>Appointment</Text>
              <View style={[s.choice, { backgroundColor: P.surface, borderColor: P.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.choiceTitle, { color: P.text }]}>{selectedService?.name}</Text>
                  <Text style={[s.choiceMeta, { color: P.sub }]}>
                    {formatShortDate(dateToYMD(date))} · {formatTime12(hhmmss(time))}
                  </Text>
                  {selectedAddOnIds.length > 0 && (
                    <Text style={[s.choiceMeta, { color: P.sub }]}>
                      {selectedAddOnIds.length} add-on{selectedAddOnIds.length !== 1 ? 's' : ''}
                    </Text>
                  )}
                  {extraMinutes > 0 && (
                    <Text style={[s.choiceMeta, { color: P.sub }]}>
                      +{extraMinutes} min extra time blocked out
                    </Text>
                  )}
                </View>
              </View>

              {safetyRequired && (
                <>
                  <Text style={[s.label, { color: P.text }]}>Safety information</Text>
                  <View style={[s.safetyBox, { backgroundColor: P.surface, borderColor: P.border }]}>
                    {!!selectedService?.patch_test_required && (
                      <Text style={[s.safetyLine, { color: P.sub }]}>• The provider requires a patch test before this treatment</Text>
                    )}
                    {selectedService?.is_pregnancy_safe === false && (
                      <Text style={[s.safetyLine, { color: P.sub }]}>• The provider has flagged this treatment as not recommended during pregnancy</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => setSafetyAcknowledged(v => !v)}
                    style={[s.ackRow, { backgroundColor: P.surface, borderColor: safetyAcknowledged ? P.accent : P.border }]}
                    activeOpacity={0.75}
                  >
                    <Ionicons name={safetyAcknowledged ? 'checkbox' : 'square-outline'} size={20} color={safetyAcknowledged ? P.accent : P.sub} />
                    <Text style={[s.ackText, { color: P.text }]}>I've told the client this treatment's safety information above</Text>
                  </TouchableOpacity>
                </>
              )}

              <Text style={[s.label, { color: P.text }]}>Notes</Text>
              <TextInput value={notes} onChangeText={setNotes} placeholder="Notes (optional)" placeholderTextColor={P.sub} style={[s.notesInput, { backgroundColor: P.surface, color: P.text }]} multiline />

              <TouchableOpacity onPress={handleCreate} disabled={creating || !canSubmit} style={[s.saveBtn, { backgroundColor: P.accent, marginTop: 12 }, (!canSubmit || creating) && s.saveBtnDim]}>
                {creating ? <ActivityIndicator color={onAccent} /> : <Text style={[s.saveTxt, { color: onAccent }]}>Add Booking</Text>}
              </TouchableOpacity>
            </ScrollView>
          )}

          {datePickerVisible && (
            Platform.OS === 'ios' ? (
              <Modal transparent animationType="fade" visible={datePickerVisible}>
                <View style={s.pickerModalWrap}>
                  <TouchableOpacity style={s.pickerDismiss} activeOpacity={1} onPress={() => setDatePickerVisible(false)} />
                  <View style={[s.pickerSheet, { backgroundColor: P.surface }]}>
                    <View style={[s.pickerHeader, { borderBottomColor: P.border }]}>
                      <Text style={[s.pickerLabel, { color: P.text }]}>Select Date</Text>
                      <TouchableOpacity onPress={() => setDatePickerVisible(false)}>
                        <Text style={[s.pickerDone, { color: P.accent }]}>Done</Text>
                      </TouchableOpacity>
                    </View>
                    <DateTimePicker mode="date" value={date} onChange={(_, d) => { if (d) setDate(d); }} display="spinner" themeVariant={isDarkMode ? 'dark' : 'light'} textColor={P.text} minimumDate={new Date()} style={{ width: '100%' }} />
                    <View style={{ height: Math.max(24, insets.bottom), backgroundColor: P.surface }} />
                  </View>
                </View>
              </Modal>
            ) : (
              <DateTimePicker mode="date" value={date} onChange={(_, d) => { setDatePickerVisible(false); if (d) setDate(d); }} display="default" minimumDate={new Date()} />
            )
          )}

          {timePickerVisible && (
            Platform.OS === 'ios' ? (
              <Modal transparent animationType="fade" visible={timePickerVisible}>
                <View style={s.pickerModalWrap}>
                  <TouchableOpacity style={s.pickerDismiss} activeOpacity={1} onPress={() => setTimePickerVisible(false)} />
                  <View style={[s.pickerSheet, { backgroundColor: P.surface }]}>
                    <View style={[s.pickerHeader, { borderBottomColor: P.border }]}>
                      <Text style={[s.pickerLabel, { color: P.text }]}>Select Time</Text>
                      <TouchableOpacity onPress={() => setTimePickerVisible(false)}>
                        <Text style={[s.pickerDone, { color: P.accent }]}>Done</Text>
                      </TouchableOpacity>
                    </View>
                    <DateTimePicker mode="time" value={time} onChange={(_, d) => { if (d) setTime(d); }} display="spinner" themeVariant={isDarkMode ? 'dark' : 'light'} textColor={P.text} style={{ width: '100%' }} />
                    <View style={{ height: Math.max(24, insets.bottom), backgroundColor: P.surface }} />
                  </View>
                </View>
              </Modal>
            ) : (
              <DateTimePicker mode="time" value={time} onChange={(_, d) => { setTimePickerVisible(false); if (d) setTime(d); }} display="default" />
            )
          )}
        </KeyboardDismissView>
      </SafeAreaView>
      <DialogHost />
    </View>
  );
}

const s = StyleSheet.create({
  root:        { flex: 1 },
  safe:        { flex: 1 },
  keyboardView:{ flex: 1 },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header:      { flexDirection: 'row', alignItems: 'center', padding: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  title:       { fontSize: 20, fontWeight: '700' },
  subtitle:    { fontSize: 12, marginTop: 2 },
  closeBtn:    { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  backBtn:     { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 12 },

  stepRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 14 },
  stepBar:     { flex: 1, height: 2, marginHorizontal: 6 },
  stepDotWrap: { alignItems: 'center', gap: 4 },
  stepDot:     { width: 9, height: 9, borderRadius: 4.5, borderWidth: 2 },
  stepLabel:   { fontSize: 11, fontWeight: '600' },

  content:     { padding: 20, gap: 9, paddingBottom: 34 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  changeLink:  { fontSize: 13, fontWeight: '700' },
  label:       { fontSize: 14, fontWeight: '700', marginTop: 8 },
  empty:       { fontSize: 13, lineHeight: 19, paddingVertical: 8 },
  searchRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  choice:      { minHeight: 54, paddingHorizontal: 13, paddingVertical: 10, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  choiceTitle: { fontSize: 14, fontWeight: '600' },
  choiceMeta:  { fontSize: 12, marginTop: 2 },
  whenBtn:     { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 12, borderRadius: 10 },
  whenText:    { fontSize: 13, fontWeight: '600' },
  whenTabs:    { flexDirection: 'row', height: 42, borderRadius: 10, padding: 4, marginTop: 4 },
  slotsWrap:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  slotChip:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, borderWidth: 1 },
  slotChipOn:  { borderWidth: 2 },
  slotCheckIcon:{ marginRight: 4 },
  slotText:    { fontSize: 13, fontWeight: '600' },
  slotTextOn:  { fontWeight: '700' },
  slotsLoading:{ paddingVertical: 12, alignItems: 'flex-start' },
  slotsEmpty:  { fontSize: 12, lineHeight: 17, marginTop: 4 },
  conflict:    { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 8 },
  conflictTitle:{ fontSize: 13, fontWeight: '700' },
  conflictSub: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  conflictBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6, marginTop: 8 },
  conflictBtnText:{ fontSize: 12, fontWeight: '700' },
  safetyBox:   { borderWidth: 1, borderRadius: 10, padding: 12, gap: 4 },
  safetyLine:  { fontSize: 12, lineHeight: 17 },
  ackRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 8 },
  ackText:     { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  notesInput:  { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 44 },
  saveBtn:     { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  saveBtnDim:  { opacity: 0.6 },
  saveTxt:     { fontSize: 15, fontWeight: '700' },

  // Native time/date picker bottom sheet (iOS). Overlay and sheet are siblings
  // so the overlay colour never bleeds through the sheet's own background.
  pickerModalWrap: { flex: 1, flexDirection: 'column' },
  pickerDismiss:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  pickerSheet:     { borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  pickerHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  pickerLabel:     { fontSize: 15, fontWeight: '600' },
  pickerDone:      { fontSize: 15, fontWeight: '700' },
});
